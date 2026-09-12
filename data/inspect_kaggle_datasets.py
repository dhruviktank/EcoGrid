"""
Inspection and Validation of Kaggle Historical Generation Datasets
Analyzes:
1. Solar Power Generation Data (Plant 1 Generation & Weather Sensor Data)
2. Wind Turbine SCADA Dataset (Turbine Power & Wind Speed)

Evaluates:
- Row counts & schema
- Time range (start to end date)
- Granularity (sampling interval: 15-min vs 10-min vs hourly)
- Units (kW, kWh, W/m², m/s, °C)
- Strategy to align timestamps with 72h Open-Meteo weather forecasts
"""

import os
import pandas as pd
import numpy as np

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
SOLAR_GEN_CSV = os.path.join(DATA_DIR, "Plant_1_Generation_Data.csv")
SOLAR_WEATHER_CSV = os.path.join(DATA_DIR, "Plant_1_Weather_Sensor_Data.csv")
WIND_SCADA_CSV = os.path.join(DATA_DIR, "Wind_Turbine_SCADA_Data.csv")

def inspect_solar_data():
    print("="*75)
    print("DATASET 1: KAGGLE SOLAR POWER GENERATION DATA (PLANT 1)")
    print("="*75)

    df_gen = pd.read_csv(SOLAR_GEN_CSV)
    df_gen['DATE_TIME'] = pd.to_datetime(df_gen['DATE_TIME'], format="%d-%m-%Y %H:%M")
    
    start_dt = df_gen['DATE_TIME'].min()
    end_dt = df_gen['DATE_TIME'].max()
    duration_days = (end_dt - start_dt).total_seconds() / 86400.0

    sample_inv = df_gen[df_gen['SOURCE_KEY'] == df_gen['SOURCE_KEY'].iloc[0]].sort_values('DATE_TIME')
    step = sample_inv['DATE_TIME'].diff().dropna().mode().iloc[0]

    print(f"File: {os.path.basename(SOLAR_GEN_CSV)}")
    print(f"Total Records: {len(df_gen):,} rows | Inverters: {df_gen['SOURCE_KEY'].nunique()}")
    print(f"Time Range: {start_dt} to {end_dt} (~{duration_days:.1f} days)")
    print(f"Granularity: {step} (15-minute SCADA intervals)")
    print("\nColumns & Measured Units:")
    print("- DATE_TIME: Timestamp (DD-MM-YYYY HH:MM)")
    print("- PLANT_ID: Plant identifier (integer)")
    print("- SOURCE_KEY: Inverter identifier (string, 22 inverters)")
    print("- DC_POWER: DC power output (kW per inverter)")
    print(f"  Range: {df_gen['DC_POWER'].min():.1f} to {df_gen['DC_POWER'].max():.1f} kW")
    print("- AC_POWER: AC power delivered to grid inverter (kW per inverter)")
    print(f"  Range: {df_gen['AC_POWER'].min():.1f} to {df_gen['AC_POWER'].max():.1f} kW")
    print("- DAILY_YIELD: Cumulative daily energy yield (kWh)")
    print(f"  Max daily yield: {df_gen['DAILY_YIELD'].max():.1f} kWh")
    print("- TOTAL_YIELD: Lifetime cumulative energy yield (kWh)")

    # Plant-level aggregation (summing inverters)
    plant_hourly = df_gen.groupby('DATE_TIME')['AC_POWER'].sum() / 1000.0  # kW -> MW
    plant_hourly = plant_hourly.resample('1h').mean()
    print(f"\nAggregated Plant AC Capacity: ~{plant_hourly.max():.2f} MW Peak")

    # Solar Weather Sensor
    df_sw = pd.read_csv(SOLAR_WEATHER_CSV)
    df_sw['DATE_TIME'] = pd.to_datetime(df_sw['DATE_TIME'], format="%Y-%m-%d %H:%M:%S")
    w_step = df_sw.sort_values('DATE_TIME')['DATE_TIME'].diff().dropna().mode().iloc[0]
    print(f"\nWeather Sensors ({os.path.basename(SOLAR_WEATHER_CSV)}):")
    print(f"Records: {len(df_sw):,} | Granularity: {w_step}")
    print(f"- AMBIENT_TEMPERATURE: {df_sw['AMBIENT_TEMPERATURE'].min():.1f} to {df_sw['AMBIENT_TEMPERATURE'].max():.1f} °C")
    print(f"- MODULE_TEMPERATURE: {df_sw['MODULE_TEMPERATURE'].min():.1f} to {df_sw['MODULE_TEMPERATURE'].max():.1f} °C")
    print(f"- IRRADIATION: {df_sw['IRRADIATION'].min():.4f} to {df_sw['IRRADIATION'].max():.4f} kW/m² (multiply by 1000 for W/m² GHI)")

