// /api/refresh-fallbacks.js
import { sb } from "./_supabase.js";

/** ---- Config ---- */
const DEFAULT_SVG = "/img/default-pfp.svg";
const SECRET = process.env.REFRESH_SECRET; // set on Vercel
const T1 = process.env.TWITTER_BEARER;            // primary
const T2 = process.env.TWITTER_BEARER_TOKEN_2;    // secondary
const T3 = process.env.TWITTER_BEARER_TOKEN_3;    // tertiary

/** Determine if a stored URL needs refreshing */
function looksLikeFallback(u = "") {
  if (!u) return true;
  try {
    if (u.includes("/img/default-pfp.svg")) return true;

    const url = new URL(u, "https://dummy.base");
    const host = url.hostname;

    // raw unavatar
    if (host === "unavatar.io") return true;

    // our proxy to unavatar: /api/img?u=https://unavatar.io/twitter/...
    if (host.endsWith("vercel.app") && url.pathname.startsWith("/api/img")) {
      const inner = url.searchParams.get("u") || "";
      const dec = decodeURIComponent(inner);
      if (dec.includes("unavatar.io/twitter/")) return true;
      if (dec.includes("/img/default-pfp.svg")) return true;
    }

    // weserv wrapper
    if (host === "images.weserv.nl") {
      const inner = url.searchParams.get("url") || "";
      const deflt = url.searchParams.get("default") || "";
      const decInner = decodeURIComponent(inner);
      const decDefault = decodeURIComponent(deflt);
      if (decInner.includes("unavatar.io/twitter/")) return true;
      if (decDefault.includes("/img/default-pfp.svg")) return true;
    }

    return false;
  } catch {
    return true;
  }
}

/** Call Twitter API v2 for a handle with a specific bearer token */
async function fetchTwitterPfpDirect(handle, bearer) {
  if (!bearer) return { ok: false, status: 401, error: "missing bearer" };
  const url = `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=profile_image_url`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    cache: "no-store",
  });

  if (!r.ok) {
    return { ok: false, status: r.status, error: `twitter ${r.status}` };
  }

  const j = await r.json();
  const base = j?.data?.profile_image_url;
  if (!base) return { ok: false, status: 404, error: "no profile_image_url" };

  const hi = base.replace("_normal.", "_400x400.").replace("_normal.", ".");
  return { ok: true, url: hi };
}

/** Try T1 -> T2 -> T3 (stop at first success) */
async function fetchTwitterPfpWithFallback(handle) {
  const tokens = [T1, T2, T3];
  for (let idx = 0; idx < tokens.length; idx++) {
    const bearer = tokens[idx];
    const r = await fetchTwitterPfpDirect(handle, bearer);
    if (r.ok) {
      return { ...r, usedIndex: idx + 1 }; // 1,2,3
    }
  }
  return { ok: false, status: 429, error: "all tokens failed" };
}

export default async function handler(req, res) {
  const methodOK = req.method === "POST" || req.method === "GET";
  if (!methodOK) return res.status(405).json({ error: "Use GET or POST" });

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
    let usedToken1 = 0, usedToken2 = 0, usedToken3 = 0;
    const refreshedHandles = [];

    for (const row of rows || []) {
      scanned++;
      const handle = (row?.handle || "").trim().toLowerCase();
      const pfp = row?.pfp_url || "";
      if (!handle) { kept++; continue; }

      if (!looksLikeFallback(pfp)) { kept++; continue; }

      const tw = await fetchTwitterPfpWithFallback(handle);
      if (!tw.ok) { kept++; continue; }

      const newUrl = tw.url;
      const { error: upErr } = await client
        .from("profiles")
        .update({ pfp_url: newUrl, last_refreshed: new Date().toISOString() })
        .eq("handle", handle);

      if (upErr) {
        errors++;
      } else {
        refreshed++;
        refreshedHandles.push(handle);
        if (tw.usedIndex === 1) usedToken1++;
        if (tw.usedIndex === 2) usedToken2++;
        if (tw.usedIndex === 3) usedToken3++;
      }

      await new Promise(r => setTimeout(r, 120));
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      scanned, refreshed, kept, errors,
      usedToken1, usedToken2, usedToken3,
      refreshedHandles,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "server error" });
  }
}