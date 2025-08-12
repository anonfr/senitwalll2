// /api/submit.js
import { sb } from "./_supabase.js";

const clean = s => s?.trim().replace(/^@+/, "").toLowerCase() || "";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const handle = clean(req.body?.handle);
    if (!handle) return res.status(400).json({ error: "Invalid handle" });

    const baseUrl = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    // 1) Try Twitter first
    let pfpUrl = null;
    let source = "twitter";
    try {
      const r = await fetch(`${baseUrl}/api/twitter-pfp?u=${encodeURIComponent(handle)}`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        pfpUrl = j?.url || null;
      }
    } catch (_) {}

    // 2) Fallback via our proxy to Unavatar if needed
    if (!pfpUrl) {
      const unav = `https://unavatar.io/twitter/${encodeURIComponent(handle)}`;
      pfpUrl = `${baseUrl}/api/img?u=${encodeURIComponent(unav)}`;
      source = "fallback";
    }

    // 3) Save only the columns Postgres accepts (omit twitter_url)
    const client = sb();
    const { data, error } = await client
      .from("profiles")
      .upsert(
        {
          handle,
          // twitter_url: intentionally omitted to avoid the constraint
          pfp_url: pfpUrl,
          last_refreshed: new Date().toISOString(),
        },
        { onConflict: "handle" }
      )
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ ok: true, profile: data, source });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}