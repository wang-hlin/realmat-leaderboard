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

## Deploy to GitHub Pages

The repository already includes a workflow at `.github/workflows/deploy-pages.yml`.

1. Push code to the `main` branch
2. Go to `Settings -> Pages` in the GitHub repository
3. Set `Source` to `GitHub Actions`
4. Wait for the Actions workflow to finish

Then access:

[https://wang-hlin.github.io/realmat-leaderboard/](https://wang-hlin.github.io/realmat-leaderboard/)

## Data

- Data file: `data/metrics_agg_filtered.csv`
- The page loads and renders data fully on the client side (no backend required).
