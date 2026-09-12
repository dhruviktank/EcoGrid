# EcoGrid Intelligence — Renewable Generation Intelligence Platform
> *"Forecasting the grid's next 72 hours, before the weather decides for us."*

**Team:** Dev29  
**Complete Evaluation Document:** [PROJECT_EVALUATION_DOCUMENT.md](file:///Users/dhruviktank/Desktop/Hackout/EcoGrid/PROJECT_EVALUATION_DOCUMENT.md)

---

## What is EcoGrid Intelligence?
EcoGrid Intelligence is an end-to-end renewable energy generation forecasting and decision intelligence platform. It ingests global meteorological numerical weather predictions (NWP) alongside industrial SCADA telemetry, forecasts generation 24 to 72 hours ahead using calibrated **XGBoost Quantile Regression models** ($P_{10}, P_{50}, P_{90}$), and couples predictions with a **deterministic threshold decision engine** to generate actionable grid dispatch orders and optimize Battery Energy Storage Systems (BESS).

---

## Key Highlights

- ⚡ **Probabilistic Quantile Forecasts:** Unlike single-line deterministic forecasts, EcoGrid Intelligence predicts the 10th ($P_{10}$ conservative floor), 50th ($P_{50}$ scheduled median), and 90th ($P_{90}$ surge upper bound) percentiles to capture asymmetric weather risk.
- 📈 **Empirical ML Skill Scores:**
  - **Solar:** +74.51% skill score improvement over persistence baseline (MAE 1.53 $\to$ 0.39 MW, 93.7% interval coverage).
  - **Wind:** +77.31% skill score improvement over persistence baseline (MAE 1.19 $\to$ 0.27 MW, 78.8% interval coverage).
- ⚙️ **Deterministic Grid Rules Engine:**
  - **Over-generation / Curtailment:** If $P_{90} > \text{Demand} + \text{BESS Headroom}$, issues automated Inverter Derating Orders (% and MW).
  - **Under-generation / Backup:** If $P_{10} < 85\% \times \text{Demand}$, issues Fast-Peaker Reserve Notices with 1h–2h lead times.
- 🔋 **4-Hour BESS Dispatch Optimizer:** Tracks State-of-Charge (SoC), charging during peak solar generation and discharging during evening peak demand.
- 🗺️ **Real Interactive GIS Field Map:** Leaflet map with high-resolution ESRI World Imagery satellite tiles, active GPS coordinates, pulsing pins, and fleet asset markers.
- 📊 **Historical vs Predicted Telemetry Wave:** Audits model fidelity against empirical Kaggle SCADA holdout datasets with rolling error delta bars and skill score benchmarks.
- 👥 **Multi-Lens Personas:** Tailored views for **Grid Operators** (reliability & curtailment), **Portfolio Planners** (BESS cycles & maintenance), and **Power Traders** (DSM penalty avoidance & revenue).
- 🧪 **What-If Scenario Simulator:** Dynamic stress-testing for extreme heatwaves, severe cloud fronts, wind lulls, and industrial demand spikes.

---

## Quickstart

### 1. Backend (FastAPI + XGBoost)
```bash
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
- API Root: `http://127.0.0.1:8000/`
- Interactive Swagger Docs: `http://127.0.0.1:8000/docs`

### 2. Frontend (React 19 + Vite + Tailwind)
```bash
cd frontend
npm install
npm run dev
```
- Dashboard UI: `http://localhost:5173/`

### 3. Run Automated Tests
```bash
cd backend
../.venv/bin/pytest tests -v
```
*(All 12 unit and integration tests pass)*

---

## Detailed Documentation
For the full evaluation specification including mathematical formulas, feature engineering details, empirical backtest tables, API schema, and decision rule architecture, see:
👉 **[PROJECT_EVALUATION_DOCUMENT.md](file:///Users/dhruviktank/Desktop/Hackout/EcoGrid/PROJECT_EVALUATION_DOCUMENT.md)**
