"""
Offshore Wind Forecast Model Accuracy Benchmark
Evaluates the EcoGrid Multi-Model Forecasting Pipeline on the Dryad North Sea Dataset
(doi:10.5061/dryad.w6m905qzk - 30 wind farms, 262,800 hourly records)

Evaluates:
1. Persistence / Seasonal Naive Baseline (t-24h yesterday same hour)
2. Physical Aerodynamic Power Curve Model (IEC 61400 turbine curve)
3. XGBoost Quantile Regressor (P10, P50, P90 pinball loss)
4. Physics-Informed Composite Ensemble (40% Physics + 40% XGBoost + 20% Harmonic)

Metrics Computed:
- Mean Absolute Error (MAE in MW and % capacity)
- Root Mean Squared Error (RMSE in MW and % capacity)
- Forecast Skill Score (% improvement over Persistence)
- Prediction Interval Coverage Probability (PICP, % within [P10, P90])
- Prediction Interval Normalized Average Width (PINAW, sharpness % of capacity)
- Pearson Correlation Coefficient (R^2)
- Total Energy Bias (% MWh error)
- Regime and Seasonal Stratified Error Breakdown
"""

import os
import sys
import json
import numpy as np
import pandas as pd
from typing import Dict, Any, List

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from models.xgboost_model import XGBoostQuantileModel
from models.evaluator import calculate_mae, calculate_rmse, calculate_skill_score
from app.services.forecasting_service import compute_physical_wind

DATA_PATH = os.path.join(REPO_ROOT, "data", "dryad_offshore_wind_generation.csv")
OUTPUT_JSON = os.path.join(REPO_ROOT, "models", "trained", "dryad_wind_backtest_summary.json")

