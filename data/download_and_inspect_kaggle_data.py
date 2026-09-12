"""
Download and Inspect Historical Solar Generation SCADA Dataset (Kaggle Plant 1)
Downloads real Kaggle dataset: 'Solar Power Generation Data' (Plant 1 Generation & Weather Data)
Inspects:
- Time range
- Granularity (e.g. 15-minute / hourly)
- Units (kW, kWh, W/m², °C)
- Aggregation requirements for alignment with hourly Open-Meteo weather
"""

import os
import requests
import pandas as pd

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
GEN_DATA_URL = "https://raw.githubusercontent.com/sanika0107/Energy_Prediction/main/Week1_Preprocessing/Plant_1_Generation_Data.csv"
WEATHER_DATA_URL = "https://raw.githubusercontent.com/sanika0107/Energy_Prediction/main/Week1_Preprocessing/Plant_1_Weather_Sensor_Data.csv"

GEN_CSV_PATH = os.path.join(DATA_DIR, "Plant_1_Generation_Data.csv")
WEATHER_CSV_PATH = os.path.join(DATA_DIR, "Plant_1_Weather_Sensor_Data.csv")

def download_file(url, target_path):
    if os.path.exists(target_path):
        print(f"File already exists: {target_path}")
        return
    print(f"Downloading from {url} -> {target_path}...")
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    with open(target_path, "wb") as f:
        f.write(resp.content)
    print(f"Downloaded {os.path.getsize(target_path) / (1024*1024):.2f} MB")

def inspect_generation_data():
    download_file(GEN_DATA_URL, GEN_CSV_PATH)
    download_file(WEATHER_DATA_URL, WEATHER_CSV_PATH)

    print("\n" + "="*70)
    print("1. INSPECTING PLANT 1 GENERATION DATA")
    print("="*70)
    df_gen = pd.read_csv(GEN_CSV_PATH)
    print(f"Shape: {df_gen.shape} (Rows: {len(df_gen):,}, Columns: {len(df_gen.columns)})")
    print(f"Columns: {list(df_gen.columns)}")
    print("\nSample Rows:")
    print(df_gen.head(3))

    # Parse timestamps
    df_gen['DATE_TIME'] = pd.to_datetime(df_gen['DATE_TIME'], format="%d-%m-%Y %H:%M")
    min_time = df_gen['DATE_TIME'].min()
    max_time = df_gen['DATE_TIME'].max()
    print(f"\nTime Range: {min_time} to {max_time} (Duration: {(max_time - min_time).days} days)")

    # Check granularity (time step between successive readings)
    sample_inverter = df_gen[df_gen['SOURCE_KEY'] == df_gen['SOURCE_KEY'].iloc[0]].sort_values('DATE_TIME')
    time_diffs = sample_inverter['DATE_TIME'].diff().dropna()
    print(f"Granularity / Sampling Interval: {time_diffs.mode().iloc[0]} (Mode frequency)")

    inverters = df_gen['SOURCE_KEY'].nunique()
    print(f"Number of distinct inverters (SOURCE_KEY): {inverters}")

    print("\nGeneration Metrics Summary:")
    print(f"- DC_POWER (kW per inverter): min={df_gen['DC_POWER'].min()}, max={df_gen['DC_POWER'].max():.2f}, mean={df_gen['DC_POWER'].mean():.2f}")
    print(f"- AC_POWER (kW per inverter): min={df_gen['AC_POWER'].min()}, max={df_gen['AC_POWER'].max():.2f}, mean={df_gen['AC_POWER'].mean():.2f}")
    print(f"- DAILY_YIELD (kWh cumulative/day): max daily={df_gen['DAILY_YIELD'].max():.2f}")
    print(f"- TOTAL_YIELD (kWh inverter cumulative lifetime): max={df_gen['TOTAL_YIELD'].max():,.0f}")

    print("\n" + "="*70)
    print("2. INSPECTING PLANT 1 WEATHER SENSOR DATA")
    print("="*70)
    df_weather = pd.read_csv(WEATHER_CSV_PATH)
    print(f"Shape: {df_weather.shape} (Rows: {len(df_weather):,}, Columns: {len(df_weather.columns)})")
    print(f"Columns: {list(df_weather.columns)}")
    print("\nSample Rows:")
    print(df_weather.head(3))

    df_weather['DATE_TIME'] = pd.to_datetime(df_weather['DATE_TIME'], format="%Y-%m-%d %H:%M:%S")
    w_min = df_weather['DATE_TIME'].min()
    w_max = df_weather['DATE_TIME'].max()
    print(f"\nWeather Time Range: {w_min} to {w_max} (Duration: {(w_max - w_min).days} days)")
    w_diffs = df_weather.sort_values('DATE_TIME')['DATE_TIME'].diff().dropna()
    print(f"Weather Granularity / Sampling Interval: {w_diffs.mode().iloc[0]}")
    print(f"- AMBIENT_TEMPERATURE (°C): min={df_weather['AMBIENT_TEMPERATURE'].min():.1f}, max={df_weather['AMBIENT_TEMPERATURE'].max():.1f}")
    print(f"- MODULE_TEMPERATURE (°C): min={df_weather['MODULE_TEMPERATURE'].min():.1f}, max={df_weather['MODULE_TEMPERATURE'].max():.1f}")
    print(f"- IRRADIATION (kW/m² or W/m²): min={df_weather['IRRADIATION'].min():.4f}, max={df_weather['IRRADIATION'].max():.4f}")

    print("\n" + "="*70)
    print("3. HOURLY RESAMPLING & ALIGNMENT STRATEGY")
    print("="*70)
    print("To align with 72-hour Open-Meteo hourly weather:")
    print("1. Group all inverters at each 15-min interval to compute total plant AC power (kW -> MW):")
    print("   Plant_AC_MW = sum(AC_POWER across all 22 inverters) / 1000.0")
    print("2. Resample 15-minute intervals to 1-hour intervals: .resample('1H', on='DATE_TIME').mean()")
    print("3. Align timestamp with Open-Meteo 'YYYY-MM-DDTHH:00:00Z' UTC format.")

if __name__ == "__main__":
    inspect_generation_data()
