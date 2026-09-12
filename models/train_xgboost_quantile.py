"""
Nimbus Model Training: XGBoost Quantile Regression Forecaster
Trains multi-horizon (24h - 72h) quantile models (P10, P50, P90) on the feature store tables.
Conducts chronological backtesting against the Persistence Baseline benchmark.
Computes and reports:
- MAE, RMSE, and Forecast Skill Score improvement vs Baseline
- Quantile / Pinball Loss for P10, P50, P90
- Prediction Interval Coverage Probability (PICP, % actuals within [P10, P90])
- Prediction Interval Normalized Average Width (PINAW, interval sharpness)
Saves trained model artifacts to models/trained/
"""

import os
import sys
import json
import numpy as np
import pandas as pd
import xgboost as xgb

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from models.evaluator import calculate_mae, calculate_rmse, calculate_skill_score

DATA_DIR = os.path.join(REPO_ROOT, "data")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "trained")
os.makedirs(MODEL_DIR, exist_ok=True)

SOLAR_FEATURES_CSV = os.path.join(DATA_DIR, "solar_training_features.csv")
WIND_FEATURES_CSV = os.path.join(DATA_DIR, "wind_training_features.csv")

# Feature configurations matching 24-72h ahead weather forecast availability
SOLAR_FEATURES = [
    "ghi_wm2",
    "temperature_c",
    "cloud_cover_est_pct",
    "temp_derate_factor",
    "hour_sin",
    "hour_cos",
    "doy_sin",
    "doy_cos",
    "gen_lag_24h"
]

WIND_FEATURES = [
    "wind_speed_100m",
    "wind_cubic_cf",
    "wind_power_density_wm2",
    "hour_sin",
    "hour_cos",
    "doy_sin",
    "doy_cos",
    "gen_lag_24h"
]

def pinball_loss(y_true: np.ndarray, y_pred: np.ndarray, alpha: float) -> float:
    """Calculates pinball / quantile loss for quantile alpha."""
    err = y_true - y_pred
    return float(np.mean(np.maximum(alpha * err, (alpha - 1.0) * err)))

