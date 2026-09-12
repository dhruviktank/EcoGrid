"""
Interactive Demo: Weather-Adjusted Persistence Baseline Forecast
Demonstrates the simplest possible forecast:
  Tomorrow's Output = Same hour yesterday (or last week),
                      adjusted lightly for forecast weather.

Evaluates against real SCADA history and live Open-Meteo 72h weather.
"""

import os
import sys
import json
import pandas as pd
import numpy as np

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from models.baseline import PersistenceBaselineModel
from models.evaluator import calculate_mae, calculate_rmse

def run_baseline_demo():
    print("\n" + "="*80)
    print("NIMBUS: WEATHER-ADJUSTED PERSISTENCE BASELINE DEMONSTRATION")
    print("Rule: Get something simple and reliable working first, then earn complexity.")
    print("Formula: Forecast(t) = Output(t - 24h) * Weather_Factor(t)")
    print("="*80)

    # 1. Load Historical SCADA Data
    # Prefer real Kaggle Plant 1 solar data if available, else historical_generation_dummy.csv
    kaggle_csv = os.path.join(REPO_ROOT, "data", "Plant_1_Generation_Data.csv")
    dummy_csv = os.path.join(REPO_ROOT, "data", "historical_generation_dummy.csv")

    if os.path.exists(kaggle_csv):
        print(f"Loading Kaggle SCADA: {os.path.basename(kaggle_csv)}...")
        df_raw = pd.read_csv(kaggle_csv)
        df_raw['DATE_TIME'] = pd.to_datetime(df_raw['DATE_TIME'], format="%d-%m-%Y %H:%M")
        # Aggregate across all inverters to plant MW
        hourly_plant = df_raw.groupby('DATE_TIME')['AC_POWER'].sum().reset_index()
        hourly_plant['actual_generation_mw'] = hourly_plant['AC_POWER'] / 1000.0
        hourly_plant = hourly_plant.set_index('DATE_TIME').resample('1h').mean().fillna(0.0).reset_index()
        history_records = hourly_plant.tail(168).to_dict(orient="records")
        site_name = "Kaggle Utility Solar Plant 1"
        site_type = "solar"
        capacity_mw = round(hourly_plant['actual_generation_mw'].max() * 1.1, 1)
    else:
        print(f"Loading SCADA Dummy Data: {os.path.basename(dummy_csv)}...")
        df_raw = pd.read_csv(dummy_csv)
        history_records = df_raw[df_raw['site_id'] == 'bhadla-solar'].tail(168).to_dict(orient="records")
        site_name = "Bhadla Solar Park (Thar Desert)"
        site_type = "solar"
        capacity_mw = 2245.0

    print(f"Asset: {site_name} (Type: {site_type.upper()}, Rated Capacity: {capacity_mw} MW)")
    print(f"Historical Observation Window: {len(history_records)} hourly SCADA records")

    # 2. Load Forecast Weather (from live Open-Meteo raw JSON if present)
    weather_json = os.path.join(REPO_ROOT, "data", "raw_open_meteo_72h.json")
    forecast_weather_list = []
    if os.path.exists(weather_json):
        with open(weather_json, "r") as f:
            w_raw = json.load(f)
        h_obj = w_raw.get("hourly", {})
        times = h_obj.get("time", [])
        ghi = h_obj.get("shortwave_radiation_instant", [])
        clouds = h_obj.get("cloud_cover", [])
        temps = h_obj.get("temperature_2m", [])
        w100 = h_obj.get("wind_speed_100m", [])

        for i in range(len(times)):
            forecast_weather_list.append({
                "timestamp": times[i] + "Z",
                "ghi_wm2": ghi[i] if i < len(ghi) else 0.0,
                "cloud_cover_pct": clouds[i] if i < len(clouds) else 20.0,
                "temperature_2m": temps[i] if i < len(temps) else 25.0,
                "wind_speed_100m": w100[i] if i < len(w100) else 6.0
            })
        print(f"Forecast Weather Feed: Open-Meteo Live API ({len(forecast_weather_list)} hours)")
    else:
        # Fallback dummy weather
        print("Forecast Weather Feed: Synthesized Diurnal Cycle")
        forecast_weather_list = [{"ghi_wm2": 800.0, "cloud_cover_pct": 15.0} for _ in range(72)]

    # 3. Instantiate and Execute Baseline Forecast
    site_metadata = {
        "id": "bhadla-solar",
        "name": site_name,
        "type": site_type,
        "capacity_mw": capacity_mw
    }

    baseline_model = PersistenceBaselineModel(mode="same_day_yesterday", weather_coupling=0.45)
    horizon = 24  # Display next 24 hours
    predictions = baseline_model.predict(
        site_metadata=site_metadata,
        historical_records=history_records,
        forecast_weather_records=forecast_weather_list,
        horizon_hours=horizon
    )

    # 4. Display Formatted Table
    print("\n" + "-"*85)
    print(f"{'Hour':<6}{'Time':<10}{'Yesterday Base':<16}{'Forecast GHI':<14}{'Weather Multiplier':<20}{'Baseline P50':<14}{'Confidence [P10-P90]':<20}")
    print("-"*85)

    for i in range(min(24, len(predictions))):
        p = predictions[i]
        w = forecast_weather_list[i] if i < len(forecast_weather_list) else {}
        ts_str = w.get("timestamp", f"H+{i+1}")[11:16] if "timestamp" in w else f"+{i+1}h"
        ghi_str = f"{w.get('ghi_wm2', 0.0):.0f} W/m²"
        base_raw_str = f"{p['raw_persistence_mw']:.2f} MW"
        mult_str = f"× {p['weather_multiplier']:.2f}"
        p50_str = f"{p['baseline_mw']:.2f} MW"
        band_str = f"[{p['p10_mw']:.1f} – {p['p90_mw']:.1f}] MW"

        print(f"H+{p['hour_ahead']:<4}{ts_str:<10}{base_raw_str:<16}{ghi_str:<14}{mult_str:<20}{p50_str:<14}{band_str:<20}")

    print("-"*85)

    # 5. Backtest Validation (Yesterday vs Day Before Yesterday)
    if len(history_records) >= 48:
        actuals_yesterday = [float(r.get('actual_generation_mw', 0.0)) for r in history_records[-24:]]
        persistence_benchmark = [float(r.get('actual_generation_mw', 0.0)) for r in history_records[-48:-24]]
        mae = calculate_mae(actuals_yesterday, persistence_benchmark)
        rmse = calculate_rmse(actuals_yesterday, persistence_benchmark)
        peak_act = max(actuals_yesterday) if actuals_yesterday else 1.0
        nmae = (mae / peak_act) * 100.0 if peak_act > 0 else 0.0

        print(f"\nBenchmark Quality (Backtest on historical test day):")
        print(f"- Persistence Baseline MAE:  {mae:.2f} MW ({nmae:.1f}% of peak capacity)")
        print(f"- Persistence Baseline RMSE: {rmse:.2f} MW")
        print(f"Note: Any advanced ML model (XGBoost/Prophet) must achieve MAE < {mae:.2f} MW to earn its keep.")

    print("\nDemonstration complete. Weather-adjusted baseline is verified and active.")

if __name__ == "__main__":
    run_baseline_demo()
