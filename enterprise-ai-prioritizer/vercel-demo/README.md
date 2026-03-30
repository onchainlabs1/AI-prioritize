# Enterprise AI Prioritizer Demo

Static Vercel-friendly demo of the prioritization flow.

This copy preserves the original product UI, but replaces the Python API and SQLite persistence with browser `localStorage`. That makes it suitable for Vercel Hobby as a pure static site.

## What Changed

- No `server.py`
- No `/api/*`
- No SQLite
- Demo initiatives are seeded automatically in the browser on first load
- Changes made by a viewer stay only in that viewer's browser

## Demo Flow

1. `Home`: portfolio snapshot with seeded demo initiatives
2. `Submit`: add a new initiative directly in the browser
3. `Queue`: open assessment or decision review
4. `Assessment`: save scoring and move items into decision review
5. `Decisions`: register approve, hold, or reject outcomes
6. `Settings`: reset the demo scenario if you want to start over

## Local Preview

From this folder:

```bash
python3 -m http.server 8787
```

Open [index.html](./index.html) at `http://127.0.0.1:8787/index.html`.

## Vercel Deploy

Use this folder as the Vercel project root:

- `/Users/fabio/Documents/New project/enterprise-ai-prioritizer-vercel-demo`

Recommended setup:

1. Create a new Vercel project
2. Point the Root Directory to this folder
3. Framework Preset: `Other`
4. Build Command: leave empty
5. Output Directory: leave empty

Because this is a static site, Vercel can serve it directly without functions or a database.
