import os
import sys
import json
from pathlib import Path
import pytest
import pandas as pd
from fastapi.testclient import TestClient

REPO_ROOT = str(Path(__file__).resolve().parent.parent.parent)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

BACKEND_DIR = str(Path(__file__).resolve().parent.parent)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
from app.services.historical_service import get_historical_vs_predicted, _load_historical_site_data
from data.load_dryad_wind_farms import load_and_process_dryad_file, DRYAD_DIR, OUTPUT_CSV

client = TestClient(app)

def test_dryad_loader_unit_conversion_and_resampling():
    """
    Tests that the generic loader function correctly:
    1. Multiplies MWh by 2.0 to calculate average MW over 30-minute intervals.
    2. Resamples half-hourly rows into continuous hourly MW averages.
    3. Reindexes without missing hours (zero gaps).
    """
    beatrice_csv = os.path.join(DRYAD_DIR, "Beatrice.csv")
    assert os.path.exists(beatrice_csv), f"Dryad Beatrice file not found at {beatrice_csv}"

    # Load 1 week slice for fast testing
    df_hourly = load_and_process_dryad_file(
        file_path=beatrice_csv,
        site_id="beatrice-wind",
        capacity_mw=588.0,
        start_date="2023-01-01 00:00:00",
        end_date="2023-01-07 23:00:00"
    )

    # Verify 7 days * 24 hours = 168 rows
    assert len(df_hourly) == 168
    assert df_hourly.isna().sum().sum() == 0

    # Verify continuous hourly timestamps (exactly 1h delta, zero gaps)
    ts = pd.to_datetime(df_hourly["timestamp"])
    diffs = ts.diff().dropna().unique()
    assert len(diffs) == 1
    assert diffs[0] == pd.Timedelta(hours=1)

    # Verify generation is in MW and bounded within physical limits
    assert df_hourly["actual_generation_mw"].min() >= 0.0
    assert df_hourly["actual_generation_mw"].max() <= 588.0 * 1.05
    assert df_hourly["actual_generation_mw"].max() > 200.0  # Demonstrates unit conversion MW = MWh * 2

    # Verify identical column schema
    expected_cols = [
        "timestamp", "site_id", "capacity_mw", "actual_generation_mw",
        "solar_generation_mw", "wind_generation_mw", "ghi_wm2", "dni_wm2",
        "wind_speed_100m", "wind_speed_10m", "temperature_c", "cloud_cover_pct"
    ]
    assert list(df_hourly.columns) == expected_cols


def test_dryad_separate_data_file_schema_and_integrity():
    """
    Verifies that the separate data file data/dryad_offshore_wind_generation.csv
    exists, matches the backend filtering schema (df[df['site_id'] == site_id]),
    and contains continuous hourly data for Beatrice and East Anglia ONE.
    """
    assert os.path.exists(OUTPUT_CSV), f"Output CSV not found at {OUTPUT_CSV}"

    dummy_csv = os.path.join(REPO_ROOT, "data", "historical_generation_dummy.csv")
    dummy_cols = list(pd.read_csv(dummy_csv, nrows=1).columns)
    dryad_cols = list(pd.read_csv(OUTPUT_CSV, nrows=1).columns)

    # Exact column schema match
    assert dryad_cols == dummy_cols

    # Test backend filter structure: df[df['site_id'] == site_id]
    df = pd.read_csv(OUTPUT_CSV)
    for sid, expected_cap in [("beatrice-wind", 588.0), ("east-anglia-one-wind", 714.0)]:
        site_sub = df[df["site_id"] == sid]
        assert not site_sub.empty, f"Site {sid} not found in separate data file!"
        assert site_sub["capacity_mw"].iloc[0] == expected_cap
        assert len(site_sub) == 8760  # Full year continuous hourly records

        # Zero gaps check
        sub_ts = pd.to_datetime(site_sub["timestamp"])
        sub_diffs = sub_ts.diff().dropna().unique()
        assert len(sub_diffs) == 1 and sub_diffs[0] == pd.Timedelta(hours=1)


def test_sample_sites_json_metadata():
    """
    Confirms sample_sites.json contains entries for Beatrice and East Anglia ONE
    alongside existing 5 sites, following the exact schema (site_id, name, type, capacity, lat, lon).
    """
    sites_path = os.path.join(REPO_ROOT, "data", "sample_sites.json")
    assert os.path.exists(sites_path)

    with open(sites_path, "r", encoding="utf-8") as f:
        sites = json.load(f)

    site_map = {s.get("site_id") or s.get("id"): s for s in sites}

    # Original 5 sites preserved
    for orig in ["bhadla-solar", "desert-sunlight", "muppandal-wind", "hornsea-wind", "hybrid-gansu"]:
        assert orig in site_map, f"Original site {orig} missing from sample_sites.json!"

    # Beatrice offshore wind verified
    beatrice = site_map.get("beatrice-wind")
    assert beatrice is not None
    assert beatrice["name"] == "Beatrice Offshore Wind Farm"
    assert beatrice["type"] == "wind"
    assert beatrice["capacity_mw"] == 588.0
    assert abs(beatrice["latitude"] - 58.25) < 0.1
    assert abs(beatrice["longitude"] - (-2.90)) < 0.1

    # East Anglia ONE offshore wind verified
    ea1 = site_map.get("east-anglia-one-wind")
    assert ea1 is not None
    assert ea1["name"] == "East Anglia ONE Offshore Wind"
    assert ea1["type"] == "wind"
    assert ea1["capacity_mw"] == 714.0
    assert abs(ea1["latitude"] - 52.23) < 0.1
    assert abs(ea1["longitude"] - 2.48) < 0.1


def test_api_historical_vs_predicted_for_new_plants():
    """
    Confirms that the FastAPI endpoint /api/historical-vs-predicted fetches
    and evaluates data for the new Dryad wind plants.
    """
    for site_id in ["beatrice-wind", "east-anglia-one-wind"]:
        res = client.get(f"/api/historical-vs-predicted?site_id={site_id}&window_hours=72")
        assert res.status_code == 200
        data = res.json()
        assert data["site_id"] == site_id
        assert data["window_hours"] == 72
        assert len(data["series"]) == 72
        assert "mae_mw" in data["metrics"]
        assert "rmse_mw" in data["metrics"]
        assert "picp_coverage_pct" in data["metrics"]
        assert data["metrics"]["max_actual_mw"] > 0.0
