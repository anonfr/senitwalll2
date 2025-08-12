// /api/submit.js
import { sb } from "./_supabase.js";

const TTL_DAYS = 3;                              // How long a saved PFP is “fresh”
const FRESH_MS = TTL_DAYS * 24 * 60 * 60 * 1000; // ms

const clean = (h) => h?.trim().replace(/^@+/, "").toLowerCase() || "";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const handle = clean(req.body?.handle);
    if (!handle) return res.status(400).json({ error: "Invalid handle" });

    const client = sb();

    // 1) Check if we already have this user cached
    const { data: existing, error: selErr } = await client
      .from("profiles")
      .select("id, handle, twitter_url, pfp_url, last_refreshed")
      .eq("handle", handle)
      .maybeSingle?.() ?? { data: null };

    if (selErr) throw selErr;

    const now = Date.now();
    const last = existing?.last_refreshed ? new Date(existing.last_refreshed).getTime() : 0;
    const isFresh = existing?.pfp_url && last && (now - last) < FRESH_MS;

    // If fresh, serve immediately — no call to X/Twitter
    if (isFresh) {
      return res.status(200).json({ ok: true, profile: existing, source: "cache" });
    }

    // Helper: save record
    const save = async (pfpUrl) => {
      const twitterUrl = `https://x.com/${handle}`;
      const { data, error } = await client
        .from("profiles")
        .upsert(
          { handle, twitter_url: twitterUrl, pfp_url: pfpUrl, last_refreshed: new Date().toISOString() },
          { onConflict: "handle" }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    };

    // Helper: call our own twitter-pfp endpoint
    const fetchFromTwitter = async () => {
      const baseUrl = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
      const r = await fetch(`${baseUrl}/api/twitter-pfp?u=${encodeURIComponent(handle)}`, { cache: "no-store" });
      if (!r.ok) {
        const body = await safeText(r);
        const err = new Error(body || `X API ${r.status}`);
        err.status = r.status;
        err.retryAfter = r.headers.get("retry-after");
        throw err;
      }
      const { url } = await r.json();
      return url;
    };

    // 2) If we have an old image, serve it now and refresh in background
    if (existing?.pfp_url) {
      queueMicrotask(async () => {
        try {
          const freshUrl = await fetchFromTwitter();
          await save(freshUrl);
        } catch {
          // ignore; keep last good
        }
      });
      return res.status(200).json({ ok: true, profile: existing, source: "stale-serve-bg-refresh" });
    }

    // 3) First time we see this handle — try to fetch now
    try {
      const freshUrl = await fetchFromTwitter();
      const saved = await save(freshUrl);
      return res.status(200).json({ ok: true, profile: saved, source: "twitter" });
    } catch (e) {
      // Hard fallback for brand-new users when X rate-limits us:
      // show a default local SVG so the card still appears.
      const placeholder = "/img/default-pfp.svg"; // you already have this file
      const saved = await save(placeholder);
      return res.status(200).json({
        ok: true,
        profile: saved,
        source: "fallback-placeholder",
        note: e.message,
        retryAfter: e.retryAfter || "60"
      });
    }

  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}

async function safeText(resp) {
  try { return await resp.text(); } catch { return ""; }
}