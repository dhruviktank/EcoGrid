"""
Fetch Raw 72-Hour Weather Forecast from Open-Meteo API
Target: Bhadla Solar Park (Rajasthan, India)
Coordinates: 27.539 N, 71.915 E
Variables: GHI (shortwave_radiation_instant / direct + diffuse), DNI, 
           Wind Speed at 100m (hub height) and 10m, temperature, cloud cover.
"""

import os
import json
import requests

def fetch_and_save_raw_open_meteo(lat=27.539, lon=71.915, output_file="raw_open_meteo_72h.json"):
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": [
            "temperature_2m",
            "relative_humidity_2m",
            "cloud_cover",
            "shortwave_radiation_instant",  # Global Horizontal Irradiance (GHI) in W/m²
            "direct_normal_irradiance",    # Direct Normal Irradiance (DNI) in W/m²
            "direct_radiation",            # Direct beam on horizontal in W/m²
            "diffuse_radiation",           # Diffuse solar radiation in W/m²
            "wind_speed_10m",              # Wind speed at 10 meters in km/h or m/s
            "wind_speed_100m",             # Wind speed at 100 meters (hub height)
            "wind_direction_100m",         # Wind direction at 100 meters in degrees
            "wind_gusts_10m"
        ],
        "wind_speed_unit": "ms",           # Meters per second (standard utility metric)
        "forecast_days": 3,                # 72 hours
        "timezone": "UTC"
    }

    print(f"Connecting to Open-Meteo API: {url}...")
    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()
    raw_data = response.json()

    output_path = os.path.join(os.path.dirname(__file__), output_file)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(raw_data, f, indent=2)

    print(f"Successfully saved raw Open-Meteo response to: {output_path}")
    print(f"Response Top-level Keys: {list(raw_data.keys())}")
    print(f"Hourly Variables Captured: {list(raw_data.get('hourly', {}).keys())}")
    print(f"Total Hourly Timestamps: {len(raw_data.get('hourly', {}).get('time', []))}")
    return raw_data

if __name__ == "__main__":
    fetch_and_save_raw_open_meteo()
