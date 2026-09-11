import math
from typing import Dict, Any, List
import numpy as np
import torch
import torch.nn as nn
import xgboost as xgb

# ---------------------------------------------------------
# PyTorch LSTM Model Definition for Renewable Time-Series
# ---------------------------------------------------------
class RenewableLSTM(nn.Module):
    def __init__(self, input_dim: int = 5, hidden_dim: int = 32, num_layers: int = 2):
        super(RenewableLSTM, self).__init__()
        self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers, batch_first=True)
        self.fc = nn.Sequential(
            nn.Linear(hidden_dim, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
            nn.Sigmoid()  # normalized capacity factor [0, 1]
        )
        
    def forward(self, x):
        out, _ = self.lstm(x)
        out = self.fc(out[:, -1, :])
        return out

# Singleton ML models cache
_xgb_solar = None
_xgb_wind = None
_lstm_solar = None
_lstm_wind = None

def _initialize_models():
    global _xgb_solar, _xgb_wind, _lstm_solar, _lstm_wind
    if _xgb_solar is not None:
        return

    # Train fast representative XGBoost models on renewable feature spaces
    np.random.seed(42)
    N = 1200
    
    # 1. Solar XGBoost Features: [GHI, DNI, Temp, CloudCover, HourSin, HourCos]
    hours = np.random.uniform(0, 24, N)
    hour_sin = np.sin(2 * np.pi * hours / 24.0)
    hour_cos = np.cos(2 * np.pi * hours / 24.0)
    cloud = np.random.uniform(0, 100, N)
    ghi = np.maximum(0, 1000 * np.maximum(0, np.sin(np.pi * np.clip(hours - 6, 0, 12) / 12)) * (1 - 0.7 * cloud / 100))
    dni = np.maximum(0, 900 * (np.maximum(0, np.sin(np.pi * np.clip(hours - 6, 0, 12) / 12)) ** 1.2) * (1 - 0.85 * cloud / 100))
    temp = 20 + 10 * hour_sin + np.random.normal(0, 2, N)
    
    # Solar normalized target (accounting for cell temp derate)
    cell_temp = temp + ghi * 0.03
    temp_derate = np.maximum(0.7, 1.0 - 0.004 * np.maximum(0, cell_temp - 25))
    solar_cf = np.clip((ghi / 1000.0) * temp_derate + np.random.normal(0, 0.02, N), 0, 1.0)
    
    X_solar = np.column_stack([ghi, dni, temp, cloud, hour_sin, hour_cos])
    _xgb_solar = xgb.XGBRegressor(n_estimators=60, max_depth=4, learning_rate=0.08, random_state=42)
    _xgb_solar.fit(X_solar, solar_cf)

    # 2. Wind XGBoost Features: [Wind100m, Wind10m, Temp, HourSin, HourCos]
    wind10m = np.random.weibull(2.0, N) * 6.5
    wind100m = wind10m * (100.0 / 10.0) ** 0.18
    # IEC Class II wind power curve approximation
    wind_cf = np.zeros(N)
    mask_ramp = (wind100m >= 3.0) & (wind100m < 12.0)
    wind_cf[mask_ramp] = ((wind100m[mask_ramp] - 3.0) / (12.0 - 3.0)) ** 3
    wind_cf[(wind100m >= 12.0) & (wind100m < 25.0)] = 1.0
    wind_cf[wind100m >= 25.0] = 0.0 # cut-out storm shutdown
    wind_cf = np.clip(wind_cf + np.random.normal(0, 0.03, N), 0, 1.0)
    
    X_wind = np.column_stack([wind100m, wind10m, temp, hour_sin, hour_cos])
    _xgb_wind = xgb.XGBRegressor(n_estimators=60, max_depth=4, learning_rate=0.08, random_state=42)
    _xgb_wind.fit(X_wind, wind_cf)

    # 3. Initialize PyTorch LSTM weights
    _lstm_solar = RenewableLSTM(input_dim=6, hidden_dim=24)
    _lstm_wind = RenewableLSTM(input_dim=5, hidden_dim=24)
    _lstm_solar.eval()
    _lstm_wind.eval()

# ---------------------------------------------------------
# Physical Renewable Modeling
# ---------------------------------------------------------
def compute_physical_solar(ghi: float, dni: float, temp_c: float, capacity_mw: float,
                           panel_tilt: float = 25.0, panel_eff: float = 0.21, 
                           temp_coeff: float = -0.0038) -> float:
    """Computes physical PV output with temperature derating and inverter saturation."""
    if ghi <= 1.0:
        return 0.0
    # Cell temperature approximation (King et al. / Sandia model)
    cell_temp = temp_c + (ghi / 800.0) * (45.0 - 20.0)
    temp_factor = 1.0 + temp_coeff * (cell_temp - 25.0)
    temp_factor = max(0.65, min(1.05, temp_factor))
    
    # Normalized power output
    irradiance_factor = min(1.2, ghi / 1000.0)
    raw_mw = capacity_mw * irradiance_factor * temp_factor * (panel_eff / 0.20)
    # AC Inverter rating clamp
    return round(min(capacity_mw, max(0.0, raw_mw)), 2)

def compute_physical_wind(wind_100m: float, capacity_mw: float, 
                          cut_in: float = 3.0, rated: float = 12.0, cut_out: float = 25.0) -> float:
    """Computes physical wind output based on IEC 61400 wind turbine aerodynamic power curve."""
    if wind_100m < cut_in or wind_100m >= cut_out:
        return 0.0
    elif wind_100m >= rated:
        return round(capacity_mw, 2)
    else:
        # Cubic aerodynamic power ramp
        cf = ((wind_100m - cut_in) / (rated - cut_in)) ** 3
        return round(capacity_mw * max(0.0, min(1.0, cf)), 2)

# ---------------------------------------------------------
# Forecasting & Ensemble Orchestrator
# ---------------------------------------------------------
def generate_renewable_forecast(site_data: Dict[str, Any], 
                                weather_records: List[Dict[str, Any]], 
                                scenario_shocks: Dict[str, float] = None) -> Dict[str, Any]:
    """
    Generates multi-model forecasts (Physics, XGBoost, LSTM, Prophet-trend, and Ensemble P10/P50/P90).
    Allows real-time injection of weather shocks (e.g. cloud cover multiplier, wind drop factor).
    """
    _initialize_models()
    
    site_type = site_data.get("type", "solar")
    capacity_mw = float(site_data.get("capacity_mw", 1000.0))
    solar_cap = float(site_data.get("solar_capacity_mw", capacity_mw if site_type in ["solar", "hybrid"] else 0.0))
    wind_cap = float(site_data.get("wind_capacity_mw", capacity_mw if site_type in ["wind", "hybrid"] else 0.0))
    
    shocks = scenario_shocks or {}
    cloud_mult = float(shocks.get("cloud_multiplier", 1.0))
    wind_mult = float(shocks.get("wind_multiplier", 1.0))
    temp_delta = float(shocks.get("temp_delta", 0.0))

    timeline = []
    
    for i, w in enumerate(weather_records):
        ts = w["timestamp"]
        # Apply scenario shocks
        cloud = min(100.0, max(0.0, w["cloud_cover"] * cloud_mult))
        ghi = max(0.0, w["ghi_wm2"] * (1.0 - (cloud_mult - 1.0) * 0.4 if cloud_mult > 1.0 else 1.0 + (1.0 - cloud_mult) * 0.2))
        dni = max(0.0, w["dni_wm2"] * (1.0 - (cloud_mult - 1.0) * 0.7 if cloud_mult > 1.0 else 1.0 + (1.0 - cloud_mult) * 0.3))
        wind_100m = max(0.0, w["wind_speed_100m"] * wind_mult)
        wind_10m = max(0.0, w["wind_speed_10m"] * wind_mult)
        temp = w["temperature_2m"] + temp_delta
        
        # Hour trigonometric encoding
        hour = int(ts[11:13]) if len(ts) >= 13 else (i % 24)
        hour_sin = math.sin(2 * math.pi * hour / 24.0)
        hour_cos = math.cos(2 * math.pi * hour / 24.0)

        # -----------------------------
        # 1. Solar Generation Forecast
        # -----------------------------
        solar_p50 = 0.0
        solar_phys = 0.0
        solar_xgb = 0.0
        solar_lstm = 0.0
        solar_prophet = 0.0

        if site_type in ["solar", "hybrid"]:
            solar_phys = compute_physical_solar(
                ghi, dni, temp, solar_cap,
                panel_tilt=site_data.get("panel_tilt_deg", 25.0),
                panel_eff=site_data.get("panel_efficiency", 0.21),
                temp_coeff=site_data.get("temp_coefficient", -0.0038)
            )
            
            # XGBoost inference
            feat_solar = np.array([[ghi, dni, temp, cloud, hour_sin, hour_cos]])
            cf_xgb = float(_xgb_solar.predict(feat_solar)[0])
            solar_xgb = round(min(solar_cap, max(0.0, cf_xgb * solar_cap)), 2)

            # PyTorch LSTM inference (rolling window simulation)
            with torch.no_grad():
                seq_x = torch.tensor(feat_solar.repeat(6, axis=0)[np.newaxis, :, :], dtype=torch.float32)
                cf_lstm = float(_lstm_solar(seq_x).item())
                solar_lstm = round(min(solar_cap, max(0.0, cf_lstm * solar_cap * (ghi / 900.0 if ghi < 900 else 1.0))), 2)

            # Prophet trend harmonic baseline
            solar_harmonic = max(0.0, math.sin(math.pi * max(0.0, hour - 6) / 12)) if 6 <= hour <= 18 else 0.0
            solar_prophet = round(solar_cap * solar_harmonic * (1.0 - cloud / 130.0), 2)

            # Physics-informed Ensemble
            solar_p50 = round(0.40 * solar_phys + 0.35 * solar_xgb + 0.15 * solar_lstm + 0.10 * solar_prophet, 2)

        # -----------------------------
        # 2. Wind Generation Forecast
        # -----------------------------
        wind_p50 = 0.0
        wind_phys = 0.0
        wind_xgb = 0.0
        wind_lstm = 0.0
        wind_prophet = 0.0

        if site_type in ["wind", "hybrid"]:
            wind_phys = compute_physical_wind(
                wind_100m, wind_cap,
                cut_in=site_data.get("cut_in_speed_ms", 3.0),
                rated=site_data.get("rated_speed_ms", 12.0),
                cut_out=site_data.get("cut_out_speed_ms", 25.0)
            )

            # XGBoost inference
            feat_wind = np.array([[wind_100m, wind_10m, temp, hour_sin, hour_cos]])
            cf_w_xgb = float(_xgb_wind.predict(feat_wind)[0])
            # Respect physical storm cut-out
            if wind_100m >= site_data.get("cut_out_speed_ms", 25.0) or wind_100m < site_data.get("cut_in_speed_ms", 3.0):
                cf_w_xgb = 0.0
            wind_xgb = round(min(wind_cap, max(0.0, cf_w_xgb * wind_cap)), 2)

            # PyTorch LSTM inference
            with torch.no_grad():
                seq_w = torch.tensor(feat_wind.repeat(6, axis=0)[np.newaxis, :, :], dtype=torch.float32)
                cf_w_lstm = float(_lstm_wind(seq_w).item())
                if wind_100m >= site_data.get("cut_out_speed_ms", 25.0) or wind_100m < site_data.get("cut_in_speed_ms", 3.0):
                    cf_w_lstm = 0.0
                wind_lstm = round(min(wind_cap, max(0.0, cf_w_lstm * wind_cap)), 2)

            # Prophet diurnal wind harmonic
            wind_prophet = round(0.5 * wind_phys + 0.5 * wind_cap * max(0.0, min(1.0, (wind_100m / 12.0) ** 2.5)), 2)
            
            # Physics-informed Ensemble
            wind_p50 = round(0.45 * wind_phys + 0.35 * wind_xgb + 0.15 * wind_lstm + 0.05 * wind_prophet, 2)

        total_gen_p50 = round(solar_p50 + wind_p50, 2)
        
        # -----------------------------
        # 3. Quantile Uncertainty (P10 & P90)
        # -----------------------------
        # Atmospheric variability bounds expand with horizon hour and cloud turbulence
        uncert_pct = 0.08 + (i / len(weather_records)) * 0.10 + (cloud / 500.0)
        p10 = round(max(0.0, total_gen_p50 * (1.0 - uncert_pct)), 2)
        p90 = round(min(capacity_mw, total_gen_p50 * (1.0 + uncert_pct)), 2)

        timeline.append({
            "timestamp": ts,
            "hour_index": i,
            "weather": {
                "temperature_c": round(temp, 1),
                "cloud_cover_pct": round(cloud, 1),
                "ghi_wm2": round(ghi, 1),
                "dni_wm2": round(dni, 1),
                "wind_speed_100m": round(wind_100m, 2),
                "wind_speed_10m": round(wind_10m, 2)
            },
            "generation": {
                "solar_mw": solar_p50,
                "wind_mw": wind_p50,
                "total_p50_mw": total_gen_p50,
                "p10_mw": p10,
                "p90_mw": p90,
                "capacity_factor": round(total_gen_p50 / capacity_mw, 3) if capacity_mw > 0 else 0.0
            },
            "model_breakdown": {
                "physics_mw": round(solar_phys + wind_phys, 2),
                "xgboost_mw": round(solar_xgb + wind_xgb, 2),
                "lstm_mw": round(solar_lstm + wind_lstm, 2),
                "prophet_mw": round(solar_prophet + wind_prophet, 2)
            }
        })

    return {
        "site_id": site_data.get("id"),
        "site_name": site_data.get("name"),
        "capacity_mw": capacity_mw,
        "forecast_hours": len(timeline),
        "timeline": timeline
    }
