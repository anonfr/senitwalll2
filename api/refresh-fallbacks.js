// /api/refresh-fallbacks.js
import { sb } from "./_supabase.js";

/** ---- Config ---- */
const DEFAULT_SVG = "/img/default-pfp.svg";
const SECRET = process.env.REFRESH_SECRET; // set on Vercel
const T1 = process.env.TWITTER_BEARER;           // primary (you said this name is already in Vercel)
const T2 = process.env.TWITTER_BEARER_TOKEN_2;   // secondary (optional extra capacity)

/** Determine if a stored URL needs refreshing */
function looksLikeFallback(u = "") {
  if (!u) return true;
  try {
    if (u === DEFAULT_SVG) return true;
    const url = new URL(u, "https://dummy.base"); // allows relative like /api/img?u=...
    const host = url.hostname;

    // raw unavatar
    if (host === "unavatar.io") return true;

    // our proxy to unavatar: /api/img?u=https://unavatar.io/...
    if (host && host.endsWith("vercel.app") && url.pathname.startsWith("/api/img")) {
      const inner = url.searchParams.get("u") || "";
      if (inner.includes("unavatar.io/twitter/")) return true;
    }

    // weserv wrapper that points to unavatar
    if (host === "images.weserv.nl") {
      const inner = url.searchParams.get("url") || "";
      if (decodeURIComponent(inner).includes("unavatar.io/twitter/")) return true;
    }

    return false;
  } catch {
    // if it's malformed, treat as fallback (so we try to fix it)
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

  // Upgrade to higher-res where possible
  const hi = base.replace("_normal.", "_400x400.").replace("_normal.", ".");
  return { ok: true, url: hi };
}

/** Try T1 then T2 */
async function fetchTwitterPfpWithFallback(handle) {
  // First token
  let r1 = await fetchTwitterPfpDirect(handle, T1);
  if (r1.ok) return r1;

  // If rate-limited or any error, try second token (if present)
  if (T2) {
    let r2 = await fetchTwitterPfpDirect(handle, T2);
    if (r2.ok) return r2;
    // Prefer the second error if both failed
    return r2;
  }
  return r1;
}

export default async function handler(req, res) {
  // Allow GET or POST, but require the secret
  const methodOK = req.method === "POST" || req.method === "GET";
  if (!methodOK) return res.status(405).json({ error: "Use GET or POST" });

  if (!SECRET) return res.status(500).json({ error: "REFRESH_SECRET not set" });
  const provided = req.query.secret || req.headers["x-refresh-secret"];
  if (provided !== SECRET) return res.status(401).json({ error: "Unauthorized" });

  try {
    const client = sb();

    // Pull all profiles (you can scope this further if needed)
    const { data: rows, error } = await client
      .from("profiles")
      .select("id, handle, pfp_url");

    if (error) throw error;

    let scanned = 0, refreshed = 0, kept = 0, errors = 0;

    // We’ll do sequential updates to be gentle on rate limits
    for (const row of rows || []) {
      scanned++;
      const handle = (row?.handle || "").trim().toLowerCase();
      const pfp = row?.pfp_url || "";

      if (!handle) { kept++; continue; }

      // Only touch fallbacks
      if (!looksLikeFallback(pfp)) { kept++; continue; }

      // Try to get a Twitter PFP (T1 then T2)
      const tw = await fetchTwitterPfpWithFallback(handle);
      if (!tw.ok) {
        // Couldn’t improve this one now — leave as-is; try next time
        kept++;
        continue;
      }

      // We got a direct pbs URL from Twitter; store it directly
      const newUrl = tw.url;

      const { error: upErr } = await client
        .from("profiles")
        .update({
          pfp_url: newUrl,
          last_refreshed: new Date().toISOString(),
        })
        .eq("handle", handle);

      if (upErr) {
        errors++;
      } else {
        refreshed++;
      }

      // Optional tiny delay to be extra gentle (tune as you like)
      await new Promise(r => setTimeout(r, 120));
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, scanned, refreshed, kept, errors });
  } catch (e) {
    return res.status(500).json({ error: e.message || "server error" });
  }
}