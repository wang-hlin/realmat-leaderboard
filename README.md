# RealMat-BaG Leaderboard

A static leaderboard for RealMat-BaG

## Features

- Scenario tabs: `Random Split`, `Feature OOD`, `LOMO`, `Chemical System`, `Periodic Group`, `Crystal Structure`
- Training mode filter: `All`, `With pretraining`, `Without pretraining`
- Method search, sortable columns, and CSV download for the current view
- LOMO category heatmap (MRAE)
- Number formatting:
  - 3 decimal places

## Project Structure

```text
.
├── index.html
├── app.js
├── style.css
└── data/
    └── metrics_agg_filtered.csv
```
## Access

[https://wang-hlin.github.io/realmat-leaderboard/](https://wang-hlin.github.io/realmat-leaderboard/)

## Experiment Site

This repo includes an experiment deployment workflow:

- `.github/workflows/deploy-experiment.yml`
- Trigger branch: `experiment`
- Target: Cloudflare Pages project `realmat-leaderboard-experiment`

Required repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

After setting the secrets, push to `experiment` to deploy an isolated experiment site URL.

## Data

- Data file: `data/metrics_agg_filtered.csv`
- The page loads and renders data fully on the client side (no backend required).

## Temporary Evaluation API (Local Test)

To test the `Submit New Model` flow with real metric calculation:

```bash
pip install -r backend/requirements.txt
uvicorn backend.app:app --reload --port 8000
```

Then open:

- `http://localhost:8000/index.html`
- `http://localhost:8000/submit.html`