def train_and_backtest_solar(test_ratio=0.20):
    print("="*80)
    print("1. TRAINING & BACKTESTING SOLAR QUANTILE FORECASTER (XGBOOST)")
    print("="*80)

    df = pd.read_csv(SOLAR_FEATURES_CSV)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)

    # Chronological train/test split (no random shuffling in time series)
    n_total = len(df)
    n_train = int(n_total * (1.0 - test_ratio))

    train_df = df.iloc[:n_train]
    test_df = df.iloc[n_train:]

    print(f"Total instances: {n_total} hours")
    print(f"Training set:    {len(train_df)} hours ({train_df['timestamp'].min()} to {train_df['timestamp'].max()})")
    print(f"Test/Holdout set: {len(test_df)} hours ({test_df['timestamp'].min()} to {test_df['timestamp'].max()})")

    X_train = train_df[SOLAR_FEATURES].to_numpy()
    y_train = train_df['generation_mw'].to_numpy()

    X_test = test_df[SOLAR_FEATURES].to_numpy()
    y_test = test_df['generation_mw'].to_numpy()
    baseline_test = test_df['gen_lag_24h'].to_numpy()

    cap_mw = float(df['plant_capacity_mw'].iloc[0])

    # Train P10, P50, and P90 models
    models = {}
    preds_test = {}

    hyperparams = {
        "n_estimators": 120,
        "max_depth": 4,
        "learning_rate": 0.05,
        "subsample": 0.85,
        "colsample_bytree": 0.85,
        "random_state": 42
    }

    for q_name, alpha in [("p10", 0.10), ("p50", 0.50), ("p90", 0.90)]:
        print(f"Fitting XGBoost Quantile Regressor for {q_name.upper()} (alpha={alpha:.2f})...")
        reg = xgb.XGBRegressor(
            objective='reg:quantileerror',
            quantile_alpha=alpha,
            **hyperparams
        )
        reg.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
        models[q_name] = reg

        # Predict on holdout test set
        pred = np.clip(reg.predict(X_test), 0.0, cap_mw)
        # Night zero clamping (when forecast GHI is 0)
        night_mask = test_df['ghi_wm2'].to_numpy() <= 1.0
        pred[night_mask] = 0.0
        preds_test[q_name] = pred

        # Save model JSON
        model_file = os.path.join(MODEL_DIR, f"xgb_solar_{q_name}.json")
        reg.save_model(model_file)
        print(f"  -> Saved model artifact: {os.path.basename(model_file)}")

    # Enforce monotonic quantile order: P10 <= P50 <= P90
    p10 = np.minimum(preds_test["p10"], preds_test["p50"])
    p50 = preds_test["p50"]
    p90 = np.maximum(preds_test["p90"], preds_test["p50"])

    # Backtest Metrics
    mae_base = calculate_mae(y_test, baseline_test)
    rmse_base = calculate_rmse(y_test, baseline_test)

    mae_xgb = calculate_mae(y_test, p50)
    rmse_xgb = calculate_rmse(y_test, p50)

    skill_score = calculate_skill_score(mae_xgb, mae_base)

    # Uncertainty Band Metrics
    in_interval = np.sum((y_test >= p10) & (y_test <= p90))
    picp = (in_interval / len(y_test)) * 100.0  # Prediction Interval Coverage Probability (target ~80%)
    pinaw = (np.mean(p90 - p10) / cap_mw) * 100.0  # Prediction Interval Normalized Average Width

    pb_10 = pinball_loss(y_test, p10, 0.10)
    pb_50 = pinball_loss(y_test, p50, 0.50)
    pb_90 = pinball_loss(y_test, p90, 0.90)

    print("\n" + "-"*65)
    print(f"{'SOLAR BACKTEST EVALUATION SCORECARD':^65}")
    print("-"*65)
    print(f"Benchmark Standard (Persistence): MAE = {mae_base:.2f} MW | RMSE = {rmse_base:.2f} MW")
    print(f"XGBoost Point Forecast (P50):    MAE = {mae_xgb:.2f} MW | RMSE = {rmse_xgb:.2f} MW")
    print(f"FORECAST SKILL IMPROVEMENT:       +{skill_score:.1f}% OVER BASELINE")
    print(f"Quantile Pinball Losses:          P10 = {pb_10:.3f}, P50 = {pb_50:.3f}, P90 = {pb_90:.3f}")
    print(f"Confidence Band Coverage (PICP):  {picp:.1f}% of actuals in [P10, P90] (Expected ~80%)")
    print(f"Interval Sharpness Width (PINAW): {pinaw:.1f}% of plant capacity")
    print("-"*65)

    return {
        "asset": "solar",
        "mae_baseline": mae_base,
        "rmse_baseline": rmse_base,
        "mae_xgb": mae_xgb,
        "rmse_xgb": rmse_xgb,
        "skill_score_pct": skill_score,
        "coverage_picp": picp,
        "sharpness_pinaw": pinaw
    }

