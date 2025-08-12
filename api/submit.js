import { sb } from "./_supabase.js";

const cleanHandle = h => h?.trim().replace(/^@+/, "").toLowerCase() || "";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { handle } = req.body || {};
    const h = cleanHandle(handle);
    if (!h) return res.status(400).json({ error: "Invalid handle" });

    // Build the absolute URL to your own API
    const baseUrl = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    // Fetch the avatar using your existing twitter-pfp endpoint
    const r = await fetch(`${baseUrl}/api/twitter-pfp?u=${encodeURIComponent(h)}`);
    if (!r.ok) {
      const msg = await safeText(r);
      return res.status(400).json({ error: msg || "Could not fetch PFP" });
    }
    const { url: pfp } = await r.json();

    // Always set a twitter URL
    const twitterUrl = `https://x.com/${h}`;

    // Save (or update) in Supabase
    const client = sb();
    const { data, error } = await client
      .from("profiles")
      .upsert(
        {
          handle: h,
          twitter_url: twitterUrl,                // ✅ add this
          pfp_url: pfp,                           // from twitter-pfp API
          last_refreshed: new Date().toISOString()
        },
        { onConflict: "handle" }
      )
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ ok: true, profile: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}

// Small helper to avoid JSON parse issues on error responses
async function safeText(resp) {
  try { return await resp.text(); } catch { return ""; }
}