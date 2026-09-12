"""
Nimbus Decision Engine & Grid Dispatch Optimizer
Transforms probabilistic renewable generation forecasts (P10/P50/P90) into
concrete operational actions via transparent threshold rules:
1. Battery Storage (BESS) charge / discharge dispatch
2. Curtailment order percentage calculation
3. Backup / Peaker unit activation with lead-time warnings
4. Multi-lens persona metrics (Operator, Utility Planner, Trader)
"""

import math
from typing import Dict, Any, List
from app.services.decision_engine import evaluate_decision_rules

def compute_grid_dispatch(site_data: Dict[str, Any], forecast_timeline: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Simulates regional grid demand matching, battery energy storage dispatch (BESS),
    identifies confidence-band over/under generation periods, and outputs actionable recommendations.
    """
    capacity_mw = float(site_data.get("capacity_mw", 1000.0))
    bess_cap_mwh = float(site_data.get("bess_capacity_mwh", capacity_mw * 0.5))
    bess_max_mw = float(site_data.get("bess_max_power_mw", capacity_mw * 0.25))

    base_demand = capacity_mw * 0.75

    # Battery state variables
    battery_soc_mwh = bess_cap_mwh * 0.50
    min_soc_mwh = bess_cap_mwh * 0.10
    max_soc_mwh = bess_cap_mwh * 0.95
    round_trip_eff = 0.92

    dispatch_records = []
    critical_actions = []

    total_clean_gen_mwh = 0.0
    total_curtailed_mwh = 0.0
    total_bess_charged_mwh = 0.0
    total_bess_discharged_mwh = 0.0
    total_peaker_backup_mwh = 0.0
    total_volume_at_risk_mwh = 0.0

    for i, item in enumerate(forecast_timeline):
        ts = item["timestamp"]
        gen_p50 = float(item["generation"]["total_p50_mw"])
        gen_p10 = float(item["generation"]["p10_mw"])
        gen_p90 = float(item["generation"]["p90_mw"])
        baseline_mw = float(item["generation"].get("baseline_mw", gen_p50))
        
        total_clean_gen_mwh += gen_p50
        spread_mw = max(0.0, gen_p90 - gen_p10)
        total_volume_at_risk_mwh += spread_mw

        # Diurnal regional demand model (MW)
        hour = int(ts[11:13]) if len(ts) >= 13 else (i % 24)
        if 7 <= hour < 11:
            demand_mult = 1.05 + 0.10 * math.sin((hour - 7) / 4.0 * math.pi)
        elif 11 <= hour < 17:
            demand_mult = 0.95 + 0.05 * math.cos((hour - 11) / 6.0 * math.pi)
        elif 17 <= hour <= 22:
            demand_mult = 1.25 + 0.15 * math.sin((hour - 17) / 5.0 * math.pi)
        else:
            demand_mult = 0.70 + 0.05 * math.sin(hour / 6.0 * math.pi)

        regional_demand_mw = round(base_demand * demand_mult, 2)

        # -------------------------------------------------------------
        # Plain if/else Decision Engine Rule Evaluation
        # -------------------------------------------------------------
        battery_headroom_mwh = max(0.0, max_soc_mwh - battery_soc_mwh)
        battery_available_discharge = max(0.0, battery_soc_mwh - min_soc_mwh)

        decision = evaluate_decision_rules(
            p10_mw=gen_p10,
            p50_mw=gen_p50,
            p90_mw=gen_p90,
            demand_mw=regional_demand_mw,
            battery_headroom_mwh=battery_headroom_mwh,
            bess_max_charge_mw=bess_max_mw,
            bess_available_discharge_mwh=battery_available_discharge,
            bess_max_discharge_mw=bess_max_mw,
            plant_capacity_mw=capacity_mw,
            reliability_threshold_pct=0.85
        )

        bess_action_mw = 0.0
        curtailment_mw = decision["curtailment_mw"]
        peaker_mw = decision["peaker_backup_mw"]

        # Apply battery flows
        if decision["bess_charge_mw"] > 0.0:
            bess_action_mw = -round(decision["bess_charge_mw"], 2)
            battery_soc_mwh += decision["bess_charge_mw"] * round_trip_eff
            total_bess_charged_mwh += decision["bess_charge_mw"]

        elif decision["bess_discharge_mw"] > 0.0:
            bess_action_mw = round(decision["bess_discharge_mw"], 2)
            battery_soc_mwh -= (decision["bess_discharge_mw"] / round_trip_eff)
            total_bess_discharged_mwh += decision["bess_discharge_mw"]

        total_curtailed_mwh += curtailment_mw
        total_peaker_backup_mwh += peaker_mw

        recommendations = [{
            "type": decision["flag"],
            "title": decision["action_title"],
            "description": decision["action_description"]
        }]

        if decision["severity"] in ["WARNING", "CRITICAL"] and i < 24:
            rec_action = (
                f"Derate inverters by {decision['curtailment_pct']}% and charge BESS at {decision['bess_charge_mw']} MW"
                if decision["flag"] == "CURTAILMENT_ALERT"
                else f"Activate peaker reserve ({decision['peaker_backup_mw']} MW) with {decision['lead_time_hours']}h ramp notice"
            )
            critical_actions.append({
                "id": f"alert_{i}",
                "hour_index": i,
                "timestamp": ts,
                "severity": decision["severity"],
                "type": decision["flag"],
                "title": decision["action_title"],
                "description": decision["action_description"],
                "recommended_action": rec_action,
                "lead_time_hours": decision["lead_time_hours"],
                "curtailment_mw": decision["curtailment_mw"],
                "peaker_backup_mw": decision["peaker_backup_mw"],
                "bess_charge_mw": decision["bess_charge_mw"],
                "bess_discharge_mw": decision["bess_discharge_mw"]
            })

        battery_soc_pct = round((battery_soc_mwh / bess_cap_mwh) * 100.0, 1) if bess_cap_mwh > 0 else 0.0

        dispatch_records.append({
            "timestamp": ts,
            "hour_index": i,
            "demand_mw": regional_demand_mw,
            "renewable_gen_mw": gen_p50,
            "renewable_p10_mw": gen_p10,
            "renewable_p90_mw": gen_p90,
            "baseline_gen_mw": baseline_mw,
            "bess_flow_mw": bess_action_mw,
            "bess_soc_pct": battery_soc_pct,
            "curtailment_mw": curtailment_mw,
            "peaker_backup_mw": peaker_mw,
            "status": decision["status"],
            "severity": decision["severity"],
            "recommendations": recommendations
        })

    avoided_curtailment_mwh = round(total_bess_charged_mwh * 0.95, 1)
    co2_avoided_tons = round(total_clean_gen_mwh * 0.72, 1)

    summary = {
        "total_clean_gen_mwh": round(total_clean_gen_mwh, 1),
        "total_curtailed_mwh": round(total_curtailed_mwh, 1),
        "avoided_curtailment_mwh": avoided_curtailment_mwh,
        "co2_avoided_tons": co2_avoided_tons,
        "peaker_energy_mwh": round(total_peaker_backup_mwh, 1),
        "bess_throughput_mwh": round(total_bess_charged_mwh + total_bess_discharged_mwh, 1),

        "operator": {
            "immediate_alert_count": len([a for a in critical_actions if a["severity"] in ["WARNING", "CRITICAL"]]),
            "current_bess_soc_pct": dispatch_records[0]["bess_soc_pct"] if dispatch_records else 50.0,
            "active_curtailment_order_mw": dispatch_records[0]["curtailment_mw"] if dispatch_records else 0.0,
            "next_peaker_lead_time": "2 hours" if any("2h" in a["title"] for a in critical_actions) else ("1 hour" if any(a["type"] == "BACKUP_PEAKER_ALERT" for a in critical_actions) else "Nominal")
        },

        "planner": {
            "reserve_margin_pct": round(max(5.0, 100.0 - (total_peaker_backup_mwh / max(1.0, total_clean_gen_mwh)) * 100.0), 1),
            "peaker_activation_hours": len([d for d in dispatch_records if d["peaker_backup_mw"] > 0]),
            "curtailment_hours_avoided": round(avoided_curtailment_mwh / max(1.0, bess_max_mw), 1),
            "grid_reliability_index": "99.8%" if total_peaker_backup_mwh < total_clean_gen_mwh * 0.1 else "98.4%"
        },

        "trader": {
            "volume_at_risk_mwh": round(total_volume_at_risk_mwh, 1),
            "firm_day_ahead_mwh": round(sum(d["renewable_p10_mw"] for d in dispatch_records[:24]), 1),
            "upside_potential_mwh": round(sum(d["renewable_p90_mw"] - d["renewable_gen_mw"] for d in dispatch_records[:24]), 1),
            "market_curtailment_exposure_pct": round((total_curtailed_mwh / max(1.0, total_clean_gen_mwh)) * 100.0, 2)
        }
    }

    if not critical_actions and forecast_timeline:
        critical_actions.append({
            "id": "alert_nominal",
            "hour_index": 0,
            "timestamp": forecast_timeline[0]["timestamp"],
            "severity": "INFO",
            "type": "GRID_BALANCED",
            "title": "Grid Operating in Nominal Equilibrium",
            "description": "Renewable generation envelope [P10–P90] matches scheduled demand safely within BESS operating parameters.",
            "recommended_action": "Maintain scheduled baseline dispatch.",
            "lead_time_hours": 0,
            "curtailment_mw": 0.0,
            "peaker_backup_mw": 0.0,
            "bess_charge_mw": 0.0,
            "bess_discharge_mw": 0.0
        })

    return {
        "summary": summary,
        "critical_actions": critical_actions[:8],
        "alerts": critical_actions[:8],
        "dispatch_timeline": dispatch_records
    }