def train_and_backtest_wind(test_ratio=0.20):
    print("\n" + "="*80)
    print("2. TRAINING & BACKTESTING WIND QUANTILE FORECASTER (XGBOOST)")
    print("="*80)

    df = pd.read_csv(WIND_FEATURES_CSV)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)

    n_total = len(df)
    n_train = int(n_total * (1.0 - test_ratio))

    train_df = df.iloc[:n_train]
    test_df = df.iloc[n_train:]

    print(f"Total instances: {n_total:,} hours (1 full calendar year)")
    print(f"Training set:    {len(train_df):,} hours ({train_df['timestamp'].min()} to {train_df['timestamp'].max()})")
    print(f"Test/Holdout set: {len(test_df):,} hours ({test_df['timestamp'].min()} to {test_df['timestamp'].max()})")

    X_train = train_df[WIND_FEATURES].to_numpy()
    y_train = train_df['generation_mw'].to_numpy()

    X_test = test_df[WIND_FEATURES].to_numpy()
    y_test = test_df['generation_mw'].to_numpy()
    baseline_test = test_df['gen_lag_24h'].to_numpy()

    cap_mw = float(df['plant_capacity_mw'].iloc[0])

    models = {}
    preds_test = {}

    hyperparams = {
        "n_estimators": 140,
        "max_depth": 5,
        "learning_rate": 0.05,
        "subsample": 0.85,
        "colsample_bytree": 0.85,
        "random_state": 42
    }

    for q_name, alpha in [("p10", 0.10), ("p50", 0.50), ("p90", 0.90)]:
        print(f"Fitting XGBoost Quantile Regressor for {q_name.upper()} (alpha={alpha:.2f})...")
        reg = xgb.XGBRegressor(
            objective='reg:quantileerror',
            quantile_alpha=alpha,
            **hyperparams
        )
        reg.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
        models[q_name] = reg

        pred = np.clip(reg.predict(X_test), 0.0, cap_mw)
        # Aerodynamic cut-out safety shutdown
        storm_mask = test_df['wind_speed_100m'].to_numpy() >= 25.0
        calm_mask = test_df['wind_speed_100m'].to_numpy() < 3.0
        pred[storm_mask | calm_mask] = 0.0
        preds_test[q_name] = pred

        model_file = os.path.join(MODEL_DIR, f"xgb_wind_{q_name}.json")
        reg.save_model(model_file)
        print(f"  -> Saved model artifact: {os.path.basename(model_file)}")

    p10 = np.minimum(preds_test["p10"], preds_test["p50"])
    p50 = preds_test["p50"]
    p90 = np.maximum(preds_test["p90"], preds_test["p50"])

    mae_base = calculate_mae(y_test, baseline_test)
    rmse_base = calculate_rmse(y_test, baseline_test)

    mae_xgb = calculate_mae(y_test, p50)
    rmse_xgb = calculate_rmse(y_test, p50)

    skill_score = calculate_skill_score(mae_xgb, mae_base)

    in_interval = np.sum((y_test >= p10) & (y_test <= p90))
    picp = (in_interval / len(y_test)) * 100.0
    pinaw = (np.mean(p90 - p10) / cap_mw) * 100.0

    pb_10 = pinball_loss(y_test, p10, 0.10)
    pb_50 = pinball_loss(y_test, p50, 0.50)
    pb_90 = pinball_loss(y_test, p90, 0.90)

    print("\n" + "-"*65)
    print(f"{'WIND BACKTEST EVALUATION SCORECARD':^65}")
    print("-"*65)
    print(f"Benchmark Standard (Persistence): MAE = {mae_base:.2f} MW | RMSE = {rmse_base:.2f} MW")
    print(f"XGBoost Point Forecast (P50):    MAE = {mae_xgb:.2f} MW | RMSE = {rmse_xgb:.2f} MW")
    print(f"FORECAST SKILL IMPROVEMENT:       +{skill_score:.1f}% OVER BASELINE")
    print(f"Quantile Pinball Losses:          P10 = {pb_10:.3f}, P50 = {pb_50:.3f}, P90 = {pb_90:.3f}")
    print(f"Confidence Band Coverage (PICP):  {picp:.1f}% of actuals in [P10, P90] (Expected ~80%)")
    print(f"Interval Sharpness Width (PINAW): {pinaw:.1f}% of turbine capacity")
    print("-"*65)

    return {
        "asset": "wind",
        "mae_baseline": mae_base,
        "rmse_baseline": rmse_base,
        "mae_xgb": mae_xgb,
        "rmse_xgb": rmse_xgb,
        "skill_score_pct": skill_score,
        "coverage_picp": picp,
        "sharpness_pinaw": pinaw
    }

def convert_to_python_types(obj):
    if isinstance(obj, dict):
        return {k: convert_to_python_types(v) for k, v in obj.items()}
    elif isinstance(obj, (np.floating, np.integer)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj

def main():
    solar_metrics = convert_to_python_types(train_and_backtest_solar())
    wind_metrics = convert_to_python_types(train_and_backtest_wind())

    # Save summary report to JSON
    summary_path = os.path.join(MODEL_DIR, "xgboost_backtest_summary.json")
    summary = {
        "solar": solar_metrics,
        "wind": wind_metrics,
        "status": "All XGBoost quantile models trained and serialized successfully."
    }
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\nSaved XGBoost backtest scorecard to: {summary_path}")

if __name__ == "__main__":
    main()
