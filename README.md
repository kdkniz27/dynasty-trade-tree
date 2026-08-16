# Dynasty Trade Tree

Trace every trade in your Sleeper dynasty league forward through time —
what a player or pick became, who drafted with it, and everywhere it
went after that. Inspired by Steve Dangle's NHL "Trade Tree" videos.

This has been rebuilt from the original local Flask app into a **fully
static site**: no server, no cold starts, $0 to host, forever.

## How it works

```
data/generate_data.py   -->  web/public/data/trades.json  -->  React frontend (web/)
   (pulls from Sleeper           (one JSON file, every            (reads that file,
    once, on a schedule)          trade pre-built + named)         renders trees)
```

- **`data/generate_data.py`** is your old `dynasty_trade_tree.py`, refactored to fetch
  everything from Sleeper (league history, rosters, trades, drafts, players) and build a
  fully name-resolved tree for *every* trade in one pass. It writes a small
  `web/public/data/trades.json` index (for the sidebar list) plus one JSON file per trade
  in `web/public/data/trees/<trade_id>.json` — split into many small files instead of one
  giant one, both because GitHub rejects any single pushed file over 100 MB and because
  the frontend then only downloads the one tree you're actually looking at.
- **`.github/workflows/refresh-data.yml`** runs that script on a daily schedule (free, via
  GitHub Actions) and commits the updated JSON automatically. You can also trigger it
  manually any time from the Actions tab.
- **`web/`** is a React + Vite app that fetches that JSON at page load and renders the
  trees client-side — the same tree visualization as before (team-colored branches,
  player/pick rows, "drafted by" cards), just faster and dynamically componentized instead
  of hand-built DOM strings.
- **`.github/workflows/deploy.yml`** builds the React app and publishes it to **GitHub
  Pages** (also free) on every push to `main` — including the automatic commits from the
  data refresh, so new trades show up on the live site with no manual redeploy.

No Flask, no Render, no server bill, no spin-down delay.

## One-time setup

1. **Create a GitHub repo** and push this folder to it (as `main`).

2. **Enable Pages**: repo Settings → Pages → Source → **GitHub Actions**. (Just select
   the source; the workflow handles the rest.)

3. *(Optional)* If your league ID ever changes, set it as a repo variable instead of
   editing code: Settings → Secrets and variables → Actions → Variables →
   `SLEEPER_LEAGUE_ID`. It defaults to the ID already in `generate_data.py` if you skip this.

4. **Run the data refresh once manually**: Actions tab → "Refresh trade data" → Run
   workflow. This populates `web/public/data/trades.json` for real (it ships with an
   empty placeholder so the site doesn't 404 before the first run).

5. **Run the deploy** (it should auto-trigger from step 4's commit, but you can also run
   it manually): Actions tab → "Deploy site" → Run workflow.

6. Your site is live at `https://<your-username>.github.io/<repo-name>/`.

After that, it runs itself — data refreshes daily, the site rebuilds automatically
whenever data changes.

## Local development

```bash
# Generate (or refresh) the data file
cd data
pip install -r requirements.txt
python generate_data.py          # writes ../web/public/data/trades.json

# Run the frontend
cd ../web
npm install
npm run dev                      # http://localhost:5173
```

To build for production locally: `npm run build` (output in `web/dist`).

## Notes on the free-tier choices

- **GitHub Pages** over Render: Pages has no sleep/cold-start behavior and no compute
  cost since it's just static files — a better fit than a free Render *web service*,
  which spins down after 15 minutes idle and takes ~30-50s to wake back up.
- **GitHub Actions cron** replaces the old "Refresh Data" button — same idea, just
  running on a schedule against Sleeper instead of on-demand against your own laptop.
- **Monetization**: since this is a plain static site, standard ad networks (e.g. Google
  AdSense) or a "support this project" link can be dropped straight into the React app
  with no infrastructure changes. If you eventually want something that needs real
  server logic (accounts, payments, multi-league support), a small serverless function
  (Cloudflare Workers / Pages Functions has a generous free tier) can be layered on
  later without giving up the static hosting for everything else.

## What changed from the old version

- `dynasty_trade_tree.py` → `data/generate_data.py`: same fetch/build logic, but it now
  builds and resolves *every* trade's tree up front (instead of on-demand per request)
  and writes one JSON file instead of printing to a console or serving from Flask memory.
- `trade_tree_app.py` (Flask + inline HTML/JS) → `web/` (React + Vite): the same visual
  language (team-colored branches, asset rows, "drafted by" cards, hop connectors) is now
  built from real components instead of manual DOM manipulation strings, which makes it
  much easier to iterate on visuals next.
- `players.json` is no longer something you need to keep updated by hand — the generator
  pulls it fresh from Sleeper every time it runs.
