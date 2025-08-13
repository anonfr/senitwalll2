// /api/refresh-fallbacks.js
import { sb } from "./_supabase.js";

/* ---------- Config ---------- */
const DEFAULT_SVG = "/img/default-pfp.svg";
const SECRET      = process.env.REFRESH_SECRET;          // set on Vercel
const T1          = process.env.TWITTER_BEARER;          // your existing token
const T2          = process.env.TWITTER_BEARER_TOKEN_2;  // optional 2nd token

/* Decide if a stored URL still looks like a fallback we should try to fix */
function looksLikeFallback(u = "") {
  if (!u) return true;                      // empty -> refresh
  try {
    if (u.includes(DEFAULT_SVG)) return true;

    const url  = new URL(u, "https://dummy.base"); // allow relative /api/img?u=...
    const host = url.hostname;

    // raw unavatar
    if (host === "unavatar.io") return true;

    // our proxy: /api/img?u=...
    if (host.endsWith("vercel.app") && url.pathname.startsWith("/api/img")) {
      const inner = decodeURIComponent(url.searchParams.get("u") || "");
      if (inner.includes("unavatar.io/twitter/")) return true;
      if (inner.includes(DEFAULT_SVG)) return true;
    }

    // weserv wrapper
    if (host === "images.weserv.nl") {
      const inner    = decodeURIComponent(url.searchParams.get("url") || "");
      const fallback = decodeURIComponent(url.searchParams.get("default") || "");
      // weserv -> unavatar OR weserv falling back to our default svg
      if (inner.includes("unavatar.io/twitter/")) return true;
      if (fallback.includes(DEFAULT_SVG)) return true;
    }

    // Otherwise assume it's good (e.g., pbs.twimg.com)
    return false;
  } catch {
    // malformed -> try to fix it
    return true;
  }
}

/* Call Twitter v2 directly with a specific bearer */
async function fetchTwitterPfpDirect(handle, bearer) {
  if (!bearer) return { ok: false, status: 401, error: "missing bearer" };

  const url = `https://api.x.com/2/users/by/username/${encodeURIComponent(
    handle
  )}?user.fields=profile_image_url`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    cache: "no-store",
  });

  if (!r.ok) return { ok: false, status: r.status, error: `twitter ${r.status}` };

  const j = await r.json();
  const base = j?.data?.profile_image_url;
  if (!base) return { ok: false, status: 404, error: "no profile_image_url" };

  // Prefer higher-res where available
  const hi = base.replace("_normal.", "_400x400.").replace("_normal.", ".");
  return { ok: true, url: hi };
}

/* Try T1, then T2 if needed */
async function fetchTwitterPfpWithFallback(handle) {
  const r1 = await fetchTwitterPfpDirect(handle, T1);
  if (r1.ok) return { ...r1, tokenIdx: 1 };

  if (T2) {
    const r2 = await fetchTwitterPfpDirect(handle, T2);
    if (r2.ok) return { ...r2, tokenIdx: 2 };
    return { ...r2, tokenIdx: 2 };
  }
  return { ...r1, tokenIdx: 1 };
}

/* ---------- API Route ---------- */
export default async function handler(req, res) {
  // allow GET or POST, require secret
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

    let scanned = 0,
      refreshed = 0,
      kept = 0,
      errors = 0,
      usedToken1 = 0,
      usedToken2 = 0;
    const refreshedHandles = [];

    for (const row of rows || []) {
      scanned++;

      const handle = (row?.handle || "").trim().toLowerCase();
      const pfp    = row?.pfp_url || "";
      if (!handle) { kept++; continue; }

      // Only touch entries that still look like a fallback
      if (!looksLikeFallback(pfp)) { kept++; continue; }

      const tw = await fetchTwitterPfpWithFallback(handle);
      if (!tw.ok) { kept++; continue; }

      if (tw.tokenIdx === 1) usedToken1++; else if (tw.tokenIdx === 2) usedToken2++;

      const { error: upErr } = await client
        .from("profiles")
        .update({
          pfp_url: tw.url,
          last_refreshed: new Date().toISOString(),
        })
        .eq("handle", handle);

      if (upErr) {
        errors++;
      } else {
        refreshed++;
        refreshedHandles.push(handle);
      }

      // small delay to be gentle with rate limits
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
      refreshedHandles,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "server error" });
  }
}