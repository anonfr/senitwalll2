// /api/refresh-fallbacks.js
import { sb } from "./_supabase.js";

function origin(req) {
  return `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
}

function toWeserv(srcUrl, defaultAbs) {
  const qs = new URLSearchParams({
    url: srcUrl,
    default: defaultAbs,
    w: "400",
    n: "-1",
    ttl: "31557600000",
    l: "9",
  });
  return `https://images.weserv.nl/?${qs.toString()}`;
}

function isBad(url) {
  if (!url) return true;
  const u = String(url);
  return (
    u.includes("/img/default-pfp.svg") ||   // default
    u.includes("unavatar.io") ||            // plain unavatar
    u.includes("/api/img?u=")               // old proxied unavatar
  );
}

export default async function handler(req, res) {
  try {
    const base = origin(req);
    const defaultAbs = `${base}/img/default-pfp.svg`;

    const client = sb();
    const { data: profiles, error } = await client
      .from("profiles")
      .select("*");

    if (error) throw error;

    const candidates = profiles.filter(p => isBad(p.pfp_url));
    let refreshed = 0, kept = 0, errors = 0;

    for (const p of candidates) {
      let finalUrl = null;

      // 1) Try Twitter API first
      try {
        const r = await fetch(
          `${base}/api/twitter-pfp?u=${encodeURIComponent(p.handle)}`,
          { cache: "no-store" }
        );
        if (r.ok) {
          const j = await r.json();
          const direct = j?.url; // should be pbs.twimg.com
          if (direct) finalUrl = toWeserv(direct, defaultAbs);
        }
      } catch { /* ignore */ }

      // 2) Fallback to Unavatar if Twitter didn't give us a URL
      if (!finalUrl) {
        const unav = `https://unavatar.io/twitter/${encodeURIComponent(p.handle)}`;
        finalUrl = toWeserv(unav, defaultAbs);
      }

      // If the row already equals what we’d set, skip updating
      if (String(p.pfp_url) === finalUrl) {
        kept++;
        continue;
      }

      // 3) Save back
      const { error: upErr } = await client
        .from("profiles")
        .update({
          pfp_url: finalUrl,
          last_refreshed: new Date().toISOString(),
        })
        .eq("handle", p.handle);

      if (upErr) { errors++; continue; }
      refreshed++;
    }

    res.status(200).json({
      ok: true,
      scanned: profiles.length,
      refreshed,
      kept,
      errors
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}