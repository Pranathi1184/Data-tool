# Midas Data Tool

Excel/CSV/JSON data massaging platform with a FastAPI backend and a React dashboard. It covers the end‑to‑end workflow: upload files, select sheets, join datasets with key suggestions, apply repeatable transformations, live preview, and export to multiple formats. A production Dockerfile and a Render blueprint are included.

Live Demo:[ https://your-dashboard-url.example.com](https://data-tool-vsz2.onrender.com)

## Table of Contents

- Overview
- Capabilities
- Architecture
- Prerequisites
- Project Structure
- Installation
- Local Development
- Data Flow
- Excel Workflows (from Case PDF)
- Using The Application
- Transformations
- Recipe Examples
- Profiling & Suggestions
- Export
- API Reference
- Deployment on Render
- Quality Criteria
- Configuration
- Performance & Limits
- Security
- Troubleshooting
- FAQ
- Known Limitations

## Overview

Midas streamlines routine spreadsheet cleanup by converting operations into a reproducible pipeline (“recipe”). Users can:

- Upload one or more files and choose sheets.
- Join two files/sheets with automatic key suggestions and simulation.
- Apply transformations such as standardizing dates, calculating Net Profit, sorting, filters, merges, pattern validation, and more.
- Preview results instantly without committing steps.
- Export the transformed dataset as Excel, CSV, or JSON.
- Save and reuse templates.

## Capabilities

- Formats: Excel (.xlsx/.xls), CSV, JSON, Parquet.
- Excel sheet selection and optional merge of identical schemas.
- Join Assistant:
  - Candidate key discovery with scoring (overlap/uniqueness).
  - Simulate left/inner/right join with a row sample before committing.
- Transformations:
  - Standardize dates, sort by date.
  - Calculate Net Profit from Revenue, COGS, Expenses.
  - Filter by expression, add custom formula column.
  - Merge columns, drop duplicates.
  - Text cleanup (trim whitespace, lowercase).
  - Validate pattern with regex and mark invalid entries.
- Profiling and data‑driven suggestions (boosted by repeated operations).
- Export to .xlsx/.csv/.json with Excel formatting.

## Architecture

- Backend: FastAPI + Uvicorn. Implements file I/O, recipe engine, joins, profiling/suggestions, and export.
- Frontend: React + Vite app in `dashboard/`. Uses `VITE_API_BASE` to talk to the API.
- Optional Redis cache when `REDIS_URL` is set.

## Prerequisites

- Python 3.10 or newer
- Node.js 18+ and npm 9+
- Windows, macOS, or Linux
- openpyxl installed for .xlsx support (bundled in requirements)
- Optional: DuckDB and PyArrow for large joins and fast previews
- Optional: Redis if `REDIS_URL` is configured

## Project Structure

```
.
├─ main.py
├─ requirements.txt
├─ Dockerfile
├─ render.yaml
├─ dashboard/
│  ├─ index.html
│  ├─ src/
│  │  └─ App.jsx
│  └─ package.json
└─ data/         # user uploads at runtime (not committed)
```

## Installation

Backend

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
```

Frontend

```bash
cd dashboard
npm ci
```

## Local Development

Start API

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Start Dashboard

```bash
cd dashboard
VITE_API_BASE=http://127.0.0.1:8000 npm run dev
```

## Data Flow

1. Upload file(s) and optionally select sheets.
2. Preview dataset and review suggestions.
3. Use Join Assistant to discover a key, simulate, and commit a join step.
4. Add transformations to build your recipe; live preview updates on each change.
5. Export the final result in preferred format.

## Excel Workflows (from Case PDF)

- Standardize Dates
  - Apply “Standardize Date” to normalize date strings across sheets/columns.
  - Optionally sort by date to verify chronology.
- Join Statements
  - Use Join Assistant to scan and suggest candidate keys with overlap/uniqueness scores.
  - Simulate left/inner/right join with a Sample size to confirm column alignment.
  - Commit the join step when satisfied.
- Financial P&L
  - Add “Calculate Net Profit” to compute Revenue − COGS − Expenses.
  - Combine with group/aggregate for period summaries if needed.
- Pattern Validation
  - Validate invoice or voucher numbers with “Pattern Validation (regex)”.
  - Mark invalid rows via a new flag column for downstream filtering.
- Export
  - Download the cleaned dataset as .xlsx, .csv, or .json.

## Using The Application

- Upload
  - Drag & drop or browse for files.
  - For multi‑sheet Excel, choose specific sheets to load.
- Join
  - Select Main and Join files from the uploaded list.
  - “Scan & Suggest Key” recommends keys with scores.
  - Choose join type (left/inner/right) and Sample size; “Simulate Join” to preview; “Add Join Step” to commit.
- Transform
  - Use Suggested Next Steps or add steps from the sidebar.
  - Each step immediately reflects in Live Preview.
- Templates
  - Save the current recipe and re‑apply later to similar datasets.
- Export
  - Pick xlsx/csv/json and download the result.

## Transformations

Supported steps and configs:

- filterDateRange: { col, from, to }
- filterExpr: { expr }
- joinWithFile: { key, how, suffixes }
- mergeColumns: { cols, dest, sep }
- calculateNetProfit: {}
- standardizeDate: { col }
- sortByDate: { col, order }
- filterDebitCredit: { col, include }
- addColumnFormula: { dest, expr }
- groupByAggregate: { by, aggs }
- dropDuplicates: { subset, keep }
- trimWhitespace: { columns }
- lowercaseText: { columns }
- detectOutliers: { columns, k }
- validateRegex: { column, pattern, mark_col }

## Recipe Examples

Join, standardize, and sort:

```json
{
  "steps": [
    { "id": "s1", "type": "joinWithFile", "config": { "key": "Account No", "how": "left", "suffixes": ["", "_j"] } },
    { "id": "s2", "type": "standardizeDate", "config": { "col": "Date" } },
    { "id": "s3", "type": "sortByDate", "config": { "col": "Date", "order": "asc" } }
  ]
}
```

Regex validation for Invoice No:

```json
{
  "steps": [
    { "id": "v1", "type": "validateRegex", "config": { "column": "Invoice No", "pattern": "^[A-Z]{3}-\\d{6}$", "mark_col": "Invoice_Invalid" } }
  ]
}
```

Preview using the recipe:

```bash
curl -X POST http://localhost:8000/preview-transform \
  -F file=@main.xlsx \
  -F join_file=@aux.xlsx \
  -F recipe='{"steps":[{"id":"s1","type":"joinWithFile","config":{"key":"Account No","how":"left","suffixes":["","_j"]}},{"id":"s2","type":"standardizeDate","config":{"col":"Date"}},{"id":"s3","type":"sortByDate","config":{"col":"Date","order":"asc"}}]}' \
  -F limit=50
```

## Profiling & Suggestions

The backend profiles the (optionally transformed) dataset and proposes operations based on column heuristics and prior user actions. Suggestions can be added individually or as a batch.

## Export

The export endpoint supports `format` = `xlsx` | `csv` | `json`. Excel outputs include helpful formatting; CSV/JSON use pandas writers. The dashboard exposes a format selector.

## API Reference

- `GET /` – Health check.
- `POST /upload`
  - form: `file`, `action`=list_sheets? (optional), `sheets` (optional), `merge_identical` (optional)
  - returns: sheet names or dataset columns/preview
- `POST /preview-transform`
  - form: `file`, `recipe` or `template_name`, `sheets` (opt), `join_file` (opt), `join_sheets` (opt), `limit`, `offset`
  - returns: preview columns and sample records
- `POST /profile`
  - form: `file`, `recipe` or `template_name`, `sheets` (opt), `join_file/sheets` (opt)
  - returns: profile summary and suggestions
- `POST /join-suggest`
  - form: `file_a`, `file_b`, `sheets_a/b` (opt)
  - returns: candidate keys with scores
- `POST /join-simulate`
  - form: `file_a`, `file_b`, `key`, `how`, `sample`, `sheets_a/b` (opt)
  - returns: joined sample
- `POST /export`
  - form: `file`, `recipe` or `template_name`, `sheets` (opt), `join_file/sheets` (opt), `format`
  - returns: file stream in requested format

Interactive OpenAPI docs live at `/docs`.

## Deployment on Render

This repository includes `render.yaml` to deploy both services.

- API (midas-api)
  - Type: Web Service (Docker)
  - Health check: `/`
  - Env: `REDIS_URL` (optional), `PORT`=`8000`
- Dashboard (midas-dashboard)
  - Type: Static Site
  - Root: `dashboard`
  - Build: `npm ci && npm run build`
  - Publish: `dist`
  - Env: `VITE_API_BASE` automatically linked to the API URL

Steps

1. Push this repo to GitHub.
2. In Render → New → Blueprint → select the repo.
3. Confirm resources and deploy.
4. Open the dashboard URL; it will call the API via `VITE_API_BASE`.

## Quality Criteria

- One‑click Render blueprint deploys API and dashboard.
- API exposes a health check at `/` and interactive docs at `/docs`.
- Dashboard reads `VITE_API_BASE` from environment and builds a static bundle.
- Dockerfile builds a production image with FastAPI + Uvicorn.
- Join Assistant supports key suggestion, simulation with sampling, and commit.
- Transform suggestions use safe default configs to prevent runtime errors.
- README documents workflows, deployment, and API usage thoroughly.

## Configuration

- Frontend: `VITE_API_BASE` (API base URL)
- Backend: `REDIS_URL` (optional), `PORT` (default 8000)

## Performance & Limits

- Uses DuckDB + Arrow for large joins when available.
- Preview returns small samples for responsiveness.

## Security

- Configure secrets as environment variables (never commit them).
- CORS is permissive by default for development; restrict in production.

## Troubleshooting

- Dashboard cannot reach API: ensure `VITE_API_BASE` equals the API public URL and rebuild the dashboard.
- Simulate Join shows only main columns: pick a high‑overlap key (e.g., Account No) and simulate again.
- Export failures on large files: ensure dependencies are installed and consider scaling plan; DuckDB improves performance.
- CORS errors in dev: run dashboard with `VITE_API_BASE` pointing to the local API port.
- SPA 404 on refresh: Render Static Sites serve `index.html`; ensure build output is in `dist`.
- Dates not parsed: confirm “Standardize Date” runs before sorting or filtering by date.
- Missing Excel support: verify `openpyxl` is installed from `requirements.txt`.
- Columns misaligned after join: choose a more unique key or try inner join.

## FAQ

- How do I change the API URL?
  - Set `VITE_API_BASE` before building the dashboard; for dev, export it inline with `npm run dev`.
- Can I reuse a pipeline?
  - Use Templates in the dashboard to save and re‑apply a recipe.
- How big can my files be?
  - Practical limits depend on plan and memory; DuckDB + Arrow improves scale.

## Known Limitations

- Very large Excel files may require more memory or conversion to Parquet.
- Regex validation performance degrades on extremely long free‑text columns.
- Some edge‑case date formats may need a custom pre‑clean step.
