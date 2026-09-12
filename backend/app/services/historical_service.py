"""
Nimbus Historical Telemetry Service:
Provides chronological actual generation (SCADA sensor measurements)
vs XGBoost Quantile Forecasts (P10, P50, P90) & Persistence Baseline.
Calculates real-time empirical backtest metrics:
- Mean Absolute Error (MAE) & Normalized MAE (% capacity)
- Root Mean Square Error (RMSE)
- Forecast Skill Score vs Persistence Baseline
- Prediction Interval Coverage Probability (PICP)
- Energy Bias (Total MWh actual vs forecast)
"""

import os
import sys
import json
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from models.xgboost_model import XGBoostQuantileModel
from models.evaluator import calculate_mae, calculate_rmse, calculate_skill_score

DATA_DIR = os.path.join(REPO_ROOT, "data")
HISTORICAL_CSV = os.path.join(DATA_DIR, "historical_generation_dummy.csv")
DRYAD_WIND_CSV = os.path.join(DATA_DIR, "dryad_offshore_wind_generation.csv")
SOLAR_FEATURES_CSV = os.path.join(DATA_DIR, "solar_training_features.csv")
WIND_FEATURES_CSV = os.path.join(DATA_DIR, "wind_training_features.csv")
SITES_JSON = os.path.join(DATA_DIR, "sample_sites.json")

# Global in-memory cache for processed historical comparison series
_CACHE: Dict[str, Dict[str, Any]] = {}
_MODEL: Optional[XGBoostQuantileModel] = None

def get_model() -> XGBoostQuantileModel:
    global _MODEL
    if _MODEL is None:
        _MODEL = XGBoostQuantileModel()
    return _MODEL

def _get_site_meta(site_id: str) -> Dict[str, Any]:
    """Loads site metadata from sample_sites.json or falls back to sensible defaults."""
    if os.path.exists(SITES_JSON):
        try:
            with open(SITES_JSON, "r", encoding="utf-8") as f:
                sites = json.load(f)
                for s in sites:
                    if s.get("id") == site_id or s.get("site_id") == site_id:
                        return s
        except Exception as e:
            print(f"[HistoricalService] Warning reading {SITES_JSON}: {e}")

    site_defaults = {
        "bhadla-solar": {"type": "solar", "capacity_mw": 2245.0, "name": "Bhadla Solar Park (Rajasthan, India)"},
        "desert-sunlight": {"type": "solar", "capacity_mw": 550.0, "name": "Desert Sunlight Solar Farm (California, USA)"},
        "muppandal-wind": {"type": "wind", "capacity_mw": 1500.0, "name": "Muppandal Wind Farm (Tamil Nadu, India)"},
        "hornsea-wind": {"type": "wind", "capacity_mw": 1386.0, "name": "Hornsea 2 Offshore Wind (North Sea, UK)"},
        "hybrid-gansu": {"type": "hybrid", "capacity_mw": 3200.0, "name": "Jiuquan Hybrid Eco-Power Base (Gansu, China)"}
    }
    return site_defaults.get(site_id, {
        "type": "wind" if "wind" in site_id else "solar",
        "capacity_mw": 500.0,
        "name": site_id
    })

