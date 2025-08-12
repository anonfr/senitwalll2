// /api/img.js
export default async function handler(req, res) {
  try {
    const u = req.query.u;
    if (!u) return res.status(400).send("missing url");

    // Fetch upstream image (pretend to be a browser)
    const upstream = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0 (AztecWall)" }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send("upstream error");
    }

    // Pass through content-type and cache aggressively at the edge
    res.setHeader(
      "Cache-Control",
      "s-maxage=86400, stale-while-revalidate=604800"
    );
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "image/jpeg"
    );

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).send("proxy error");
  }
}