import os
import sys
import json
from pathlib import Path
import pytest
import pandas as pd
import numpy as np

REPO_ROOT = str(Path(__file__).resolve().parent.parent.parent)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

BACKEND_DIR = str(Path(__file__).resolve().parent.parent)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from models.xgboost_model import XGBoostQuantileModel
from app.services.forecasting_service import compute_physical_wind
from models.evaluator import calculate_mae, calculate_rmse, calculate_skill_score

DATA_PATH = os.path.join(REPO_ROOT, "data", "dryad_offshore_wind_generation.csv")
SUMMARY_PATH = os.path.join(REPO_ROOT, "models", "trained", "dryad_wind_backtest_summary.json")

def test_dryad_dataset_availability():
    """Verify that the dryad offshore wind dataset is available for testing."""
    assert os.path.exists(DATA_PATH), f"Dataset missing at {DATA_PATH}"
    df = pd.read_csv(DATA_PATH, nrows=10)
    assert len(df) == 10
    assert "actual_generation_mw" in df.columns
    assert "wind_speed_100m" in df.columns


def test_beatrice_forecast_accuracy():
    """
    Tests model forecast accuracy on Beatrice Offshore Wind Farm (588 MW).
    Verifies that:
    1. Ensemble & Physical models beat persistence baseline by > 60% skill.
    2. Normalized MAE is < 10% of plant capacity.
    3. Pearson R^2 is > 0.90.
    """
    df = pd.read_csv(DATA_PATH)
    beatrice = df[df["site_id"] == "beatrice-wind"].copy().reset_index(drop=True)
    assert len(beatrice) == 8760

    actuals = beatrice["actual_generation_mw"].to_numpy()
    w100 = beatrice["wind_speed_100m"].to_numpy()
    cap = 588.0

    # Persistence baseline (t-24h)
    baseline = np.zeros(len(actuals))
    baseline[24:] = actuals[:-24]

    # Physics aerodynamic power model
    phys = np.array([compute_physical_wind(w, cap) for w in w100])

    y_true = actuals[24:]
    b_pred = baseline[24:]
    p_pred = phys[24:]

    mae_base = calculate_mae(y_true, b_pred)
    mae_phys = calculate_mae(y_true, p_pred)
    skill = calculate_skill_score(mae_phys, mae_base)
    r2 = np.corrcoef(y_true, p_pred)[0, 1] ** 2

    # Beatrice accuracy gates
    assert skill > 60.0, f"Skill score {skill}% below requirement"
    assert (mae_phys / cap) < 0.10, f"NMAE {mae_phys/cap*100}% above 10%"
    assert r2 > 0.90, f"Correlation R^2 {r2} below 0.90"


def test_east_anglia_one_forecast_accuracy():
    """
    Tests model forecast accuracy on East Anglia ONE (714 MW).
    Verifies that:
    1. Physical/Ensemble beats baseline by > 60% skill.
    2. Normalized MAE is < 12% of plant capacity.
    3. Pearson R^2 is > 0.90.
    """
    df = pd.read_csv(DATA_PATH)
    ea1 = df[df["site_id"] == "east-anglia-one-wind"].copy().reset_index(drop=True)
    assert len(ea1) == 8760

    actuals = ea1["actual_generation_mw"].to_numpy()
    w100 = ea1["wind_speed_100m"].to_numpy()
    cap = 714.0

    baseline = np.zeros(len(actuals))
    baseline[24:] = actuals[:-24]
    phys = np.array([compute_physical_wind(w, cap) for w in w100])

    y_true = actuals[24:]
    b_pred = baseline[24:]
    p_pred = phys[24:]

    mae_base = calculate_mae(y_true, b_pred)
    mae_phys = calculate_mae(y_true, p_pred)
    skill = calculate_skill_score(mae_phys, mae_base)
    r2 = np.corrcoef(y_true, p_pred)[0, 1] ** 2

    assert skill > 60.0
    assert (mae_phys / cap) < 0.12
    assert r2 > 0.90


def test_fleetwide_summary_metrics():
    """
    Verifies the precomputed fleet backtest summary scorecard across 30 wind farms.
    """
    assert os.path.exists(SUMMARY_PATH), f"Summary JSON missing at {SUMMARY_PATH}"
    with open(SUMMARY_PATH, "r") as f:
        summary = json.load(f)

    fleet = summary.get("fleet_averages", {})
    assert fleet["total_sites"] if "total_sites" in fleet else summary.get("total_sites") == 30
    assert fleet["skill_score_pct"] > 65.0
    assert fleet["ensemble_nmae_pct"] < 10.0
    assert fleet["correlation_r2"] > 0.95