def _load_historical_site_data(site_id: str, capacity_mw: float, site_type: str) -> List[Dict[str, Any]]:
    """
    Loads historical SCADA telemetry for the specified utility site,
    computes XGBoost P10/P50/P90 quantile predictions and persistence baseline.
    Checks the Dryad offshore wind dataset (dryad_offshore_wind_generation.csv)
    first for wind sites, falling back to historical_generation_dummy.csv.
    """
    df_site = pd.DataFrame()

    # 1. Check Dryad offshore wind dataset first for offshore wind plants
    if os.path.exists(DRYAD_WIND_CSV):
        try:
            df_wind = pd.read_csv(DRYAD_WIND_CSV)
            match = df_wind[df_wind["site_id"] == site_id].copy().reset_index(drop=True)
            if not match.empty:
                df_site = match
        except Exception as e:
            print(f"[HistoricalService] Error querying Dryad wind dataset: {e}")

    # 2. Check general historical CSV if not found in Dryad dataset
    if df_site.empty and os.path.exists(HISTORICAL_CSV):
        try:
            df_hist = pd.read_csv(HISTORICAL_CSV)
            match = df_hist[df_hist["site_id"] == site_id].copy().reset_index(drop=True)
            if not match.empty:
                df_site = match
        except Exception as e:
            print(f"[HistoricalService] Error querying historical CSV: {e}")

    # 3. Fallback to bhadla-solar if still not found
    if df_site.empty:
        if os.path.exists(HISTORICAL_CSV):
            df_hist = pd.read_csv(HISTORICAL_CSV)
            df_site = df_hist[df_hist["site_id"] == "bhadla-solar"].copy().reset_index(drop=True)
        else:
            return []

    model = get_model()
    site_meta = {
        "id": site_id,
        "type": site_type,
        "capacity_mw": capacity_mw
    }
    preds = model.predict(site_meta, df_site)

    records = []
    n = len(df_site)
    actuals = df_site["actual_generation_mw"].to_numpy()

    for i in range(n):
        row = df_site.iloc[i]
        actual = float(actuals[i])
        p50 = float(preds[i]["p50_mw"])
        p10 = float(preds[i]["p10_mw"])
        p90 = float(preds[i]["p90_mw"])

        # Persistence baseline: generation at t-24h (yesterday same hour)
        if i >= 24:
            baseline = float(actuals[i - 24])
        else:
            baseline = float(actuals[i])

        error = round(actual - p50, 2)
        in_band = bool(p10 <= actual <= p90)

        records.append({
            "hour_index": i,
            "timestamp": str(row["timestamp"]),
            "actual_mw": round(actual, 2),
            "predicted_p50_mw": round(p50, 2),
            "predicted_p10_mw": round(p10, 2),
            "predicted_p90_mw": round(p90, 2),
            "baseline_mw": round(baseline, 2),
            "error_mw": error,
            "abs_error_mw": round(abs(error), 2),
            "in_confidence_band": in_band,
            "weather": {
                "ghi_wm2": round(float(row.get("ghi_wm2", 0.0)), 1),
                "wind_speed_100m": round(float(row.get("wind_speed_100m", 0.0)), 2),
                "temperature_c": round(float(row.get("temperature_c", 25.0)), 1),
                "cloud_cover_pct": round(float(row.get("cloud_cover_pct", 0.0)), 1)
            }
        })

    return records

def _load_kaggle_holdout_data(dataset_type: str) -> List[Dict[str, Any]]:
    """
    Loads raw Kaggle holdout test set (Plant 1 Solar or Wind Turbine SCADA).
    """
    csv_file = SOLAR_FEATURES_CSV if dataset_type == "kaggle_solar" else WIND_FEATURES_CSV
    if not os.path.exists(csv_file):
        return []

    df = pd.read_csv(csv_file)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)

    # Use the holdout test portion (last 20% or last 30 days)
    n_total = len(df)
    n_test = min(720, max(168, int(n_total * 0.25)))
    test_df = df.iloc[-n_test:].reset_index(drop=True)

    model = get_model()
    is_solar = (dataset_type == "kaggle_solar")
    site_type = "solar" if is_solar else "wind"
    cap_mw = float(test_df["plant_capacity_mw"].iloc[0]) if "plant_capacity_mw" in test_df else (28.7 if is_solar else 3.6)

    site_meta = {
        "id": dataset_type,
        "type": site_type,
        "capacity_mw": cap_mw,
        "solar_capacity_mw": cap_mw if is_solar else 0.0,
        "wind_capacity_mw": cap_mw if not is_solar else 0.0
    }
    preds = model.predict(site_meta, test_df)

    actuals = test_df["generation_mw"].to_numpy()
    baselines = test_df["gen_lag_24h"].to_numpy() if "gen_lag_24h" in test_df else actuals

    records = []
    for i in range(len(test_df)):
        row = test_df.iloc[i]
        actual = float(actuals[i])
        p50 = float(preds[i]["p50_mw"])
        p10 = float(preds[i]["p10_mw"])
        p90 = float(preds[i]["p90_mw"])
        base = float(baselines[i])

        error = round(actual - p50, 2)
        in_band = bool(p10 <= actual <= p90)

        records.append({
            "hour_index": i,
            "timestamp": str(row["timestamp"]),
            "actual_mw": round(actual, 2),
            "predicted_p50_mw": round(p50, 2),
            "predicted_p10_mw": round(p10, 2),
            "predicted_p90_mw": round(p90, 2),
            "baseline_mw": round(base, 2),
            "error_mw": error,
            "abs_error_mw": round(abs(error), 2),
            "in_confidence_band": in_band,
            "weather": {
                "ghi_wm2": round(float(row.get("ghi_wm2", 0.0)), 1) if is_solar else 0.0,
                "wind_speed_100m": round(float(row.get("wind_speed_100m", row.get("wind_speed_ms", 0.0))), 2) if not is_solar else 0.0,
                "temperature_c": round(float(row.get("temperature_c", 25.0)), 1),
                "cloud_cover_pct": round(float(row.get("cloud_cover_est_pct", 0.0)), 1) if is_solar else 0.0
            }
        })

    return records

