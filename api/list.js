// /api/list.js
import { sb } from "./_supabase.js";

export default async function handler(req, res) {
  try {
    const client = sb();
    const { data, error } = await client
      .from("profiles")
      .select("id, handle, twitter_url, pfp_url, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.setHeader("Cache-Control", "no-store"); // was long CDN cache
    return res.status(200).json(data || []);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}