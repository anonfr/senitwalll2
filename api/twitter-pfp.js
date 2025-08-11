export default async function handler(req, res) {
  try {
    const token = process.env.TWITTER_BEARER;
    if (!token) return res.status(500).json({ error: "TWITTER_BEARER not set" });

    const raw = (req.query.u || "").toString().trim();
    const handle = raw.replace(/^@+/, "");
    if (!handle) return res.status(400).json({ error: "Missing ?u=handle" });

    const url = `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=profile_image_url`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });

    if (!r.ok) return res.status(r.status).json({ error: `Upstream ${r.status}` });

    const data = await r.json();
    const base = data?.data?.profile_image_url;
    if (!base) return res.status(404).json({ error: "No profile_image_url" });

    // upgrade to hi-res
    const hi = base.replace("_normal.", "_400x400.").replace("_normal.", ".");
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json({ handle, url: hi, raw: base });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}