// /api/img.js
import { pipeline } from "node:stream";
import { promisify } from "node:util";
const pump = promisify(pipeline);

const ALLOWED_HOSTS = new Set([
  "pbs.twimg.com",
  "abs.twimg.com",
  // Add more if you ever need them:
  // "ton.twitter.com",
  // "unavatar.io",
]);

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).send("Method Not Allowed");
    }

    const u = req.query.u;
    if (!u) return res.status(400).send("missing url");

    let url;
    try {
      url = new URL(u);
    } catch {
      return res.status(400).send("invalid url");
    }

    if (url.protocol !== "https:") {
      return res.status(400).send("https only");
    }
    if (!ALLOWED_HOSTS.has(url.hostname)) {
      return res.status(400).send("host not allowed");
    }

    // Timeout handling
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 10_000); // 10s
    const upstream = await fetch(url.toString(), {
      // behave like a browser a bit
      headers: {
        "User-Agent": "Mozilla/5.0 (AztecWall proxy)",
        "Accept": "image/avif,image/webp,image/apng,image/*;q=0.8,*/*;q=0.5",
      },
      redirect: "follow",
      signal: ac.signal,
    }).catch((e) => ({ ok: false, status: 502, _err: e }));
    clearTimeout(to);

    if (!upstream?.ok || !upstream.body) {
      return res.status(upstream?.status || 502).send("upstream error");
    }

    // Headers
    const ct = upstream.headers.get("content-type") || "image/jpeg";
    const cl = upstream.headers.get("content-length");
    res.setHeader("Content-Type", ct);
    if (cl) res.setHeader("Content-Length", cl);

    // Cache aggressively at the edge/CDN, fine for immutable avatars
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Stream it through (no buffering in memory)
    res.statusCode = 200;
    await pump(upstream.body, res);
  } catch (e) {
    // AbortError => timeout
    if (e?.name === "AbortError") return res.status(504).send("upstream timeout");
    res.status(500).send("proxy error");
  }
}