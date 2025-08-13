// /api/refresh-fallbacks.js
import { sb } from "./_supabase.js";

function isFallbackUrl(pfp, baseUrl) {
  if (!pfp) return false;

  // normalize
  const u = String(pfp).trim();

  // Unavatar fallback (http or https)
  if (u === "http://unavatar.io/fallback.png" || u === "https://unavatar.io/fallback.png") {
    return true;
  }

  // Your default svg (absolute OR relative)
  if (u === "/img/default-pfp.svg" || u === `${baseUrl}/img/default-pfp.svg`) {
    return true;
  }

  // Common proxy patterns that still point to the unavatar fallback
  // (images.weserv.nl or your own /api/img?u=...)
  try {
    const parsed = new URL(u, baseUrl);
    const host = parsed.host;
    const target = parsed.searchParams.get("u") || "";
    if (host.includes("images.weserv.nl") || parsed.pathname.startsWith("/api/img")) {
      if (target.includes("unavatar.io/fallback.png")) return true;
      if (target.endsWith("/img/default-pfp.svg")) return true;
    }
  } catch {
    // ignore URL parse errors
  }

  return false;
}

export default async function handler(req, res) {
  try {
    // --- auth
    const secret = process.env.REFRESH_SECRET || "";
    const auth = req.headers.authorization || "";
    const qsSecret = req.query.secret || "";
    if (secret && auth !== `Bearer ${secret}` && qsSecret !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const baseUrl = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const client = sb();

    // Pull a limited number to keep it cheap (adjust limit if you like)
    const { data: rows, error } = await client
      .from("profiles")
      .select("id, handle, pfp_url")
      .limit(1000);

    if (error) throw error;

    const candidates = (rows || []).filter(r => isFallbackUrl(r.pfp_url, baseUrl));
    if (candidates.length === 0) {
      return res.status(200).json({ ok: true, refreshed: 0, note: "No fallback rows matched." });
    }

    let refreshed = 0;
    for (const row of candidates) {
      try {
        const r = await fetch(`${baseUrl}/api/twitter-pfp?u=${encodeURIComponent(row.handle)}`, { cache: "no-store" });
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
        // ignore individual failures
      }
    }

    return res.status(200).json({ ok: true, refreshed, scanned: rows?.length || 0 });
  } catch (e) {
    return res.status(500).json({ error: e.message || "server error" });
  }
}