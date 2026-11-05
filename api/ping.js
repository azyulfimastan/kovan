// Called once a day by Vercel Cron. A tiny database read keeps the free Supabase project
// from being paused for inactivity (it pauses after about a week with no traffic).
export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.status(500).json({ ok: false, error: 'missing env' })
  try {
    const r = await fetch(`${url}/rest/v1/workspaces?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    res.setHeader('Cache-Control', 'no-store')
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, at: new Date().toISOString() })
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) })
  }
}
