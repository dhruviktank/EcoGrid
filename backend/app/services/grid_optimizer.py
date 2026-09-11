import math
from typing import Dict, Any, List

def compute_grid_dispatch(site_data: Dict[str, Any], forecast_timeline: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Simulates grid demand matching, battery energy storage dispatch (BESS),
    identifies over/under generation periods, and outputs actionable grid recommendations.
    """
    capacity_mw = float(site_data.get("capacity_mw", 1000.0))
    bess_cap_mwh = float(site_data.get("bess_capacity_mwh", capacity_mw * 0.5))
    bess_max_mw = float(site_data.get("bess_max_power_mw", capacity_mw * 0.25))
    
    # Base regional grid demand profile scaled to site transmission allocation (~70-130% of plant capacity)
    base_demand = capacity_mw * 0.75
    
    # Battery parameters
    battery_soc_mwh = bess_cap_mwh * 0.50  # Start at 50% SoC
    min_soc_mwh = bess_cap_mwh * 0.10      # 10% depth of discharge limit
    max_soc_mwh = bess_cap_mwh * 0.95      # 95% max charge
    round_trip_eff = 0.90                  # 90% one-way 95%
    
    dispatch_records = []
    actions_log = []
    
    total_clean_gen_mwh = 0.0
    total_curtailed_mwh = 0.0
    total_bess_charged_mwh = 0.0
    total_bess_discharged_mwh = 0.0
    total_peaker_backup_mwh = 0.0
    
    for i, item in enumerate(forecast_timeline):
        ts = item["timestamp"]
        gen_p50 = item["generation"]["total_p50_mw"]
        total_clean_gen_mwh += gen_p50
        
        # Diurnal regional demand model (MW)
        hour = int(ts[11:13]) if len(ts) >= 13 else (i % 24)
        # Morning ramp (7-10), midday slight dip, high evening peak (18-22)
        if 7 <= hour < 11:
            demand_mult = 1.05 + 0.10 * math.sin((hour - 7) / 4 * math.pi)
        elif 11 <= hour < 17:
            demand_mult = 0.95 + 0.05 * math.cos((hour - 11) / 6 * math.pi)
        elif 17 <= hour <= 22:
            demand_mult = 1.25 + 0.15 * math.sin((hour - 17) / 5 * math.pi)
        else:
            demand_mult = 0.70 + 0.05 * math.sin(hour / 6 * math.pi)
            
        regional_demand_mw = round(base_demand * demand_mult, 2)
        net_load_mw = round(regional_demand_mw - gen_p50, 2)  # Positive = Deficit; Negative = Surplus
        
        # Grid dispatch logic
        bess_action_mw = 0.0  # + Discharging, - Charging
        curtailment_mw = 0.0
        peaker_mw = 0.0
        status_flag = "BALANCED"
        recommendations = []
        severity = "INFO" # INFO, WARNING, CRITICAL
        
        if net_load_mw < 0:
            # --------------------------------------------------
            # OVER-GENERATION (Surplus clean power)
            # --------------------------------------------------
            surplus_mw = abs(net_load_mw)
            status_flag = "OVER_GENERATION"
            
            # Can BESS absorb it?
            available_charge_capacity = (max_soc_mwh - battery_soc_mwh)
            charge_power = min(surplus_mw, bess_max_mw, available_charge_capacity / 1.0)
            
            if charge_power > 1.0:
                bess_action_mw = -round(charge_power, 2)
                battery_soc_mwh += charge_power * round_trip_eff
                total_bess_charged_mwh += charge_power
                recommendations.append({
                    "type": "STORAGE_DISPATCH_CHARGE",
                    "title": f"Charge BESS Battery ({round(charge_power, 1)} MW)",
                    "description": f"Absorbing {round(charge_power, 1)} MW surplus into energy storage to prevent grid frequency excursions."
                })
            
            # Remaining surplus after battery charging
            remaining_surplus = surplus_mw - charge_power
            if remaining_surplus > 5.0:
                curtailment_mw = round(remaining_surplus, 2)
                total_curtailed_mwh += curtailment_mw
                severity = "WARNING" if remaining_surplus < capacity_mw * 0.3 else "CRITICAL"
                recommendations.append({
                    "type": "CURTAILMENT_ALERT",
                    "title": f"Mandatory Curtailment Order ({round(curtailment_mw, 1)} MW)",
                    "description": f"Surplus exceeds BESS capacity and local transmission limits. Derate inverters/turbines by {round(curtailment_mw, 1)} MW."
                })
            else:
                recommendations.append({
                    "type": "MARKET_OPPORTUNITY",
                    "title": "Favorable Export Pricing",
                    "description": "Grid surplus available for regional interconnect export or day-ahead bilateral sale."
                })
                
        elif net_load_mw > 0:
            # --------------------------------------------------
            # UNDER-GENERATION (Supply deficit)
            # --------------------------------------------------
            deficit_mw = net_load_mw
            status_flag = "UNDER_GENERATION"
            
            # Can BESS supply clean power?
            available_discharge_energy = (battery_soc_mwh - min_soc_mwh)
            discharge_power = min(deficit_mw, bess_max_mw, available_discharge_energy * round_trip_eff)
            
            if discharge_power > 1.0:
                bess_action_mw = round(discharge_power, 2)
                battery_soc_mwh -= (discharge_power / round_trip_eff)
                total_bess_discharged_mwh += discharge_power
                recommendations.append({
                    "type": "STORAGE_DISPATCH_DISCHARGE",
                    "title": f"Discharge BESS Storage ({round(discharge_power, 1)} MW)",
                    "description": f"Dispatching {round(discharge_power, 1)} MW from battery storage to cover renewable drop."
                })
                
            # Remaining deficit after battery discharge
            remaining_deficit = deficit_mw - discharge_power
            if remaining_deficit > 10.0:
                peaker_mw = round(remaining_deficit, 2)
                total_peaker_backup_mwh += peaker_mw
                severity = "CRITICAL" if remaining_deficit > capacity_mw * 0.4 else "WARNING"
                recommendations.append({
                    "type": "BACKUP_ACTIVATION",
                    "title": f"Spinning Reserve / Peaker Alert ({round(peaker_mw, 1)} MW)",
                    "description": f"Firm capacity deficit of {round(peaker_mw, 1)} MW. Activate fast-ramping peaker units or initiate Demand Response."
                })
            else:
                severity = "INFO"
                recommendations.append({
                    "type": "GRID_STABLE",
                    "title": "Firm Reserves Nominal",
                    "description": "Minor load delta managed within automatic generation control (AGC) spinning reserves."
                })
        else:
            status_flag = "BALANCED"
            recommendations.append({
                "type": "BALANCED_DISPATCH",
                "title": "Equilibrium Maintained",
                "description": "Renewable generation perfectly satisfies scheduled transmission draw."
            })

        battery_soc_pct = round((battery_soc_mwh / bess_cap_mwh) * 100.0, 1) if bess_cap_mwh > 0 else 0.0

        dispatch_records.append({
            "timestamp": ts,
            "hour_index": i,
            "demand_mw": regional_demand_mw,
            "renewable_gen_mw": gen_p50,
            "net_load_mw": net_load_mw,
            "bess_flow_mw": bess_action_mw,
            "bess_soc_mwh": round(battery_soc_mwh, 2),
            "bess_soc_pct": battery_soc_pct,
            "curtailment_mw": curtailment_mw,
            "peaker_backup_mw": peaker_mw,
            "status": status_flag,
            "severity": severity,
            "recommendations": recommendations
        })
        
        # Log critical recommendations for the executive summary
        if severity in ["WARNING", "CRITICAL"]:
            for r in recommendations:
                if r["type"] in ["CURTAILMENT_ALERT", "BACKUP_ACTIVATION", "STORAGE_DISPATCH_CHARGE"]:
                    actions_log.append({
                        "timestamp": ts,
                        "hour": hour,
                        "type": r["type"],
                        "title": r["title"],
                        "description": r["description"],
                        "severity": severity
                    })

    # Summary KPI calculations
    # 0.82 metric tonnes CO2 avoided per MWh renewable clean energy replacing coal/gas
    co2_avoided_tons = round(total_clean_gen_mwh * 0.82, 1)
    
    # Financial estimation:
    # Value of curtailed energy preserved via BESS: ~$65/MWh
    # Avoided fossil fuel peaker fuel costs: ~$95/MWh
    financial_savings_usd = round(
        (total_bess_discharged_mwh * 95.0) + (total_bess_charged_mwh * 25.0), 2
    )

    return {
        "summary": {
            "total_clean_gen_mwh": round(total_clean_gen_mwh, 1),
            "total_curtailed_mwh": round(total_curtailed_mwh, 1),
            "curtailment_rate_pct": round((total_curtailed_mwh / max(1.0, total_clean_gen_mwh)) * 100.0, 2),
            "bess_discharged_mwh": round(total_bess_discharged_mwh, 1),
            "peaker_backup_required_mwh": round(total_peaker_backup_mwh, 1),
            "co2_avoided_tons": co2_avoided_tons,
            "estimated_value_unlocked_usd": financial_savings_usd,
            "curtailment_incidents_count": sum(1 for d in dispatch_records if d["curtailment_mw"] > 0),
            "peaker_alerts_count": sum(1 for d in dispatch_records if d["peaker_backup_mw"] > 0)
        },
        "critical_actions": actions_log[:15], # top critical actions
        "dispatch_timeline": dispatch_records
    }
