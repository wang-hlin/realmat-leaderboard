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

[https://realmat-leaderboard-experiment.pages.dev/](https://realmat-leaderboard-experiment.pages.dev/)

Includes experimental additions such as the `visulisation` panel and related UI interactions.

## Data

- Data file: `data/metrics_agg_filtered.csv`
- The page loads and renders data fully on the client side (no backend required).
