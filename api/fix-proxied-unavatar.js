import { sb } from "./_supabase.js";

export default async function handler(req, res) {
  try {
    const client = sb();

    // 1) Pull rows whose pfp_url still uses the proxy to Unavatar
    const { data, error } = await client
      .from("profiles")
      .select("id, pfp_url")
      .like("pfp_url", "%/api/img?u=%unavatar.io%")
      .limit(1000);

    if (error) throw error;

    if (!data || !data.length) {
      return res.status(200).json({ ok: true, scanned: 0, updated: 0 });
    }

    let updated = 0;

    for (const row of data) {
      try {
        // pfp_url like: https://your-app/api/img?u=<ENCODED_URL>
        const u = new URL(row.pfp_url);
        const encoded = u.searchParams.get("u") || "";
        const decoded = decodeURIComponent(encoded);

        // Only rewrite if it really is unavatar
        const target = new URL(decoded);
        if (target.hostname !== "unavatar.io") continue;

        // Write the direct Unavatar URL back
        const { error: upErr } = await client
          .from("profiles")
          .update({
            pfp_url: target.toString(),
            last_refreshed: new Date().toISOString(),
          })
          .eq("id", row.id);

        if (!upErr) updated++;
      } catch {
        // ignore bad rows
      }
    }

    return res.status(200).json({ ok: true, scanned: data.length, updated });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}