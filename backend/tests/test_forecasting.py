import os
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

REPO_ROOT = str(Path(__file__).resolve().parent.parent.parent)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

BACKEND_DIR = str(Path(__file__).resolve().parent.parent)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
from app.services.weather_service import get_hourly_weather
from app.services.forecasting_service import (
    generate_renewable_forecast, 
    compute_physical_solar, 
    compute_physical_wind
)
from app.services.grid_optimizer import compute_grid_dispatch
from models.baseline import PersistenceBaselineModel
from models.evaluator import calculate_mae, calculate_skill_score

client = TestClient(app)

def test_physical_solar_calculation():
    # Zero solar at night
    zero_out = compute_physical_solar(ghi=0.0, dni=0.0, temp_c=20.0, capacity_mw=1000.0)
    assert zero_out == 0.0

    # Peak solar noon
    peak_out = compute_physical_solar(ghi=1000.0, dni=900.0, temp_c=25.0, capacity_mw=1000.0)
    assert 900.0 <= peak_out <= 1000.0

    # Panel temperature derating
    hot_out = compute_physical_solar(ghi=1000.0, dni=900.0, temp_c=45.0, capacity_mw=1000.0)
    assert hot_out < peak_out

def test_physical_wind_calculation():
    # Below cut-in speed
    calm_out = compute_physical_wind(wind_100m=2.0, capacity_mw=500.0, cut_in=3.0, rated=12.0, cut_out=25.0)
    assert calm_out == 0.0

    # Rated wind speed
    rated_out = compute_physical_wind(wind_100m=12.5, capacity_mw=500.0, cut_in=3.0, rated=12.0, cut_out=25.0)
    assert rated_out == 500.0

    # Storm cut-out trip
    storm_out = compute_physical_wind(wind_100m=26.0, capacity_mw=500.0, cut_in=3.0, rated=12.0, cut_out=25.0)
    assert storm_out == 0.0

def test_persistence_baseline_model():
    baseline = PersistenceBaselineModel()
    site = {"id": "bhadla-solar", "type": "solar", "capacity_mw": 1000.0}
    # Mock historical generation
    mock_history = [{"actual_generation_mw": 450.0} for _ in range(48)]
    preds = baseline.predict(site, mock_history, horizon_hours=24)
    assert len(preds) == 24
    assert all("baseline_mw" in p for p in preds)

def test_forecast_skill_score_calculation():
    # When model MAE is lower than baseline MAE, skill score should be positive
    mae_model = 25.0
    mae_baseline = 50.0
    skill = calculate_skill_score(mae_model, mae_baseline)
    assert skill == 50.0  # 50% improvement over persistence

def test_dummy_weather_ingestion():
    # Tests that local dummy weather is loaded cleanly without external network
    weather = get_hourly_weather(lat=27.539, lon=71.915, forecast_days=1, site_id="bhadla-solar", use_live_api=False)
    assert weather["count"] >= 24
    assert len(weather["data"]) >= 24
    assert "ghi_wm2" in weather["data"][0]

def test_end_to_end_forecast_and_decision_engine():
    sample_solar_site = {
        "id": "bhadla-solar",
        "name": "Bhadla Solar Park",
        "type": "solar",
        "capacity_mw": 2245.0,
        "panel_tilt_deg": 25.0,
        "panel_efficiency": 0.21,
        "temp_coefficient": -0.0038,
        "bess_capacity_mwh": 1200.0,
        "bess_max_power_mw": 300.0
    }

    weather = get_hourly_weather(lat=27.539, lon=71.915, forecast_days=1, site_id="bhadla-solar")
    forecast = generate_renewable_forecast(sample_solar_site, weather["data"])

    assert forecast["forecast_hours"] >= 24
    assert "skill_score_pct" in forecast
    assert forecast["skill_score_pct"] > 0

    # Ensure P10 <= P50 <= P90 monotonic bounds
    for item in forecast["timeline"]:
        gen = item["generation"]
        assert gen["p10_mw"] <= gen["total_p50_mw"] + 0.05
        assert gen["total_p50_mw"] <= gen["p90_mw"] + 0.05
        assert "baseline_mw" in gen

    # Test Grid Dispatch and Persona Lenses
    dispatch = compute_grid_dispatch(sample_solar_site, forecast["timeline"])
    assert "summary" in dispatch
    summary = dispatch["summary"]
    assert "operator" in summary
    assert "planner" in summary
    assert "trader" in summary

def test_fastapi_endpoints():
    # Test Root
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert "Nimbus" in res_root.json()["platform"]

    # Test Sites
    res_sites = client.get("/api/sites")
    assert res_sites.status_code == 200
    assert res_sites.json()["count"] >= 1

    # Test Forecast POST
    payload = {
        "site_id": "bhadla-solar",
        "forecast_days": 1,
        "scenario_shocks": {"cloud_multiplier": 1.0, "wind_multiplier": 1.0, "temp_delta": 0.0}
    }
    res_fc = client.post("/api/forecast", json=payload)
    assert res_fc.status_code == 200
    data = res_fc.json()
    assert "forecast_timeline" in data
    assert "grid_summary" in data
    assert "skill_score_pct" in data

    # Test Model Benchmark GET
    res_bench = client.get("/api/models/benchmark")
    assert res_bench.status_code == 200
    assert len(res_bench.json()["models"]) >= 3

    # Test Historical vs Predicted GET
    res_hist = client.get("/api/historical-vs-predicted?site_id=bhadla-solar&window_hours=24")
    assert res_hist.status_code == 200
    h_data = res_hist.json()
    assert "series" in h_data
    assert len(h_data["series"]) == 24
    assert "metrics" in h_data
    assert "mae_mw" in h_data["metrics"]
    assert "picp_coverage_pct" in h_data["metrics"]
    assert "actual_mw" in h_data["series"][0]
    assert "predicted_p50_mw" in h_data["series"][0]

def test_feature_store_pipeline():
    from data.feature_store import load_training_features
    solar_df = load_training_features("solar")
    assert len(solar_df) > 100
    assert "gen_lag_24h" in solar_df.columns
    assert "hour_sin" in solar_df.columns
    assert "doy_sin" in solar_df.columns
    assert solar_df.isnull().sum().sum() == 0

    wind_df = load_training_features("wind")
    assert len(wind_df) > 1000
    assert "gen_lag_24h" in wind_df.columns
    assert "wind_speed_100m" in wind_df.columns
    assert wind_df.isnull().sum().sum() == 0
