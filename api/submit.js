import { sb } from "./_supabase.js";

const cleanHandle = (h) => h?.trim().replace(/^@+/, "").toLowerCase() || "";
const isValidHandle = (h) => /^[a-z0-9_]{1,15}$/.test(h); // X handle rules-ish

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { handle } = req.body || {};
    const h = cleanHandle(handle);
    if (!h || !isValidHandle(h)) {
      return res.status(400).json({ error: "Invalid handle" });
    }

    // Build absolute URL to your own API
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host  = req.headers.host;
    const baseUrl = `${proto}://${host}`;

    // Fetch avatar via your internal endpoint, with a timeout
    const ac = new AbortController();
    const t  = setTimeout(() => ac.abort(), 10_000); // 10s
    const resp = await fetch(
      `${baseUrl}/api/twitter-pfp?u=${encodeURIComponent(h)}`,
      { signal: ac.signal }
    ).catch((e) => ({ ok: false, _err: e }));
    clearTimeout(t);

    if (!resp?.ok) {
      const msg = await safeText(resp);
      return res.status(400).json({ error: msg || "Could not fetch PFP" });
    }

    const { url: pfp } = await resp.json();
    const twitterUrl = `https://x.com/${h}`;

    // Save (or update) in Supabase — ensure a unique index on profiles.handle
    const client = sb();
    const { data, error } = await client
      .from("profiles")
      .upsert(
        {
          handle: h,
          twitter_url: twitterUrl,
          pfp_url: pfp,
          last_refreshed: new Date().toISOString(),
        },
        { onConflict: "handle" } // <-- must match your unique constraint
      )
      .select()
      .single();

    if (error) {
      // Common gotcha: onConflict column doesn’t match unique constraint
      // Surface the message so you can fix schema quickly.
      return res.status(500).json({ error: error.message || "DB error" });
    }

    return res.status(200).json({ ok: true, profile: data });
  } catch (e) {
    // AbortError => timeout; handle nicely
    if (e?.name === "AbortError") {
      return res.status(504).json({ error: "Upstream timeout" });
    }
    return res.status(500).json({ error: e.message || "Server error" });
  }
}

async function safeText(resp) {
  try { return await resp.text(); } catch { return ""; }
}