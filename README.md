# Kovan 🐝

**Notes, together.** A calm, collaborative notes app that blends the best of
Notion, Obsidian, Evernote, Apple Notes and OneNote — in **English, Türkçe and Polski**.

| Idea borrowed from | What you get in Kovan |
| --- | --- |
| Notion | `/` slash menu for blocks, shared notebooks, live collaboration |
| Obsidian | Markdown, `[[wiki links]]`, backlinks, graph view, export to `.md` |
| Evernote | Notebooks, `#tags`, instant search (`Ctrl/Cmd + K`) |
| Apple Notes | Pinned notes, tap-to-check checklists, list auto-continue, zero clutter |
| OneNote | Notebooks shared with friends, everything auto-saved |

Kovan's own twist: a honeycomb look, hexagon graph nodes and a deliberately small feature set.

## Run locally

```bash
npm install
npm run dev
```

Without Supabase keys the app runs in **local mode** (one private notebook stored in your browser).

## Enable sharing & collaboration (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and run it.
3. **Authentication → Providers → Google**: enable it with a Google OAuth client
   (Google Cloud Console → *APIs & Services → Credentials → OAuth client ID → Web application*).
   Use the callback URL shown by Supabase as the *Authorized redirect URI*.
4. **Authentication → URL Configuration**: set *Site URL* to your Vercel address and add it
   (and `http://localhost:5173`) to *Redirect URLs*.
5. **Project Settings → API**: copy the *Project URL* and the *anon public* key.
6. Put them in Vercel (**Project → Settings → Environment Variables**) as
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then redeploy.
   For local work copy `.env.example` to `.env`.

### Inviting friends

Open the notebook menu → **Share** → copy the invite link. Anyone who opens it and signs in
with Google joins the notebook. *Reset link* invalidates the old link.

## Deploy

Push to GitHub and import the repo in Vercel (framework preset: Vite). Every push to `main` redeploys.

## Stack

Vite · React · Supabase (Auth, Postgres with row-level security, Realtime) · marked + DOMPurify.