def evaluate_site(site_id: str, df_site: pd.DataFrame, model: XGBoostQuantileModel) -> Dict[str, Any]:
    """
    Conducts comprehensive backtesting on a single offshore wind farm over 8,760 hours.
    """
    cap = float(df_site["capacity_mw"].iloc[0])
    actuals = df_site["actual_generation_mw"].to_numpy()
    w100 = df_site["wind_speed_100m"].to_numpy()
    n = len(actuals)

    # 1. Baseline Model (t-24h persistence)
    baseline = np.zeros(n)
    baseline[24:] = actuals[:-24]
    baseline[:24] = actuals[:24]

    # 2. Physics Aerodynamic Model
    physics = np.array([compute_physical_wind(w, cap) for w in w100])

    # 3. XGBoost Quantile Regressor
    site_meta = {"id": site_id, "type": "wind", "capacity_mw": cap}
    xgb_records = model.predict(site_meta, df_site)
    xgb_p10 = np.array([r["p10_mw"] for r in xgb_records])
    xgb_p50 = np.array([r["p50_mw"] for r in xgb_records])
    xgb_p90 = np.array([r["p90_mw"] for r in xgb_records])

    # 4. Physics-Informed Ensemble (60% Physics + 40% XGBoost P50)
    ensemble_p50 = np.clip(0.60 * physics + 0.40 * xgb_p50, 0.0, cap)
    ensemble_p10 = np.clip(0.50 * xgb_p10 + 0.50 * np.minimum(physics * 0.85, ensemble_p50), 0.0, cap)
    ensemble_p90 = np.clip(0.50 * xgb_p90 + 0.50 * np.maximum(physics * 1.15, ensemble_p50), 0.0, cap)

    # Evaluation slice excluding warmup (first 24h)
    eval_slice = slice(24, n)
    y_true = actuals[eval_slice]
    b_pred = baseline[eval_slice]
    phys_pred = physics[eval_slice]
    xgb_pred = xgb_p50[eval_slice]
    ens_pred = ensemble_p50[eval_slice]

    # Base Metrics
    mae_base = calculate_mae(y_true, b_pred)
    rmse_base = calculate_rmse(y_true, b_pred)

    mae_phys = calculate_mae(y_true, phys_pred)
    rmse_phys = calculate_rmse(y_true, phys_pred)
    skill_phys = calculate_skill_score(mae_phys, mae_base)

    mae_xgb = calculate_mae(y_true, xgb_pred)
    rmse_xgb = calculate_rmse(y_true, xgb_pred)
    skill_xgb = calculate_skill_score(mae_xgb, mae_base)

    mae_ens = calculate_mae(y_true, ens_pred)
    rmse_ens = calculate_rmse(y_true, ens_pred)
    skill_ens = calculate_skill_score(mae_ens, mae_base)

    # Correlation R^2
    r2_ens = float(np.corrcoef(y_true, ens_pred)[0, 1] ** 2)
    r2_xgb = float(np.corrcoef(y_true, xgb_pred)[0, 1] ** 2)
    r2_phys = float(np.corrcoef(y_true, phys_pred)[0, 1] ** 2)

    # Confidence Interval Coverage (PICP) and Sharpness (PINAW)
    ens_p10_eval = ensemble_p10[eval_slice]
    ens_p90_eval = ensemble_p90[eval_slice]
    in_band = (y_true >= ens_p10_eval) & (y_true <= ens_p90_eval)
    picp = round(float(np.mean(in_band) * 100.0), 1)
    pinaw = round(float(np.mean(ens_p90_eval - ens_p10_eval) / cap * 100.0), 1)

    # Energy Bias
    tot_actual_gwh = float(np.sum(y_true) / 1000.0)
    tot_ens_gwh = float(np.sum(ens_pred) / 1000.0)
    bias_pct = round(float((tot_ens_gwh - tot_actual_gwh) / tot_actual_gwh * 100.0), 2)

    # Stratified Wind Regime Analysis
    w_eval = w100[eval_slice]
    regimes = {}
    for r_name, mask in [
        ("Low Wind (< 5 m/s)", w_eval < 5.0),
        ("Medium Ramp (5 - 11 m/s)", (w_eval >= 5.0) & (w_eval < 11.0)),
        ("High Rated (>= 11 m/s)", w_eval >= 11.0)
    ]:
        if np.sum(mask) > 0:
            reg_mae = calculate_mae(y_true[mask], ens_pred[mask])
            reg_base_mae = calculate_mae(y_true[mask], b_pred[mask])
            reg_skill = calculate_skill_score(reg_mae, reg_base_mae)
            regimes[r_name] = {
                "hours_count": int(np.sum(mask)),
                "mae_mw": round(float(reg_mae), 2),
                "nmae_pct": round(float(reg_mae / cap * 100.0), 2),
                "skill_score_pct": round(float(reg_skill), 1)
            }

    # Seasonal Analysis
    ts_eval = pd.to_datetime(df_site["timestamp"].iloc[eval_slice])
    months = ts_eval.dt.month.to_numpy()
    seasons = {}
    for s_name, s_months in [
        ("Winter (Q1)", [1, 2, 3]),
        ("Spring (Q2)", [4, 5, 6]),
        ("Summer (Q3)", [7, 8, 9]),
        ("Autumn (Q4)", [10, 11, 12])
    ]:
        s_mask = np.isin(months, s_months)
        if np.sum(s_mask) > 0:
            s_mae = calculate_mae(y_true[s_mask], ens_pred[s_mask])
            s_base = calculate_mae(y_true[s_mask], b_pred[s_mask])
            s_skill = calculate_skill_score(s_mae, s_base)
            seasons[s_name] = {
                "hours_count": int(np.sum(s_mask)),
                "mae_mw": round(float(s_mae), 2),
                "nmae_pct": round(float(s_mae / cap * 100.0), 2),
                "skill_score_pct": round(float(s_skill), 1)
            }

    return {
        "site_id": site_id,
        "capacity_mw": cap,
        "hours_evaluated": len(y_true),
        "actual_mean_mw": round(float(np.mean(y_true)), 2),
        "actual_max_mw": round(float(np.max(y_true)), 2),
        "capacity_factor_pct": round(float(np.mean(y_true) / cap * 100.0), 1),
        "models": {
            "persistence_baseline": {
                "mae_mw": round(float(mae_base), 2),
                "nmae_pct": round(float(mae_base / cap * 100.0), 2),
                "rmse_mw": round(float(rmse_base), 2),
                "nrmse_pct": round(float(rmse_base / cap * 100.0), 2),
                "skill_score_pct": 0.0
            },
            "physics_power_curve": {
                "mae_mw": round(float(mae_phys), 2),
                "nmae_pct": round(float(mae_phys / cap * 100.0), 2),
                "rmse_mw": round(float(rmse_phys), 2),
                "nrmse_pct": round(float(rmse_phys / cap * 100.0), 2),
                "skill_score_pct": round(float(skill_phys), 1),
                "r2": round(r2_phys, 3)
            },
            "xgboost_quantile_p50": {
                "mae_mw": round(float(mae_xgb), 2),
                "nmae_pct": round(float(mae_xgb / cap * 100.0), 2),
                "rmse_mw": round(float(rmse_xgb), 2),
                "nrmse_pct": round(float(rmse_xgb / cap * 100.0), 2),
                "skill_score_pct": round(float(skill_xgb), 1),
                "r2": round(r2_xgb, 3)
            },
            "physics_informed_ensemble": {
                "mae_mw": round(float(mae_ens), 2),
                "nmae_pct": round(float(mae_ens / cap * 100.0), 2),
                "rmse_mw": round(float(rmse_ens), 2),
                "nrmse_pct": round(float(rmse_ens / cap * 100.0), 2),
                "skill_score_pct": round(float(skill_ens), 1),
                "r2": round(r2_ens, 3),
                "picp_coverage_pct": picp,
                "pinaw_sharpness_pct": pinaw,
                "energy_bias_pct": bias_pct,
                "actual_gwh": round(tot_actual_gwh, 1),
                "forecast_gwh": round(tot_ens_gwh, 1)
            }
        },
        "regimes": regimes,
        "seasons": seasons
    }

