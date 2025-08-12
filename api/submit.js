// /api/submit.js
import { sb } from "./_supabase.js";

const cleanHandle = (h) => h?.trim().replace(/^@+/, "").toLowerCase() || "";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  try {
    const { handle } = req.body || {};
    const h = cleanHandle(handle);
    if (!h) return res.status(400).json({ ok: false, error: "Invalid handle" });

    // Build an Unavatar URL (no API key needed)
    const pfp = `https://unavatar.io/twitter/${encodeURIComponent(h)}`;

    const client = sb();
    const { data, error } = await client
      .from("profiles")
      .upsert(
        {
          handle: h,
          twitter_url: `https://twitter.com/${h}`,
          pfp_url: pfp,
          last_refreshed: new Date().toISOString(),
        },
        { onConflict: "handle" } // requires UNIQUE(handle)
      )
      .select()
      .single();

    if (error) throw error;
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, profile: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}