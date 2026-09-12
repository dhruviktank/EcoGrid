"""
Synthetic / Dummy Data Generator for Nimbus Platform (Renewable Energy Intelligence)
Generates deterministic 72-hour weather series and historical generation datasets
for offline development and end-to-end stack verification.
"""

import os
import json
import math
from datetime import datetime, timezone, timedelta
import pandas as pd
import numpy as np

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
SITES_PATH = os.path.join(DATA_DIR, "sample_sites.json")

def load_sites():
    if not os.path.exists(SITES_PATH):
        raise FileNotFoundError(f"Sites file not found at {SITES_PATH}")
    with open(SITES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def generate_72h_weather_forecast(sites, output_csv="dummy_weather_72h.csv"):
    """
    Generates 72 hours of deterministic hourly weather parameters for each site.
    Includes GHI, DNI, ambient temperature, cloud cover, and wind speeds.
    """
    np.random.seed(42)
    start_time = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    records = []

    for site in sites:
        site_id = site["id"]
        lat = site["latitude"]
        lon = site["longitude"]
        site_type = site["type"]

        for h in range(72):
            dt = start_time + timedelta(hours=h)
            local_solar_hour = (dt.hour + lon / 15.0) % 24

            # Diurnal Solar Profile
            if 6.0 <= local_solar_hour <= 18.5:
                solar_sin = math.sin(math.pi * (local_solar_hour - 6.0) / 12.5)
                # Simulated weather wave (clouds increase on day 2 to test risk detection)
                cloud_wave = 15.0 + 35.0 * math.sin((h + 10) / 14.0) + 10.0 * math.cos(h / 5.0)
                cloud_cover = float(np.clip(cloud_wave, 5.0, 95.0))
                clearness = 1.0 - (cloud_cover / 100.0) * 0.72
                ghi = max(0.0, 1050.0 * solar_sin * clearness)
                dni = max(0.0, 960.0 * (solar_sin ** 1.25) * (1.0 - (cloud_cover / 100.0) * 0.88))
            else:
                cloud_cover = float(np.clip(25.0 + 20.0 * math.sin(h / 8.0), 0.0, 90.0))
                ghi = 0.0
                dni = 0.0

            # Diurnal Temperature Profile
            temp_c = 22.0 + 9.5 * math.sin(math.pi * (local_solar_hour - 9.0) / 12.0) + 2.0 * math.sin(h / 18.0)

            # Wind Profile: higher offshore / mountain pass (Muppandal, Hornsea)
            base_wind = 10.5 if site_type == "wind" else (7.0 if site_type == "hybrid" else 5.0)
            wind_noise = 2.8 * math.sin(math.pi * (local_solar_hour - 14.0) / 12.0) + 2.0 * math.cos(h / 6.0)
            wind_10m = max(1.2, base_wind + wind_noise)
            # Power law wind shear alpha ~ 0.18 onshore, 0.12 offshore
            shear_alpha = 0.12 if "Offshore" in site.get("description", "") else 0.18
            wind_100m = wind_10m * ((site.get("hub_height_m", 100.0) / 10.0) ** shear_alpha)

            records.append({
                "site_id": site_id,
                "timestamp": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "hour_ahead": h + 1,
                "temperature_2m": round(temp_c, 2),
                "cloud_cover_pct": round(cloud_cover, 1),
                "ghi_wm2": round(ghi, 2),
                "dni_wm2": round(dni, 2),
                "wind_speed_10m": round(wind_10m, 2),
                "wind_speed_100m": round(wind_100m, 2)
            })

    df = pd.DataFrame(records)
    out_path = os.path.join(DATA_DIR, output_csv)
    df.to_csv(out_path, index=False)
    print(f"Generated {len(df)} weather records -> {out_path}")
    return df

def generate_historical_scada_data(sites, days=30, output_csv="historical_generation_dummy.csv"):
    """
    Generates 30 days of hourly historical SCADA generation records for training
    and backtesting the Persistence baseline, XGBoost, and Prophet models.
    """
    np.random.seed(1337)
    end_time = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    start_time = end_time - timedelta(days=days)
    total_hours = days * 24

    records = []

    for site in sites:
        site_id = site["id"]
        cap_mw = float(site["capacity_mw"])
        site_type = site["type"]
        solar_cap = float(site.get("solar_capacity_mw", cap_mw if site_type in ["solar", "hybrid"] else 0.0))
        wind_cap = float(site.get("wind_capacity_mw", cap_mw if site_type in ["wind", "hybrid"] else 0.0))
        cut_in = float(site.get("cut_in_speed_ms", 3.0))
        rated = float(site.get("rated_speed_ms", 12.0))
        cut_out = float(site.get("cut_out_speed_ms", 25.0))

        for h in range(total_hours):
            dt = start_time + timedelta(hours=h)
            local_hour = (dt.hour + site["longitude"] / 15.0) % 24

            # Solar irradiance model
            if 6.0 <= local_hour <= 18.5:
                solar_sin = math.sin(math.pi * (local_hour - 6.0) / 12.5)
                cloud = float(np.clip(np.random.normal(25, 20), 0, 95))
                ghi = max(0.0, 1000.0 * solar_sin * (1.0 - cloud / 130.0))
                dni = max(0.0, 900.0 * (solar_sin ** 1.2) * (1.0 - cloud / 110.0))
            else:
                cloud = float(np.clip(np.random.normal(30, 15), 0, 85))
                ghi = 0.0
                dni = 0.0

            temp = 20.0 + 10.0 * math.sin(math.pi * (local_hour - 9.0) / 12.0) + np.random.normal(0, 1.5)

            # Wind speed model (Weibull distributed)
            wind_base = 8.0 if site_type == "wind" else 5.5
            wind_10m = max(0.5, float(np.random.weibull(2.0) * (wind_base / 1.12)))
            wind_100m = wind_10m * (100.0 / 10.0) ** 0.18

            # Physical generation calculation
            # Solar MW
            solar_mw = 0.0
            if solar_cap > 0:
                cell_temp = temp + (ghi / 800.0) * 25.0
                derate = max(0.7, 1.0 - 0.004 * max(0.0, cell_temp - 25.0))
                solar_mw = solar_cap * min(1.0, ghi / 1000.0) * derate * (1.0 + np.random.normal(0, 0.02))
                solar_mw = max(0.0, min(solar_cap, solar_mw))

            # Wind MW
            wind_mw = 0.0
            if wind_cap > 0:
                if wind_100m < cut_in or wind_100m >= cut_out:
                    wind_mw = 0.0
                elif wind_100m >= rated:
                    wind_mw = wind_cap
                else:
                    cf = ((wind_100m - cut_in) / (rated - cut_in)) ** 3
                    wind_mw = wind_cap * cf
                wind_mw = max(0.0, min(wind_cap, wind_mw * (1.0 + np.random.normal(0, 0.03))))

            total_mw = round(solar_mw + wind_mw, 2)

            records.append({
                "timestamp": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "site_id": site_id,
                "capacity_mw": cap_mw,
                "actual_generation_mw": total_mw,
                "solar_generation_mw": round(solar_mw, 2),
                "wind_generation_mw": round(wind_mw, 2),
                "ghi_wm2": round(ghi, 2),
                "dni_wm2": round(dni, 2),
                "wind_speed_100m": round(wind_100m, 2),
                "wind_speed_10m": round(wind_10m, 2),
                "temperature_c": round(temp, 2),
                "cloud_cover_pct": round(cloud, 1)
            })

    df = pd.DataFrame(records)
    out_path = os.path.join(DATA_DIR, output_csv)
    df.to_csv(out_path, index=False)
    print(f"Generated {len(df)} historical generation records -> {out_path}")
    return df

if __name__ == "__main__":
    sites = load_sites()
    print(f"Loaded {len(sites)} sites from {SITES_PATH}")
    generate_72h_weather_forecast(sites)
    generate_historical_scada_data(sites, days=30)
    print("Dummy dataset creation complete!")
