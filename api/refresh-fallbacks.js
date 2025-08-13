/** Determine if a stored URL needs refreshing */
function looksLikeFallback(u = "") {
  if (!u) return true;                        // empty -> refresh
  try {
    // plain default svg anywhere
    if (u.includes("/img/default-pfp.svg")) return true;

    const url = new URL(u, "https://dummy.base"); // allow relative like /api/img?u=...
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

      // weserv pointing to unavatar => refresh
      if (decInner.includes("unavatar.io/twitter/")) return true;

      // weserv falling back to our default svg => refresh
      if (decDefault.includes("/img/default-pfp.svg")) return true;
    }

    // otherwise, treat as "good" (pbs.twimg.com, etc.)
    return false;
  } catch {
    // if malformed, try to fix it by refreshing
    return true;
  }
}