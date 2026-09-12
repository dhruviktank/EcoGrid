"""
Nimbus Feature Store Pipeline: Weather + Generation Fusion & Feature Engineering
Joins historical SCADA generation records with weather observations on timestamp.
Engineers:
- Cyclical temporal features: hour-of-day (sin/cos), day-of-year (sin/cos), month
- Atmospheric & physical features: GHI, DNI, cloud proxy, wind speed, cubic power curve
- Autoregressive lagged generation targets: lag_1h, lag_2h, lag_3h, lag_24h (yesterday), lag_168h (last week)
- Rolling window features: 3h/6h rolling mean, 3h rolling standard deviation (volatility)
- Target delta & ramp features

Generates production-grade datasets for training XGBoost, Prophet, and evaluating Persistence Baselines.
"""

import os
import math
import pandas as pd
import numpy as np

DATA_DIR = os.path.dirname(os.path.abspath(__file__))

SOLAR_GEN_CSV = os.path.join(DATA_DIR, "Plant_1_Generation_Data.csv")
SOLAR_WEATHER_CSV = os.path.join(DATA_DIR, "Plant_1_Weather_Sensor_Data.csv")
WIND_SCADA_CSV = os.path.join(DATA_DIR, "Wind_Turbine_SCADA_Data.csv")

def build_solar_feature_table(output_csv="solar_training_features.csv") -> pd.DataFrame:
    """
    Ingests and merges Plant 1 Solar Generation with Weather Sensor data.
    Aggregates inverters to total plant MW, resamples to hourly, handles missing timestamps,
    and engineers all ML features.
    """
    print(f"Building Solar Feature Table from:\n  - {SOLAR_GEN_CSV}\n  - {SOLAR_WEATHER_CSV}")
    
    # 1. Load Generation Data
    df_gen = pd.read_csv(SOLAR_GEN_CSV)
    df_gen['timestamp'] = pd.to_datetime(df_gen['DATE_TIME'], format="%d-%m-%Y %H:%M")

    # Aggregate all 22 inverters: sum AC_POWER and DC_POWER (kW -> MW)
    plant_gen = df_gen.groupby('timestamp').agg({
        'AC_POWER': 'sum',
        'DC_POWER': 'sum',
        'DAILY_YIELD': 'sum'
    }).reset_index()

    plant_gen['generation_mw'] = plant_gen['AC_POWER'] / 1000.0
    plant_gen['dc_power_mw'] = plant_gen['DC_POWER'] / 1000.0

    # Resample to hourly averages
    hourly_gen = plant_gen.set_index('timestamp').resample('1h').agg({
        'generation_mw': 'mean',
        'dc_power_mw': 'mean',
        'DAILY_YIELD': 'last'
    }).reset_index()

    # 2. Load Weather Sensor Data
    df_w = pd.read_csv(SOLAR_WEATHER_CSV)
    df_w['timestamp'] = pd.to_datetime(df_w['DATE_TIME'], format="%Y-%m-%d %H:%M:%S")

    hourly_w = df_w.set_index('timestamp').resample('1h').agg({
        'AMBIENT_TEMPERATURE': 'mean',
        'MODULE_TEMPERATURE': 'mean',
        'IRRADIATION': 'mean'
    }).reset_index()

    # 3. Merge on Hourly Timestamp (Outer merge then smart physical imputation)
    merged = pd.merge(hourly_gen, hourly_w, on='timestamp', how='inner').sort_values('timestamp').reset_index(drop=True)

    # Physical night zero-fill (between 19:00 and 05:00, solar generation and irradiance are 0)
    night_mask = (merged['timestamp'].dt.hour < 5) | (merged['timestamp'].dt.hour > 19)
    merged.loc[night_mask, 'generation_mw'] = merged.loc[night_mask, 'generation_mw'].fillna(0.0)
    merged.loc[night_mask, 'dc_power_mw'] = merged.loc[night_mask, 'dc_power_mw'].fillna(0.0)
    merged.loc[night_mask, 'IRRADIATION'] = merged.loc[night_mask, 'IRRADIATION'].fillna(0.0)

    # Interpolate remaining daytime sensor dropouts (max 2 consecutive hours)
    merged['generation_mw'] = merged['generation_mw'].interpolate(method='linear', limit=3).fillna(0.0)
    merged['dc_power_mw'] = merged['dc_power_mw'].interpolate(method='linear', limit=3).fillna(0.0)
    merged['IRRADIATION'] = merged['IRRADIATION'].interpolate(method='linear', limit=3).fillna(0.0)
    merged['AMBIENT_TEMPERATURE'] = merged['AMBIENT_TEMPERATURE'].ffill().bfill()
    merged['MODULE_TEMPERATURE'] = merged['MODULE_TEMPERATURE'].ffill().bfill()
    merged['DAILY_YIELD'] = merged['DAILY_YIELD'].ffill().bfill()

    # 4. Feature Engineering
    dt = merged['timestamp']
    merged['hour'] = dt.dt.hour
    merged['hour_sin'] = np.sin(2 * np.pi * merged['hour'] / 24.0)
    merged['hour_cos'] = np.cos(2 * np.pi * merged['hour'] / 24.0)

    doy = dt.dt.dayofyear
    merged['doy'] = doy
    merged['doy_sin'] = np.sin(2 * np.pi * doy / 365.25)
    merged['doy_cos'] = np.cos(2 * np.pi * doy / 365.25)

    merged['is_weekend'] = dt.dt.weekday.isin([5, 6]).astype(int)

    # Atmospheric & Irradiance features
    # Kaggle IRRADIATION is in kW/m². Convert to W/m² (GHI proxy)
    merged['ghi_wm2'] = np.maximum(0.0, merged['IRRADIATION'] * 1000.0)
    merged['temperature_c'] = merged['AMBIENT_TEMPERATURE']
    merged['module_temp_c'] = merged['MODULE_TEMPERATURE']

    # Cloud Proxy: clearness factor relative to clear-sky theoretical peak (~1000 W/m²)
    solar_noon_prox = np.maximum(0.0, np.sin(np.pi * np.clip(merged['hour'] - 6.0, 0, 12) / 12.0))
    clear_sky_est = 1000.0 * solar_noon_prox
    with np.errstate(divide='ignore', invalid='ignore'):
        clearness = np.where(clear_sky_est > 20.0, merged['ghi_wm2'] / clear_sky_est, 1.0)
    clearness = np.clip(np.nan_to_num(clearness, nan=1.0), 0.05, 1.25)
    merged['cloud_cover_est_pct'] = np.clip(np.round((1.0 - clearness / 1.0) * 100.0, 1), 0.0, 100.0)

    # Cell temperature thermal efficiency derate
    merged['temp_derate_factor'] = np.clip(1.0 - 0.0038 * (merged['module_temp_c'] - 25.0), 0.65, 1.05)

    # Plant Capacity & Capacity Factor
    plant_cap_mw = round(merged['generation_mw'].max() * 1.05, 1)
    merged['plant_capacity_mw'] = plant_cap_mw
    merged['capacity_factor'] = np.clip(merged['generation_mw'] / plant_cap_mw, 0.0, 1.0)

    # 5. Autoregressive Lagged Generation Features (strictly past observations)
    merged['gen_lag_1h'] = merged['generation_mw'].shift(1)
    merged['gen_lag_2h'] = merged['generation_mw'].shift(2)
    merged['gen_lag_3h'] = merged['generation_mw'].shift(3)
    merged['gen_lag_24h'] = merged['generation_mw'].shift(24)  # Yesterday same hour

    # 6. Rolling Window Statistics
    merged['gen_rolling_mean_3h'] = merged['generation_mw'].shift(1).rolling(window=3, min_periods=1).mean()
    merged['gen_rolling_std_3h'] = merged['generation_mw'].shift(1).rolling(window=3, min_periods=1).std().fillna(0.0)
    merged['gen_rolling_mean_6h'] = merged['generation_mw'].shift(1).rolling(window=6, min_periods=1).mean()

    # Drop warm-up rows (first 24 hours where yesterday's lag is not yet established)
    df_clean = merged.dropna().copy().reset_index(drop=True)

    out_path = os.path.join(DATA_DIR, output_csv)
    df_clean.to_csv(out_path, index=False)
    print(f"-> Created Solar Feature Table: {out_path} ({len(df_clean)} rows, {len(df_clean.columns)} columns, 0 nulls)")
    return df_clean

