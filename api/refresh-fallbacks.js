// /api/refresh-fallbacks.js
import { sb } from "./_supabase.js";

export default async function handler(req, res) {
  try {
    // --- 1) Secure the endpoint
    const secret = process.env.REFRESH_SECRET || "";
    const auth = req.headers.authorization || "";
    const qsSecret = req.query.secret || "";

    if (secret && auth !== `Bearer ${secret}` && qsSecret !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // --- 2) Utilities
    const client = sb();
    const baseUrl = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const defaultSvg = `${baseUrl}/img/default-pfp.svg`;

    // --- 3) Fetch only rows with fallback images
    // (either unavatar fallback OR your local default svg)
    const { data: rows, error } = await client
      .from("profiles")
      .select("id, handle, pfp_url")
      .or(
        `pfp_url.eq.http://unavatar.io/fallback.png,pfp_url.eq.${defaultSvg}`
      );

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return res.status(200).json({ ok: true, refreshed: 0, note: "Nothing to refresh." });
    }

    // --- 4) Try to refresh each one via your twitter-pfp endpoint
    let refreshed = 0;
    for (const row of rows) {
      try {
        const r = await fetch(
          `${baseUrl}/api/twitter-pfp?u=${encodeURIComponent(row.handle)}`,
          { cache: "no-store" }
        );
        if (!r.ok) continue;
        const j = await r.json();
        const newUrl = j?.url || null;
        if (!newUrl) continue;

        const { error: upErr } = await client
          .from("profiles")
          .update({ pfp_url: newUrl, last_refreshed: new Date().toISOString() })
          .eq("handle", row.handle);

        if (!upErr) refreshed++;
      } catch {
        // ignore individual failures; continue with others
      }
    }

    // --- 5) Done
    return res.status(200).json({ ok: true, refreshed });
  } catch (e) {
    return res.status(500).json({ error: e.message || "server error" });
  }
}