def run_fleet_benchmark():
    print("=" * 90)
    print(" ECOGRID MODEL ACCURACY BENCHMARK ON DRYAD NORTH SEA OFFSHORE DATASET")
    print("=" * 90)

    if not os.path.exists(DATA_PATH):
        print(f"Error: Dataset not found at {DATA_PATH}")
        return

    df = pd.read_csv(DATA_PATH)
    unique_sites = df["site_id"].unique()
    print(f"Dataset: 2023 Full Operational Year ({len(df):,} hourly SCADA rows)")
    print(f"Fleet Scope: {len(unique_sites)} North Sea & UK Waters Offshore Wind Farms\n")

    model = XGBoostQuantileModel()

    fleet_results = {}
    site_summaries = []

    for sid in unique_sites:
        sub = df[df["site_id"] == sid].copy().reset_index(drop=True)
        res = evaluate_site(sid, sub, model)
        fleet_results[sid] = res

        ens = res["models"]["physics_informed_ensemble"]
        base = res["models"]["persistence_baseline"]
        site_summaries.append({
            "site_id": sid,
            "cap": res["capacity_mw"],
            "cf": res["capacity_factor_pct"],
            "base_mae": base["nmae_pct"],
            "ens_mae": ens["nmae_pct"],
            "ens_rmse": ens["nrmse_pct"],
            "skill": ens["skill_score_pct"],
            "r2": ens["r2"],
            "picp": ens["picp_coverage_pct"]
        })

    # Summary Table for Top Wind Farms
    key_sites = ["beatrice-wind", "east-anglia-one-wind", "london-array-wind", "seagreen-wind", "moray-east-wind", "triton-knoll-wind", "hornsea-one-wind"]
    print(f"{'Site ID':<24} {'Cap (MW)':<10} {'CF (%)':<8} {'Base NMAE':<11} {'Ens NMAE':<10} {'Skill':<10} {'R^2':<7} {'PICP':<7}")
    print("-" * 90)
    for s in site_summaries:
        if s["site_id"] in key_sites:
            print(f"{s['site_id']:<24} {s['cap']:<10.0f} {s['cf']:<8.1f} {s['base_mae']:<11.2f}% {s['ens_mae']:<10.2f}% +{s['skill']:<9.1f}% {s['r2']:<7.3f} {s['picp']:<7.1f}%")

    # Fleet-wide averages
    avg_cap = float(np.mean([s["cap"] for s in site_summaries]))
    avg_cf = float(np.mean([s["cf"] for s in site_summaries]))
    avg_base_nmae = float(np.mean([s["base_mae"] for s in site_summaries]))
    avg_ens_nmae = float(np.mean([s["ens_mae"] for s in site_summaries]))
    avg_ens_nrmse = float(np.mean([s["ens_rmse"] for s in site_summaries]))
    avg_skill = float(np.mean([s["skill"] for s in site_summaries]))
    avg_r2 = float(np.mean([s["r2"] for s in site_summaries]))
    avg_picp = float(np.mean([s["picp"] for s in site_summaries]))

    print("-" * 90)
    print(f"{'FLEET AVERAGE (30 FARMS)':<24} {avg_cap:<10.0f} {avg_cf:<8.1f} {avg_base_nmae:<11.2f}% {avg_ens_nmae:<10.2f}% +{avg_skill:<9.1f}% {avg_r2:<7.3f} {avg_picp:<7.1f}%")
    print("=" * 90)

    # Save summary scorecard
    summary_output = {
        "dataset_name": "Dryad North Sea Offshore Wind Power Production (2023)",
        "total_records": len(df),
        "total_sites": len(unique_sites),
        "fleet_averages": {
            "capacity_mw": round(avg_cap, 1),
            "capacity_factor_pct": round(avg_cf, 1),
            "baseline_nmae_pct": round(avg_base_nmae, 2),
            "ensemble_nmae_pct": round(avg_ens_nmae, 2),
            "ensemble_nrmse_pct": round(avg_ens_nrmse, 2),
            "skill_score_pct": round(avg_skill, 1),
            "correlation_r2": round(avg_r2, 3),
            "picp_coverage_pct": round(avg_picp, 1)
        },
        "sites": fleet_results
    }

    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    with open(OUTPUT_JSON, "w") as f:
        json.dump(summary_output, f, indent=2)
    print(f"\nSaved complete benchmark scorecard to {OUTPUT_JSON}")

    return summary_output

if __name__ == "__main__":
    run_fleet_benchmark()
