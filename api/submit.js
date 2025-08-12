import { sb } from "./_supabase.js";

const cleanHandle = h => h?.trim().replace(/^@+/, "").toLowerCase() || "";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { handle } = req.body || {};
    const h = cleanHandle(handle);
    if (!h) return res.status(400).json({ error: "Invalid handle" });

    // Use Unavatar directly
    const pfp = `https://unavatar.io/twitter/${encodeURIComponent(h)}`;

    const client = sb();
    const { data, error } = await client
      .from("profiles")
      .upsert(
        {
          handle: h,
          pfp_url: pfp,                     // ✅ just store the unavatar URL
          last_refreshed: new Date().toISOString()
        },
        { onConflict: "handle" }
      )
      .select()
      .single();

    if (error) throw error;
    return res.status(200).json({ ok: true, profile: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}