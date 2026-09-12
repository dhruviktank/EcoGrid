"""
Nimbus Feature Store Module
Provides modular feature engineering, temporal cyclical encoding,
autoregressive lags, and feature matrix ingestion for machine learning pipelines.
"""

import os
import math
import pandas as pd
import numpy as np
from datetime import datetime

DATA_DIR = os.path.dirname(os.path.abspath(__file__))

def extract_time_features(df: pd.DataFrame, timestamp_col: str = "timestamp") -> pd.DataFrame:
    """Extracts trigonometric diurnal and seasonal features from timestamps."""
    df = df.copy()
    if not np.issubdtype(df[timestamp_col].dtype, np.datetime64):
        dt = pd.to_datetime(df[timestamp_col])
    else:
        dt = df[timestamp_col]

    hours = dt.dt.hour + dt.dt.minute / 60.0
    df["hour"] = dt.dt.hour
    df["hour_sin"] = np.sin(2 * np.pi * hours / 24.0)
    df["hour_cos"] = np.cos(2 * np.pi * hours / 24.0)

    doy = dt.dt.dayofyear
    df["doy"] = doy
    df["doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    df["doy_cos"] = np.cos(2 * np.pi * doy / 365.25)

    df["is_weekend"] = dt.dt.weekday.isin([5, 6]).astype(int)
    return df

def generate_autoregressive_lags(df: pd.DataFrame, target_col: str = "generation_mw", 
                                 lags: list = [1, 2, 3, 24]) -> pd.DataFrame:
    """Creates non-leaking past observation lag features."""
    df = df.copy()
    for lag in lags:
        df[f"{target_col}_lag_{lag}h"] = df[target_col].shift(lag)
    
    # Rolling statistics
    df[f"{target_col}_rolling_mean_3h"] = df[target_col].shift(1).rolling(3, min_periods=1).mean()
    df[f"{target_col}_rolling_std_3h"] = df[target_col].shift(1).rolling(3, min_periods=1).std().fillna(0.0)
    df[f"{target_col}_rolling_mean_6h"] = df[target_col].shift(1).rolling(6, min_periods=1).mean()
    return df

def load_training_features(asset_type: str = "solar") -> pd.DataFrame:
    """
    Loads clean, pre-engineered training feature matrices.
    """
    if asset_type == "solar":
        csv_path = os.path.join(DATA_DIR, "solar_training_features.csv")
    else:
        csv_path = os.path.join(DATA_DIR, "wind_training_features.csv")
        
    if os.path.exists(csv_path):
        return pd.read_csv(csv_path)
    else:
        from .build_feature_pipeline import build_solar_feature_table, build_wind_feature_table
        if asset_type == "solar":
            return build_solar_feature_table()
        else:
            return build_wind_feature_table()
