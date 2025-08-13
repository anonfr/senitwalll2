// api/refresh-fallbacks.js
import { sb } from "./_supabase.js";

const CLEAN = s => (s || "").trim();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  try {
    const client = sb();

    // Optional query controls
    const limit  = Math.min(parseInt(req.query.limit || "40", 10) || 40, 200); // scan at most 200 at once
    const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);
    const throttleMs = Math.max(parseInt(req.query.throttle || "250", 10) || 250, 0);

    // 1) Fetch only rows that *look* bad
    // - pfp_url contains "fallback.png" (any http/https/proxy)  ✅
    // - OR pfp_url is your local default svg                     ✅
    // - OR pfp_url is an unavatar twitter URL (we will try upgrading it; many will succeed)
    const { data: rows, error } = await client
      .from("profiles")
      .select("id, handle, twitter_url, pfp_url, last_refreshed")
      .or(
        [
          "pfp_url.ilike.%fallback.png%",
          "pfp_url.eq./img/default-pfp.svg",
          "pfp_url.ilike.%unavatar.io/twitter/%"
        ].join(",")
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const baseUrl = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    let scanned = rows?.length || 0;
    let refreshed = 0;
    let kept = 0;
    let errs = 0;

    for (const row of rows || []) {
      const handle = CLEAN(row.handle).replace(/^@+/, "").toLowerCase();
      if (!handle) { kept++; continue; }

      let newPfp = null;
      let usedTwitter = false;

      // 2) Try Twitter first (best quality)
      try {
        const r = await fetch(`${baseUrl}/api/twitter-pfp?u=${encodeURIComponent(handle)}`, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (j?.url) {
            newPfp = j.url;
            usedTwitter = true;
          }
        }
      } catch (_) {
        // ignore, we’ll fallback
      }

      // 3) Fallback to unavatar (proxied through our /api/img) if twitter wasn’t used
      if (!newPfp) {
        const unav = `https://unavatar.io/twitter/${encodeURIComponent(handle)}`;
        newPfp = `${baseUrl}/api/img?u=${encodeURIComponent(unav)}`;
      }

      // If nothing changed, skip update
      if (newPfp && newPfp !== row.pfp_url) {
        const { error: upErr } = await client
          .from("profiles")
          .update({
            pfp_url: newPfp,
            last_refreshed: new Date().toISOString(),
          })
          .eq("id", row.id);

        if (upErr) { errs++; }
        else { refreshed++; }
      } else {
        kept++;
      }

      // Be gentle with upstream
      if (throttleMs) await sleep(throttleMs);
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, scanned, refreshed, kept, errors: errs });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}