// /api/refresh-fallbacks.js
import { sb } from "./_supabase.js";

/** ---- Config ---- */
const DEFAULT_SVG = "/img/default-pfp.svg";
const SECRET = process.env.REFRESH_SECRET;           // set on Vercel
const T1 = process.env.TWITTER_BEARER;               // your primary token
const T2 = process.env.TWITTER_BEARER_TOKEN_2 || ""; // optional 2nd token

/** Decide if a URL needs refreshing (fallbacks or placeholders) */
function looksLikeFallback(u = "") {
  if (!u) return true;
  try {
    if (u === DEFAULT_SVG) return true;

    // allow parsing of relative URLs like /api/img?u=...
    const url = new URL(u, "https://dummy.base");
    const host = url.hostname;

    // raw unavatar
    if (host === "unavatar.io") return true;

    // our proxy to unavatar: /api/img?u=https://unavatar.io/...
    if (host.endsWith("vercel.app") && url.pathname.startsWith("/api/img")) {
      const inner = url.searchParams.get("u") || "";
      if (inner.includes("unavatar.io/twitter/")) return true;
    }

    // weserv that points to unavatar
    if (host === "images.weserv.nl") {
      const inner = url.searchParams.get("url") || "";
      if (decodeURIComponent(inner).includes("unavatar.io/twitter/")) return true;
    }

    return false;
  } catch {
    return true; // malformed => treat as refreshable
  }
}

/** Call Twitter API v2 for a handle with a specific bearer token */
async function fetchTwitterPfpDirect(handle, bearer) {
  if (!bearer) return { ok: false, status: 401, error: "missing bearer" };

  const url =
    `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=profile_image_url`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    cache: "no-store",
  });

  if (!r.ok) return { ok: false, status: r.status, error: `twitter ${r.status}` };

  const j = await r.json();
  const base = j?.data?.profile_image_url;
  if (!base) return { ok: false, status: 404, error: "no profile_image_url" };

  // upgrade to higher-res if possible
  const hi = base.replace("_normal.", "_400x400.").replace("_normal.", ".");
  return { ok: true, url: hi };
}

/** Try T1, then T2. Return which token was used. */
async function fetchTwitterPfpWithFallback(handle) {
  const r1 = await fetchTwitterPfpDirect(handle, T1);
  if (r1.ok) return { ...r1, tokenUsed: 1 };

  if (T2) {
    const r2 = await fetchTwitterPfpDirect(handle, T2);
    if (r2.ok) return { ...r2, tokenUsed: 2 };
    return { ...r2, tokenUsed: 2 };
  }
  return { ...r1, tokenUsed: 1 };
}

export default async function handler(req, res) {
  // Allow GET or POST and require secret
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Use GET or POST" });
  }
  if (!SECRET) return res.status(500).json({ error: "REFRESH_SECRET not set" });

  const provided = req.query.secret || req.headers["x-refresh-secret"];
  if (provided !== SECRET) return res.status(401).json({ error: "Unauthorized" });

  try {
    const client = sb();

    const { data: rows, error } = await client
      .from("profiles")
      .select("id, handle, pfp_url");

    if (error) throw error;

    let scanned = 0, refreshed = 0, kept = 0, errors = 0;
    const refreshedHandles = [];
    let usedToken1 = 0, usedToken2 = 0;

    // process sequentially to be gentle on rate limits
    for (const row of rows || []) {
      scanned++;
      const handle = (row?.handle || "").trim().toLowerCase();
      const pfp = row?.pfp_url || "";
      if (!handle) { kept++; continue; }

      if (!looksLikeFallback(pfp)) { kept++; continue; }

      const tw = await fetchTwitterPfpWithFallback(handle);
      if (!tw.ok) { kept++; continue; }

      const { error: upErr } = await client
        .from("profiles")
        .update({
          pfp_url: tw.url,                        // direct pbs.twimg.com URL
          last_refreshed: new Date().toISOString()
        })
        .eq("handle", handle);

      if (upErr) {
        errors++;
      } else {
        refreshed++;
        refreshedHandles.push(handle);
        if (tw.tokenUsed === 1) usedToken1++; else usedToken2++;
      }

      // small delay
      await new Promise(r => setTimeout(r, 120));
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      scanned,
      refreshed,
      kept,
      errors,
      usedToken1,
      usedToken2,
      refreshedHandles
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "server error" });
  }
}