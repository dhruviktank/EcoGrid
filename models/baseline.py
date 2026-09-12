"""
Nimbus Forecasting Models: Weather-Adjusted Persistence Baseline
Implementation of the simplest, robust benchmark:
    Tomorrow's Output = Same hour yesterday (or same day last week),
                        adjusted lightly for forecast weather.

Before introducing complex ML models, this delivers an interpretable, reliable,
and immediately demoable forecast benchmark against which all ML models must compete.
"""

from typing import Dict, Any, List, Optional
import math
import pandas as pd
import numpy as np

class PersistenceBaselineModel:
    """
    Weather-Adjusted Seasonal-Naive Baseline.
    - Reference Base: Output from the exact same hour yesterday (t - 24h) or last week (t - 168h).
    - Weather Adjustment:
        * Solar: Scaled by ratio of forecast clear-sky index / cloud factor vs baseline day.
        * Wind: Scaled by cubic wind speed ratio (v_forecast / v_base)^3.
    """
    def __init__(self, mode: str = "same_day_yesterday", weather_coupling: float = 0.5):
        """
        :param mode: 'same_day_yesterday' (24h lag) or 'same_day_last_week' (168h lag)
        :param weather_coupling: Dampening factor for weather adjustments (0.0 = pure persistence, 1.0 = full adjustment)
        """
        self.name = "Weather-Adjusted Persistence Baseline"
        self.mode = mode
        self.weather_coupling = np.clip(weather_coupling, 0.0, 1.0)

    def _compute_solar_weather_adjustment(self, forecast_weather: Dict[str, Any], 
                                          baseline_weather: Optional[Dict[str, Any]]) -> float:
        """
        Computes a gentle scalar multiplier based on cloud cover / irradiance comparison.
        """
        f_cloud = float(forecast_weather.get("cloud_cover_pct", forecast_weather.get("cloud_cover", 20.0)))
        b_cloud = float(baseline_weather.get("cloud_cover_pct", baseline_weather.get("cloud_cover", 20.0))) if baseline_weather else 20.0

        # Clearness indices: (1 - cloud * 0.75)
        f_clearness = max(0.15, 1.0 - (f_cloud / 100.0) * 0.75)
        b_clearness = max(0.15, 1.0 - (b_cloud / 100.0) * 0.75)

        raw_ratio = f_clearness / b_clearness
        # Apply dampening coupling factor so weather doesn't over-oscillate persistence
        adj = 1.0 + self.weather_coupling * (raw_ratio - 1.0)
        return float(np.clip(adj, 0.25, 1.60))

    def _compute_wind_weather_adjustment(self, forecast_weather: Dict[str, Any], 
                                         baseline_weather: Optional[Dict[str, Any]]) -> float:
        """
        Computes aerodynamic velocity ratio adjustment for wind turbines.
        """
        f_wind = float(forecast_weather.get("wind_speed_100m", forecast_weather.get("wind_speed_10m", 7.0)))
        b_wind = float(baseline_weather.get("wind_speed_100m", baseline_weather.get("wind_speed_10m", 7.0))) if baseline_weather else 7.0

        if b_wind <= 1.0:
            return 1.0

        speed_ratio = f_wind / b_wind
        # Dampened power ratio (exponent ~ 2.0 instead of pure 3.0 for gentle adjustment)
        raw_adj = speed_ratio ** 2.0
        adj = 1.0 + self.weather_coupling * (raw_adj - 1.0)
        return float(np.clip(adj, 0.20, 2.00))

    def predict(self, 
                site_metadata: Dict[str, Any], 
                historical_records: List[Dict[str, Any]], 
                forecast_weather_records: Optional[List[Dict[str, Any]]] = None,
                horizon_hours: int = 72) -> List[Dict[str, Any]]:
        """
        Generates weather-adjusted persistence forecast over horizon_hours.
        """
        site_type = site_metadata.get("type", "solar")
        capacity_mw = float(site_metadata.get("capacity_mw", 1000.0))

        if not historical_records:
            return [{
                "hour_ahead": h + 1,
                "baseline_mw": 0.0,
                "raw_persistence_mw": 0.0,
                "weather_multiplier": 1.0,
                "p10_mw": 0.0,
                "p90_mw": 0.0
            } for h in range(horizon_hours)]

        hist_gen = [float(r.get("actual_generation_mw", 0.0)) for r in historical_records]
        
        preds = []
        for h in range(horizon_hours):
            # 1. Base Seasonal Persistence Selection
            if self.mode == "same_day_last_week" and len(hist_gen) >= 168:
                lag_idx = -(168 - (h % 168))
            else:
                # Default: same hour yesterday (24-hour seasonal lag)
                lag_idx = -(24 - (h % 24))

            if abs(lag_idx) <= len(hist_gen):
                base_raw = hist_gen[lag_idx]
                base_hist_record = historical_records[lag_idx]
            else:
                base_raw = hist_gen[-1]
                base_hist_record = historical_records[-1]

            # 2. Weather Adjustment Factor
            weather_mult = 1.0
            f_weather = forecast_weather_records[h] if (forecast_weather_records and h < len(forecast_weather_records)) else None

            if f_weather:
                if site_type in ["solar"]:
                    weather_mult = self._compute_solar_weather_adjustment(f_weather, base_hist_record)
                elif site_type in ["wind"]:
                    weather_mult = self._compute_wind_weather_adjustment(f_weather, base_hist_record)
                else: # hybrid
                    s_mult = self._compute_solar_weather_adjustment(f_weather, base_hist_record)
                    w_mult = self._compute_wind_weather_adjustment(f_weather, base_hist_record)
                    weather_mult = 0.5 * s_mult + 0.5 * w_mult

            # Night zero-clamp for solar
            if site_type == "solar" and f_weather:
                ghi = float(f_weather.get("ghi_wm2", f_weather.get("shortwave_radiation_instant", 0.0)))
                if ghi <= 1.0:
                    base_raw = 0.0
                    weather_mult = 1.0

            adjusted_mw = base_raw * weather_mult
            final_mw = round(float(np.clip(adjusted_mw, 0.0, capacity_mw)), 2)
            raw_mw = round(float(np.clip(base_raw, 0.0, capacity_mw)), 2)

            # Uncertainty bounds on persistence baseline (empirical error envelope)
            uncertainty_spread = 0.15 + (h / max(1, horizon_hours)) * 0.10
            p10 = round(max(0.0, final_mw * (1.0 - uncertainty_spread)), 2)
            p90 = round(min(capacity_mw, final_mw * (1.0 + uncertainty_spread)), 2)

            preds.append({
                "hour_ahead": h + 1,
                "baseline_mw": final_mw,
                "raw_persistence_mw": raw_mw,
                "weather_multiplier": round(weather_mult, 3),
                "p10_mw": p10,
                "p90_mw": p90
            })

        return preds
