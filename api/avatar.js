// api/avatar.js
export default async function handler(req, res) {
  try {
    const u = (req.query.u || '').toString().trim().replace(/^@+/, '');
    if (!u) return res.status(400).send('Missing u');

    // You can also accept full URLs: ?u=https://unavatar.io/twitter/handle
    const upstream =
      u.startsWith('http://') || u.startsWith('https://')
        ? u
        : `https://unavatar.io/twitter/${encodeURIComponent(u)}`;

    // Fetch and stream the image
    const r = await fetch(upstream, {
      // some CDNs behave better with an explicit UA + no-referrer
      headers: { 'User-Agent': 'AztecWall/1.0', 'Referer': '' },
    });

    if (!r.ok) {
      res.status(r.status).send(`Upstream error ${r.status}`);
      return;
    }

    // pass through content-type, cache aggressively on the edge
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    // stream the body
    const buf = Buffer.from(await r.arrayBuffer());
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).send('avatar proxy failed');
  }
}