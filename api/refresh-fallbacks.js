// /api/refresh-fallbacks.js
import { sb } from "./_supabase.js";

const clean = s => s?.trim().replace(/^@+/, "").toLowerCase() || "";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const baseUrl = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const client = sb();

    // 1) Find rows with default PFP or unavatar fallback
    const { data: rows, error } = await client
      .from("profiles")
      .select("*")
      .or("pfp_url.eq./img/default-pfp.svg,pfp_url.ilike.%unavatar.io/twitter/%");

    if (error) throw error;
    if (!rows?.length) return res.json({ ok: true, scanned: 0, refreshed: 0 });

    let refreshed = 0;
    let kept = 0;
    let errors = 0;

    for (const row of rows) {
      const handle = clean(row.handle);
      if (!handle) continue;

      let pfpUrl = row.pfp_url;
      let success = false;

      // --- Try Twitter API first ---
      try {
        const r = await fetch(`${baseUrl}/api/twitter-pfp?u=${encodeURIComponent(handle)}`, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (j?.url) {
            pfpUrl = j.url;
            success = true;
          }
        }
      } catch { /* ignore */ }

      // --- If Twitter failed, try Unavatar ---
      if (!success) {
        try {
          const unav = `https://unavatar.io/twitter/${handle}`;
          const resp = await fetch(unav);
          if (resp.ok) {
            pfpUrl = `${baseUrl}/api/img?u=${encodeURIComponent(unav)}`;
            success = true;
          }
        } catch { /* ignore */ }
      }

      // --- Only update if we found a valid working image ---
      if (success && pfpUrl) {
        const { error: upErr } = await client
          .from("profiles")
          .update({
            pfp_url: pfpUrl,
            last_refreshed: new Date().toISOString(),
          })
          .eq("handle", handle);

        if (upErr) {
          errors++;
        } else {
          refreshed++;
        }
      } else {
        kept++;
      }
    }

    return res.json({
      ok: true,
      scanned: rows.length,
      refreshed,
      kept,
      errors,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}