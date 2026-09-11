import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from app.services.weather_service import get_hourly_weather
from app.services.forecasting_service import generate_renewable_forecast, compute_physical_solar, compute_physical_wind
from app.services.grid_optimizer import compute_grid_dispatch

def test_physical_solar_calculation():
    # Zero solar at night
    zero_out = compute_physical_solar(ghi=0.0, dni=0.0, temp_c=20.0, capacity_mw=1000.0)
    assert zero_out == 0.0

    # Peak solar noon
    peak_out = compute_physical_solar(ghi=1000.0, dni=900.0, temp_c=25.0, capacity_mw=1000.0)
    assert 900.0 <= peak_out <= 1000.0

    # Hot day panel derating check
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

def test_weather_ingestion_and_forecasting():
    # Weather test for Bhadla Solar
    weather = get_hourly_weather(lat=27.539, lon=71.915, forecast_days=1)
    assert weather["count"] >= 24
    assert len(weather["data"]) >= 24

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

    forecast = generate_renewable_forecast(sample_solar_site, weather["data"])
    assert forecast["forecast_hours"] >= 24
    assert len(forecast["timeline"]) >= 24

    # Ensure P10 <= P50 <= P90
    for item in forecast["timeline"]:
        gen = item["generation"]
        assert gen["p10_mw"] <= gen["total_p50_mw"] + 0.01
        assert gen["total_p50_mw"] <= gen["p90_mw"] + 0.01

def test_grid_optimizer_dispatch():
    sample_wind_site = {
        "id": "muppandal-wind",
        "name": "Muppandal Wind Farm",
        "type": "wind",
        "capacity_mw": 1500.0,
        "bess_capacity_mwh": 600.0,
        "bess_max_power_mw": 150.0
    }
    weather = get_hourly_weather(lat=8.261, lon=77.545, forecast_days=1)
    forecast = generate_renewable_forecast(sample_wind_site, weather["data"])
    dispatch = compute_grid_dispatch(sample_wind_site, forecast["timeline"])

    assert "summary" in dispatch
    assert "total_clean_gen_mwh" in dispatch["summary"]
    assert "co2_avoided_tons" in dispatch["summary"]
    assert len(dispatch["dispatch_timeline"]) == len(forecast["timeline"])
