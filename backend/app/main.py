import json
import os
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.services.weather_service import get_hourly_weather
from app.services.forecasting_service import generate_renewable_forecast
from app.services.grid_optimizer import compute_grid_dispatch

app = FastAPI(
    title="AetherGrid AI - Renewable Generation Forecasting & Grid Dispatch Platform",
    description="Multi-horizon solar and wind forecasting with physics-informed ML, BESS dispatch, and automated grid curtailment/backup intelligence.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load sample sites
SITES_PATH = os.path.join(os.path.dirname(__file__), "data", "sample_sites.json")
def load_sites() -> List[Dict[str, Any]]:
    if os.path.exists(SITES_PATH):
        with open(SITES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

SITES_CACHE = load_sites()

class ScenarioShocks(BaseModel):
    cloud_multiplier: float = 1.0
    wind_multiplier: float = 1.0
    temp_delta: float = 0.0

class ForecastRequest(BaseModel):
    site_id: Optional[str] = "bhadla-solar"
    custom_site: Optional[Dict[str, Any]] = None
    forecast_days: int = 3  # 1 (24h), 2 (48h), 3 (72h)
    scenario_shocks: Optional[ScenarioShocks] = None

@app.get("/")
def root():
    return {
        "status": "online",
        "platform": "AetherGrid AI Intelligence Core",
        "endpoints": ["/api/sites", "/api/forecast", "/api/simulate", "/api/export-scada"]
    }

@app.get("/api/sites")
def get_sites():
    """Returns available utility-scale renewable sites."""
    return {
        "count": len(SITES_CACHE),
        "sites": SITES_CACHE
    }

@app.post("/api/forecast")
def get_forecast(req: ForecastRequest):
    """
    Ingests weather, computes multi-model generation forecast (Physics, XGBoost, LSTM, Ensemble, P10/P90),
    and optimizes grid balancing & BESS dispatch over the 24h-72h horizon.
    """
    target_site = None
    if req.custom_site:
        target_site = req.custom_site
    else:
        for s in SITES_CACHE:
            if s["id"] == req.site_id:
                target_site = s
                break
                
    if not target_site:
        target_site = SITES_CACHE[0] if SITES_CACHE else {
            "id": "custom",
            "name": "Custom Facility",
            "type": "solar",
            "latitude": 27.0,
            "longitude": 71.0,
            "capacity_mw": 1000.0,
            "bess_capacity_mwh": 500.0,
            "bess_max_power_mw": 150.0
        }

    lat = float(target_site.get("latitude", 27.539))
    lon = float(target_site.get("longitude", 71.915))
    days = min(3, max(1, req.forecast_days))
    
    # 1. Weather Ingestion
    weather_resp = get_hourly_weather(lat, lon, forecast_days=days)
    weather_data = weather_resp.get("data", [])
    
    # 2. Renewable Generation Forecasting (Physics + ML + Ensemble)
    shocks = req.scenario_shocks.model_dump() if req.scenario_shocks else {}
    forecast_output = generate_renewable_forecast(target_site, weather_data, scenario_shocks=shocks)
    
    # 3. Grid Balancing & BESS Dispatch Engine
    grid_output = compute_grid_dispatch(target_site, forecast_output["timeline"])
    
    return {
        "site": target_site,
        "weather_source": weather_resp.get("source"),
        "forecast_hours": forecast_output["forecast_hours"],
        "forecast_timeline": forecast_output["timeline"],
        "grid_summary": grid_output["summary"],
        "critical_actions": grid_output["critical_actions"],
        "dispatch_timeline": grid_output["dispatch_timeline"]
    }

@app.post("/api/simulate")
def simulate_scenario(req: ForecastRequest):
    """Convenience alias for what-if stress tests."""
    return get_forecast(req)

@app.get("/api/export-scada")
def export_scada_schedule(site_id: str = "bhadla-solar", format: str = "json"):
    """
    Exports a SCADA-compliant dispatch order timeline for grid automation systems.
    """
    req = ForecastRequest(site_id=site_id, forecast_days=3)
    result = get_forecast(req)
    
    dispatch_rows = []
    for d in result["dispatch_timeline"]:
        dispatch_rows.append({
            "timestamp": d["timestamp"],
            "demand_mw": d["demand_mw"],
            "scheduled_renewable_p50_mw": d["renewable_gen_mw"],
            "bess_dispatch_mw": d["bess_flow_mw"],
            "curtailment_mw": d["curtailment_mw"],
            "peaker_activation_mw": d["peaker_backup_mw"],
            "grid_status": d["status"],
            "bess_soc_pct": d["bess_soc_pct"]
        })
        
    if format.lower() == "csv":
        import io
        import csv
        output = io.StringIO()
        if dispatch_rows:
            writer = csv.DictWriter(output, fieldnames=dispatch_rows[0].keys())
            writer.writeheader()
            writer.writerows(dispatch_rows)
        return {
            "format": "csv",
            "filename": f"scada_schedule_{site_id}.csv",
            "content": output.getvalue()
        }
        
    return {
        "format": "json",
        "site_id": site_id,
        "total_records": len(dispatch_rows),
        "schedule": dispatch_rows
    }