def inspect_wind_data():
    print("\n" + "="*75)
    print("DATASET 2: KAGGLE WIND TURBINE SCADA DATASET")
    print("="*75)

    df_wind = pd.read_csv(WIND_SCADA_CSV)
    # Common timestamp column names: 'Date/Time' or 'Time'
    time_col = [c for c in df_wind.columns if 'Date' in c or 'Time' in c or 'time' in c][0]
    
    # Try parsing format: "dd mm yyyy HH:MM" or standard iso
    try:
        df_wind['timestamp'] = pd.to_datetime(df_wind[time_col], format="%d %m %Y %H:%M")
    except Exception:
        df_wind['timestamp'] = pd.to_datetime(df_wind[time_col])

    start_dt = df_wind['timestamp'].min()
    end_dt = df_wind['timestamp'].max()
    duration_days = (end_dt - start_dt).total_seconds() / 86400.0

    step = df_wind.sort_values('timestamp')['timestamp'].diff().dropna().mode().iloc[0]

    print(f"File: {os.path.basename(WIND_SCADA_CSV)}")
    print(f"Total Records: {len(df_wind):,} rows")
    print(f"Time Range: {start_dt} to {end_dt} (~{duration_days:.1f} days / 1 full calendar year)")
    print(f"Granularity: {step} (10-minute SCADA intervals)")
    print("\nColumns & Measured Units:")
    for col in df_wind.columns:
        if col == 'timestamp':
            continue
        c_min = df_wind[col].min()
        c_max = df_wind[col].max()
        print(f"- {col}: range = {c_min} to {c_max}")

def print_alignment_guide():
    print("\n" + "="*75)
    print("TIMESTAMP & WEATHER ALIGNMENT SUMMARY")
    print("="*75)
    print("""
Key findings for downstream feature alignment with Open-Meteo 72h Weather:
1. Temporal Granularity:
   - Solar Kaggle Data is recorded at 15-MINUTE intervals.
   - Wind SCADA Data is recorded at 10-MINUTE intervals.
   - Open-Meteo Weather is recorded at HOURLY (1-hour) intervals.
   
   Alignment Action:
   - Use Pandas .resample('1h', on='timestamp').mean() to align generation records to the exact hourly timestamps of the weather forecast.

2. Unit Harmonization:
   - Kaggle Solar AC_POWER is in kW per inverter (22 inverters). Sum across inverters and divide by 1000 to convert to total plant MW:
     Plant_MW = df.groupby('DATE_TIME')['AC_POWER'].sum() / 1000.0
   - Kaggle Solar IRRADIATION is in kW/m². Multiply by 1000 to match Open-Meteo GHI (W/m²).
   - Kaggle Wind LV ActivePower is in kW. Divide by 1000 to convert to MW.
   - Kaggle Wind Speed is in m/s, directly matching Open-Meteo wind_speed_100m / wind_speed_10m (m/s).
""")

if __name__ == "__main__":
    inspect_solar_data()
    inspect_wind_data()
    print_alignment_guide()