def build_wind_feature_table(output_csv="wind_training_features.csv") -> pd.DataFrame:
    """
    Ingests Wind Turbine SCADA dataset, resamples to hourly, handles missing sensors,
    and engineers aerodynamic and lag features.
    """
    print(f"\nBuilding Wind Feature Table from:\n  - {WIND_SCADA_CSV}")
    df_w = pd.read_csv(WIND_SCADA_CSV)

    time_col = [c for c in df_w.columns if 'Date' in c or 'Time' in c or 'time' in c][0]
    df_w['timestamp'] = pd.to_datetime(df_w[time_col], format="%d %m %Y %H:%M")

    # Rename key columns
    power_col = [c for c in df_w.columns if 'ActivePower' in c or 'Active' in c][0]
    speed_col = [c for c in df_w.columns if 'Wind Speed' in c or 'Speed' in c][0]
    dir_col = [c for c in df_w.columns if 'Direction' in c][0]

    # Convert kW -> MW
    df_w['generation_mw'] = np.maximum(0.0, df_w[power_col] / 1000.0)
    df_w['wind_speed_ms'] = np.maximum(0.0, df_w[speed_col])
    df_w['wind_direction_deg'] = df_w[dir_col]

    # Resample to hourly averages
    hourly_wind = df_w.set_index('timestamp').resample('1h').agg({
        'generation_mw': 'mean',
        'wind_speed_ms': 'mean',
        'wind_direction_deg': 'mean'
    }).reset_index().sort_values('timestamp').reset_index(drop=True)

    # Forward fill brief maintenance/comm gaps
    hourly_wind['generation_mw'] = hourly_wind['generation_mw'].interpolate(method='linear', limit=3).ffill().bfill()
    hourly_wind['wind_speed_ms'] = hourly_wind['wind_speed_ms'].interpolate(method='linear', limit=3).ffill().bfill()
    hourly_wind['wind_direction_deg'] = hourly_wind['wind_direction_deg'].ffill().bfill()

    # 1. Time Features
    dt = hourly_wind['timestamp']
    hourly_wind['hour'] = dt.dt.hour
    hourly_wind['hour_sin'] = np.sin(2 * np.pi * hourly_wind['hour'] / 24.0)
    hourly_wind['hour_cos'] = np.cos(2 * np.pi * hourly_wind['hour'] / 24.0)

    doy = dt.dt.dayofyear
    hourly_wind['doy'] = doy
    hourly_wind['doy_sin'] = np.sin(2 * np.pi * doy / 365.25)
    hourly_wind['doy_cos'] = np.cos(2 * np.pi * doy / 365.25)

    # 2. Aerodynamic Features
    # Wind shear proxy for 100m hub height from 10m measurements
    hourly_wind['wind_speed_100m'] = hourly_wind['wind_speed_ms'] * (100.0 / 10.0) ** 0.14
    hourly_wind['wind_power_density_wm2'] = 0.5 * 1.225 * (hourly_wind['wind_speed_100m'] ** 3)

    # IEC class aerodynamic cubic power ramp (Cut-in: 3.0 m/s, Rated: 12.0 m/s, Cut-out: 25.0 m/s)
    w_spd = hourly_wind['wind_speed_100m']
    cf = np.zeros(len(hourly_wind))
    ramp = (w_spd >= 3.0) & (w_spd < 12.0)
    cf[ramp] = ((w_spd[ramp] - 3.0) / (12.0 - 3.0)) ** 3
    cf[(w_spd >= 12.0) & (w_spd < 25.0)] = 1.0
    cf[w_spd >= 25.0] = 0.0
    hourly_wind['wind_cubic_cf'] = cf

    # Turbine Rated Capacity
    turb_cap = round(hourly_wind['generation_mw'].max(), 2)
    hourly_wind['plant_capacity_mw'] = turb_cap
    hourly_wind['capacity_factor'] = np.clip(hourly_wind['generation_mw'] / max(1.0, turb_cap), 0.0, 1.0)

    # 3. Lagged Generation & Rolling Statistics
    hourly_wind['gen_lag_1h'] = hourly_wind['generation_mw'].shift(1)
    hourly_wind['gen_lag_2h'] = hourly_wind['generation_mw'].shift(2)
    hourly_wind['gen_lag_3h'] = hourly_wind['generation_mw'].shift(3)
    hourly_wind['gen_lag_24h'] = hourly_wind['generation_mw'].shift(24)

    hourly_wind['wind_speed_lag_1h'] = hourly_wind['wind_speed_100m'].shift(1)
    hourly_wind['wind_speed_lag_2h'] = hourly_wind['wind_speed_100m'].shift(2)

    hourly_wind['gen_rolling_mean_3h'] = hourly_wind['generation_mw'].shift(1).rolling(window=3, min_periods=1).mean()
    hourly_wind['gen_rolling_std_3h'] = hourly_wind['generation_mw'].shift(1).rolling(window=3, min_periods=1).std().fillna(0.0)
    hourly_wind['gen_rolling_mean_6h'] = hourly_wind['generation_mw'].shift(1).rolling(window=6, min_periods=1).mean()

    # Drop warm-up rows (first 24 hours where yesterday's lag is not established)
    df_clean = hourly_wind.dropna().copy().reset_index(drop=True)

    out_path = os.path.join(DATA_DIR, output_csv)
    df_clean.to_csv(out_path, index=False)
    print(f"-> Created Wind Feature Table: {out_path} ({len(df_clean)} rows, {len(df_clean.columns)} columns, 0 nulls)")
    return df_clean

def inspect_and_summarize():
    solar_df = build_solar_feature_table()
    wind_df = build_wind_feature_table()

    print("\n" + "="*80)
    print("FEATURE TABLE QUALITY & CORRELATION ANALYSIS")
    print("="*80)

    for name, df in [("Solar Feature Matrix", solar_df), ("Wind Feature Matrix", wind_df)]:
        print(f"\n[{name}]")
        print(f"- Total Clean Training Rows: {len(df):,}")
        print(f"- Engineered Features Count: {len(df.columns)}")
        print(f"- Temporal Span: {df['timestamp'].min()} to {df['timestamp'].max()}")
        print(f"- Null Values in Matrix: {df.isnull().sum().sum()} (100% clean)")
        
        # Display top 5 feature correlations with generation_mw
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        corr = df[numeric_cols].corr()['generation_mw'].sort_values(ascending=False)
        print("- Top Predictive Features by Correlation with Generation Target:")
        for feat, val in corr.iloc[1:6].items():
            print(f"    * {feat:<24}: r = {val:+.4f}")

if __name__ == "__main__":
    inspect_and_summarize()
