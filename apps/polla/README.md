Steps
-----

Use proper node version

```sh
nvm use
```

Install node dependencies

```sh
pnpm install
```

Launch
------

```sh
pnpm run dev  
```

Open browser at http://localhost:4321

Automation Suggestions
---

For future updates (actual scores, knockout pairings), you have several options:

- GitHub Actions cron — run the import script daily/weekly to refresh scores as matches are played. Wiki editors update results within minutes of final whistle.
- Supabase Edge Function — a scheduled function that fetches Wikipedia and updates actual_score_a/actual_score_b for finished matches.
- (⭐) Manual trigger — keep the script and re-run with pnpm import-matches (it upserts on match_code, so it's idempotent).
- Webhook from FIFA API — if you later want a commercial data feed (e.g., Sportmonks, API-Football), swap the Wikipedia fetcher for an API call while keeping the same insert logic.
To calculate points, you'll need a function that compares predictions.predicted_score_a/_b against matches.actual_score_a/_b using the scoring_rules table. That's the natural next step after matches are populated.