// /api/submit.js
import { sb } from "./_supabase.js";

/* =========================
   Config
========================= */
const BANNED_PARTIALS = [
  "porn",
  "pornhub",
  "xvideos",
  "elonmusk",
].map(s => s.toLowerCase());

const DEFAULT_PFP = "/img/default-pfp.svg";
const T1 = process.env.TWITTER_BEARER;            // your existing token
const T2 = process.env.TWITTER_BEARER_TOKEN_2;    // second token (optional)

/* =========================
   Helpers
========================= */
const startsWithAt = v => typeof v === "string" && v.trim().startsWith("@");
const clean = s => s?.trim().replace(/^@+/, "").toLowerCase() || "";

function isBannedPartial(handle) {
  // handle is already cleaned (no @, lowercase)
  return BANNED_PARTIALS.some(bad => handle.includes(bad));
}

async function fetchTwitterPfp(handle, bearer) {
  if (!bearer) return null;
  const url = `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=profile_image_url`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    cache: "no-store",
  });
  if (!r.ok) return null;

  const j = await r.json();
  const base = j?.data?.profile_image_url;
  if (!base) return null;

  // upgrade to 400x400 where possible
  return base.replace("_normal.", "_400x400.").replace("_normal.", ".");
}

/* =========================
   Handler
========================= */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const raw = req.body?.handle;

    // 1) Require it to start with '@'
    if (!startsWithAt(raw)) {
      return res.status(400).json({ error: "Please enter your @handle (must start with @)" });
    }

    // 2) Normalize handle and ban partial matches
    const handle = clean(raw);
    if (!handle) return res.status(400).json({ error: "Invalid handle" });
    if (isBannedPartial(handle)) {
      return res.status(400).json({ error: "This handle is not allowed" });
    }

    // 3) Try Twitter API with T1, then T2
    let pfpUrl = await fetchTwitterPfp(handle, T1);
    if (!pfpUrl && T2) {
      pfpUrl = await fetchTwitterPfp(handle, T2);
    }

    // 4) Fallback: Unavatar (JSON) → direct URL
    if (!pfpUrl) {
      try {
        const u = await fetch(
          `https://unavatar.io/twitter/${encodeURIComponent(handle)}?json`,
          { headers: { Accept: "application/json" }, cache: "no-store" }
        );
        if (u.ok) {
          const j = await u.json();
          if (j?.url) pfpUrl = j.url; // direct image URL
        }
      } catch (_) { /* ignore */ }
    }

    // 5) Final fallback: local default
    if (!pfpUrl) pfpUrl = DEFAULT_PFP;

    // 6) Save to Supabase (keep columns exactly as before)
    const client = sb();
    const { data, error } = await client
      .from("profiles")
      .upsert(
        {
          handle,
          pfp_url: pfpUrl,
          last_refreshed: new Date().toISOString(),
        },
        { onConflict: "handle" }
      )
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ ok: true, profile: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}