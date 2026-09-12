"""
Nimbus Primary Model: XGBoost Quantile Regressor
Predicts renewable power generation with calibrated confidence bands (P10, P50, P90).
Uses pinball / quantile loss to handle nonlinear ramps, cloud transients, and wind cut-out dynamics.
Loads pre-trained model weights from models/trained/ when available.
"""

from typing import Dict, Any, List, Optional
import os
import numpy as np
import pandas as pd
import xgboost as xgb

MODEL_DIR = os.path.join(os.path.dirname(__file__), "trained")

SOLAR_FEATURES = [
    "ghi_wm2",
    "temperature_c",
    "cloud_cover_est_pct",
    "temp_derate_factor",
    "hour_sin",
    "hour_cos",
    "doy_sin",
    "doy_cos",
    "gen_lag_24h"
]

WIND_FEATURES = [
    "wind_speed_100m",
    "wind_cubic_cf",
    "wind_power_density_wm2",
    "hour_sin",
    "hour_cos",
    "doy_sin",
    "doy_cos",
    "gen_lag_24h"
]

class XGBoostQuantileModel:
    def __init__(self):
        self.name = "XGBoost Quantile Model"
        self.models: Dict[str, Dict[str, xgb.XGBRegressor]] = {"solar": {}, "wind": {}}
        self._load_or_initialize()

    def _load_or_initialize(self):
        """Loads serialized XGBoost models from disk if available."""
        loaded_count = 0
        for asset in ["solar", "wind"]:
            for q in ["p10", "p50", "p90"]:
                path = os.path.join(MODEL_DIR, f"xgb_{asset}_{q}.json")
                if os.path.exists(path):
                    try:
                        reg = xgb.XGBRegressor()
                        reg.load_model(path)
                        self.models[asset][q] = reg
                        loaded_count += 1
                    except Exception as e:
                        print(f"[XGBoost] Warning: Could not load {path}: {e}")

        self.is_trained = (loaded_count == 6)

    def _prepare_solar_features(self, df: pd.DataFrame) -> np.ndarray:
        n = len(df)
        ghi = df.get("ghi_wm2", df.get("shortwave_radiation_instant", pd.Series([0.0]*n))).to_numpy()
        temp = df.get("temperature_2m", df.get("temperature_c", pd.Series([25.0]*n))).to_numpy()
        cloud = df.get("cloud_cover_pct", df.get("cloud_cover_est_pct", pd.Series([20.0]*n))).to_numpy()
        
        # Temp derate factor
        temp_derate = np.clip(1.0 - 0.0038 * (temp - 25.0), 0.65, 1.05)
        
        h_sin = df.get("hour_sin", pd.Series([0.0]*n)).to_numpy()
        h_cos = df.get("hour_cos", pd.Series([1.0]*n)).to_numpy()
        doy_sin = df.get("doy_sin", pd.Series([0.5]*n)).to_numpy()
        doy_cos = df.get("doy_cos", pd.Series([0.5]*n)).to_numpy()
        lag24 = df.get("gen_lag_24h", df.get("baseline_mw", pd.Series([0.0]*n))).to_numpy()

        return np.column_stack([ghi, temp, cloud, temp_derate, h_sin, h_cos, doy_sin, doy_cos, lag24])

    def _prepare_wind_features(self, df: pd.DataFrame) -> np.ndarray:
        n = len(df)
        w100 = df.get("wind_speed_100m", df.get("wind_speed_ms", pd.Series([7.0]*n))).to_numpy()
        
        # Aerodynamic power curve factor
        cf = np.zeros(n)
        ramp = (w100 >= 3.0) & (w100 < 12.0)
        cf[ramp] = ((w100[ramp] - 3.0) / (12.0 - 3.0)) ** 3
        cf[(w100 >= 12.0) & (w100 < 25.0)] = 1.0
        cf[w100 >= 25.0] = 0.0
        
        # Kinetic power density
        wpd = 0.5 * 1.225 * (w100 ** 3)

        h_sin = df.get("hour_sin", pd.Series([0.0]*n)).to_numpy()
        h_cos = df.get("hour_cos", pd.Series([1.0]*n)).to_numpy()
        doy_sin = df.get("doy_sin", pd.Series([0.5]*n)).to_numpy()
        doy_cos = df.get("doy_cos", pd.Series([0.5]*n)).to_numpy()
        lag24 = df.get("gen_lag_24h", df.get("baseline_mw", pd.Series([0.0]*n))).to_numpy()

        return np.column_stack([w100, cf, wpd, h_sin, h_cos, doy_sin, doy_cos, lag24])

    def predict(self, site_metadata: Dict[str, Any], weather_df: pd.DataFrame) -> List[Dict[str, float]]:
        """
        Generates P10, P50, and P90 generation predictions (MW) for given weather horizon.
        """
        if not self.is_trained:
            self._load_or_initialize()

        site_type = site_metadata.get("type", "solar")
        cap_mw = float(site_metadata.get("capacity_mw", 1000.0))
        sol_cap = float(site_metadata.get("solar_capacity_mw", cap_mw if site_type in ["solar", "hybrid"] else 0.0))
        wnd_cap = float(site_metadata.get("wind_capacity_mw", cap_mw if site_type in ["wind", "hybrid"] else 0.0))
        cut_in = float(site_metadata.get("cut_in_speed_ms", 3.0))
        cut_out = float(site_metadata.get("cut_out_speed_ms", 25.0))

        n_samples = len(weather_df)
        results = []

        # 1. Solar Predictions
        if sol_cap > 0 and "solar" in self.models and len(self.models["solar"]) == 3:
            X_s = self._prepare_solar_features(weather_df)
            # Reference training plant capacity is ~27.33 MW, scale relative to target site
            scale_factor = sol_cap / 27.33
            sol_p10 = np.clip(self.models["solar"]["p10"].predict(X_s) * scale_factor, 0.0, sol_cap)
            sol_p50 = np.clip(self.models["solar"]["p50"].predict(X_s) * scale_factor, 0.0, sol_cap)
            sol_p90 = np.clip(self.models["solar"]["p90"].predict(X_s) * scale_factor, 0.0, sol_cap)

            # Night gating (zero generation when GHI <= 1.0)
            ghi = weather_df.get("ghi_wm2", pd.Series([0.0]*n_samples)).to_numpy()
            night = ghi <= 1.0
            sol_p10[night] = 0.0
            sol_p50[night] = 0.0
            sol_p90[night] = 0.0
        else:
            sol_p10 = np.zeros(n_samples)
            sol_p50 = np.zeros(n_samples)
            sol_p90 = np.zeros(n_samples)

        # 2. Wind Predictions
        if wnd_cap > 0 and "wind" in self.models and len(self.models["wind"]) == 3:
            X_w = self._prepare_wind_features(weather_df)
            # Reference training turbine capacity is ~3.6 MW, scale relative to target site
            scale_factor = wnd_cap / 3.60
            wnd_p10 = np.clip(self.models["wind"]["p10"].predict(X_w) * scale_factor, 0.0, wnd_cap)
            wnd_p50 = np.clip(self.models["wind"]["p50"].predict(X_w) * scale_factor, 0.0, wnd_cap)
            wnd_p90 = np.clip(self.models["wind"]["p90"].predict(X_w) * scale_factor, 0.0, wnd_cap)

            # Physical cut-in / cut-out shutdown
            w_speed = weather_df.get("wind_speed_100m", pd.Series([8.0]*n_samples)).to_numpy()
            shutdown = (w_speed < cut_in) | (w_speed >= cut_out)
            wnd_p10[shutdown] = 0.0
            wnd_p50[shutdown] = 0.0
            wnd_p90[shutdown] = 0.0
        else:
            wnd_p10 = np.zeros(n_samples)
            wnd_p50 = np.zeros(n_samples)
            wnd_p90 = np.zeros(n_samples)

        for i in range(n_samples):
            p10 = round(float(sol_p10[i] + wnd_p10[i]), 2)
            p50 = round(float(sol_p50[i] + wnd_p50[i]), 2)
            p90 = round(float(sol_p90[i] + wnd_p90[i]), 2)
            
            # Monotonic quantile constraint: P10 <= P50 <= P90
            p10 = min(p10, p50)
            p90 = max(p90, p50)

            results.append({
                "hour_ahead": i + 1,
                "p10_mw": p10,
                "p50_mw": p50,
                "p90_mw": p90
            })

        return results
