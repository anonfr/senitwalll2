import { sb } from "./_supabase.js";

const clean = s => s?.trim().replace(/^@+/, "").toLowerCase() || "";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const handle = clean(req.body?.handle);
    if (!handle) return res.status(400).json({ error: "Invalid handle" });

    const baseUrl = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const twitterUrl = `https://x.com/${encodeURIComponent(handle)}`;

    // 1) Try Twitter first
    let pfpUrl = null;
    let rateLimited = false;

    try {
      const r = await fetch(`${baseUrl}/api/twitter-pfp?u=${encodeURIComponent(handle)}`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        pfpUrl = j?.url || null;
      } else if (r.status === 429) {
        rateLimited = true;
      } else {
        // other upstream failure – leave pfpUrl null so we try fallback below
      }
    } catch {
      // network error – leave pfpUrl null so we try fallback below
    }

    // 2) Fallback only if we don't have a pfp yet
    if (!pfpUrl) {
      // proxy Unavatar through our own /api/img to avoid CORS/cache issues
      const unav = `https://unavatar.io/twitter/${encodeURIComponent(handle)}`;
      const proxied = `${baseUrl}/api/img?u=${encodeURIComponent(unav)}`;
      // We could optionally verify it returns 200, but Unavatar is very reliable.
      pfpUrl = proxied;
    }

    // 3) Save to Supabase — twitter_url is ALWAYS present
    const client = sb();
    const { data, error } = await client
      .from("profiles")
      .upsert(
        {
          handle,
          twitter_url: twitterUrl,
          pfp_url: pfpUrl,
          last_refreshed: new Date().toISOString(),
        },
        { onConflict: "handle" }
      )
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      profile: data,
      source: rateLimited ? "fallback" : "twitter",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}