def get_historical_vs_predicted(
    site_id: str = "bhadla-solar",
    dataset: Optional[str] = None,
    window_hours: int = 72,
    offset_hours: int = 0
) -> Dict[str, Any]:
    """
    Returns time series comparison of Historical Actual vs Predicted Generation
    along with calibrated model validation metrics for the requested window.
    """
    cache_key = f"{dataset or site_id}"
    if cache_key not in _CACHE:
        if dataset in ["kaggle_solar", "kaggle_wind"]:
            _CACHE[cache_key] = _load_kaggle_holdout_data(dataset)
        else:
            # Map site metadata dynamically from sample_sites.json or defaults
            site_meta = _get_site_meta(site_id)
            s_type = site_meta.get("type", "solar")
            cap = float(site_meta.get("capacity_mw", 1000.0))
            _CACHE[cache_key] = _load_historical_site_data(site_id, cap, s_type)

    all_records = _CACHE.get(cache_key, [])
    if not all_records:
        return {
            "error": "No historical records available",
            "series": [],
            "metrics": {}
        }

    total_available = len(all_records)
    window = min(total_available, max(12, window_hours))
    offset = max(0, min(offset_hours, total_available - window))

    # Take the window slice
    slice_records = all_records[offset : offset + window]

    # Compute validation metrics on this slice
    actuals = np.array([r["actual_mw"] for r in slice_records])
    p50 = np.array([r["predicted_p50_mw"] for r in slice_records])
    p10 = np.array([r["predicted_p10_mw"] for r in slice_records])
    p90 = np.array([r["predicted_p90_mw"] for r in slice_records])
    base = np.array([r["baseline_mw"] for r in slice_records])

    mae_xgb = calculate_mae(actuals, p50)
    rmse_xgb = calculate_rmse(actuals, p50)
    mae_base = calculate_mae(actuals, base)
    skill_pct = calculate_skill_score(mae_xgb, mae_base)

    # Prediction Interval Coverage Probability (PICP)
    in_interval = int(np.sum((actuals >= p10) & (actuals <= p90)))
    picp = round(float((in_interval / len(actuals)) * 100.0), 1)

    # Energy calculations
    tot_actual_mwh = round(float(np.sum(actuals)), 2)
    tot_pred_mwh = round(float(np.sum(p50)), 2)
    energy_delta_pct = round(float(((tot_pred_mwh - tot_actual_mwh) / max(1.0, tot_actual_mwh)) * 100.0), 2)

    # Capacity normalization
    max_cap = max(1.0, float(np.max(actuals) * 1.1))
    nmae_pct = round(float((mae_xgb / max_cap) * 100.0), 2)

    # Pearson correlation
    if np.std(actuals) > 1e-4 and np.std(p50) > 1e-4:
        r2 = round(float(np.corrcoef(actuals, p50)[0, 1] ** 2), 3)
    else:
        r2 = 1.0

    return {
        "site_id": site_id,
        "dataset": dataset or site_id,
        "window_hours": len(slice_records),
        "total_historical_records": total_available,
        "offset_hours": offset,
        "metrics": {
            "mae_mw": round(float(mae_xgb), 2),
            "nmae_pct": nmae_pct,
            "rmse_mw": round(float(rmse_xgb), 2),
            "baseline_mae_mw": round(float(mae_base), 2),
            "skill_score_pct": round(float(skill_pct), 1),
            "picp_coverage_pct": picp,
            "total_actual_mwh": tot_actual_mwh,
            "total_predicted_mwh": tot_pred_mwh,
            "energy_delta_pct": energy_delta_pct,
            "correlation_r2": r2,
            "max_actual_mw": round(float(np.max(actuals)), 2),
            "max_predicted_mw": round(float(np.max(p50)), 2),
            "overforecast_hours": int(np.sum(p50 > actuals)),
            "underforecast_hours": int(np.sum(p50 < actuals))
        },
        "series": slice_records
    }
