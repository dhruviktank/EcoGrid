"""
Nimbus Decision Engine Rules
Deterministic, plain if/else threshold logic operating on top of quantile forecast bounds:

1. Over-generation (Curtailment):
   If upper bound (P90) exceeds demand + available storage capacity -> Flag Curtailment Order.

2. Under-generation (Backup Activation):
   If lower bound (P10) drops below reliability threshold -> Flag Backup Activation with lead-time notice.

3. Equilibrium (Balanced Nominal):
   Grid operating safely within renewable forecast bounds.
"""

from typing import Dict, Any


def evaluate_decision_rules(
    p10_mw: float,
    p50_mw: float,
    p90_mw: float,
    demand_mw: float,
    battery_headroom_mwh: float,
    bess_max_charge_mw: float,
    bess_available_discharge_mwh: float,
    bess_max_discharge_mw: float,
    plant_capacity_mw: float,
    reliability_threshold_pct: float = 0.85
) -> Dict[str, Any]:
    """
    Evaluates plain threshold rules for a single forecast time step.
    
    :param p10_mw: Conservative lower bound forecast (10th percentile)
    :param p50_mw: Scheduled median forecast (50th percentile)
    :param p90_mw: Optimistic upper bound forecast (90th percentile)
    :param demand_mw: Regional grid demand scheduled for this time step
    :param battery_headroom_mwh: Available energy capacity in BESS for charging
    :param bess_max_charge_mw: Inverter maximum power limit for charging
    :param bess_available_discharge_mwh: Energy available in BESS for discharging
    :param bess_max_discharge_mw: Inverter maximum power limit for discharging
    :param plant_capacity_mw: Nameplate rated capacity of the renewable plant
    :param reliability_threshold_pct: Grid firm reliability threshold (e.g. 0.85 = 85% of demand)
    :return: Structured action dictionary with severity, flags, and recommended dispatch orders
    """
    # -------------------------------------------------------------------------
    # RULE 1: OVER-GENERATION & CURTAILMENT
    # If upper bound (P90) exceeds demand + storage capacity -> Flag Curtailment
    # -------------------------------------------------------------------------
    storage_absorption_headroom = min(battery_headroom_mwh, bess_max_charge_mw)
    total_absorption_ceiling = demand_mw + storage_absorption_headroom

    if p90_mw > total_absorption_ceiling:
        surplus_p50_mw = max(0.0, p50_mw - demand_mw)
        bess_charge_mw = min(surplus_p50_mw, storage_absorption_headroom)
        
        # Scheduled curtailment needed if median exceeds demand + storage
        scheduled_curtailment_mw = round(max(0.0, surplus_p50_mw - bess_charge_mw), 1)
        # Potential upside excess risk from upper bound (P90) exceeding grid absorption
        upside_excess_mw = round(max(0.0, p90_mw - total_absorption_ceiling), 1)
        
        # Curtailment order is active if scheduled, or standby if upper bound risk
        curtailment_mw = scheduled_curtailment_mw if scheduled_curtailment_mw > 0 else upside_excess_mw
        curtailment_pct = round((curtailment_mw / max(1.0, plant_capacity_mw)) * 100.0, 1)

        severity = "CRITICAL" if (curtailment_pct > 25.0 or upside_excess_mw > plant_capacity_mw * 0.25) else "WARNING"
        action_prefix = "Active Curtailment" if scheduled_curtailment_mw > 0 else "Curtailment Standby"

        return {
            "flag": "CURTAILMENT_ALERT",
            "status": "OVER_GENERATION",
            "severity": severity,
            "curtailment_required": True,
            "curtailment_mw": curtailment_mw,
            "curtailment_pct": curtailment_pct,
            "bess_charge_mw": round(bess_charge_mw, 1),
            "bess_discharge_mw": 0.0,
            "peaker_backup_mw": 0.0,
            "lead_time_hours": 0,
            "action_title": f"{action_prefix} Order: {curtailment_pct}% ({curtailment_mw} MW)",
            "action_description": (
                f"Upper bound ({p90_mw} MW) exceeds grid demand ({demand_mw} MW) "
                f"+ storage capacity ({storage_absorption_headroom:.1f} MW). "
                f"Charge BESS at {bess_charge_mw:.1f} MW and flag curtailment order of {curtailment_mw} MW ({curtailment_pct}%)."
            )
        }

    # -------------------------------------------------------------------------
    # RULE 2: UNDER-GENERATION & BACKUP ACTIVATION
    # If lower bound (P10) drops below reliability threshold -> Flag Backup Activation
    # -------------------------------------------------------------------------
    available_bess_discharge = min(bess_available_discharge_mwh, bess_max_discharge_mw)
    firm_supply_floor = p10_mw + available_bess_discharge
    reliability_target_mw = demand_mw * reliability_threshold_pct

    scheduled_deficit_mw = max(0.0, demand_mw - (p50_mw + available_bess_discharge))
    reliability_deficit_mw = max(0.0, reliability_target_mw - firm_supply_floor)

    if firm_supply_floor < reliability_target_mw or p50_mw < (demand_mw - available_bess_discharge):
        # Dispatch available battery storage first
        nominal_deficit = max(0.0, demand_mw - p50_mw)
        bess_discharge_mw = min(nominal_deficit, available_bess_discharge)
        
        # Calculate backup requirement (maximum of scheduled deficit or lower-bound reliability risk)
        peaker_backup_mw = round(max(scheduled_deficit_mw, reliability_deficit_mw), 1)

        # Determine lead time: large shortfalls require 2h notice for thermal peaker ramp-up
        lead_time_hours = 2 if peaker_backup_mw > (plant_capacity_mw * 0.20) else 1
        severity = "CRITICAL" if peaker_backup_mw > (plant_capacity_mw * 0.35) else "WARNING"

        return {
            "flag": "BACKUP_PEAKER_ALERT",
            "status": "UNDER_GENERATION",
            "severity": severity,
            "curtailment_required": False,
            "curtailment_mw": 0.0,
            "curtailment_pct": 0.0,
            "bess_charge_mw": 0.0,
            "bess_discharge_mw": round(bess_discharge_mw, 1),
            "peaker_backup_mw": peaker_backup_mw,
            "lead_time_hours": lead_time_hours,
            "action_title": f"Backup Peaker Activation: {peaker_backup_mw} MW ({lead_time_hours}h lead time)",
            "action_description": (
                f"Lower bound ({p10_mw} MW) + BESS discharge ({bess_discharge_mw:.1f} MW) "
                f"falls below reliability threshold ({reliability_target_mw:.1f} MW). "
                f"Flag peaker backup activation with {lead_time_hours}h lead time for {peaker_backup_mw} MW."
            )
        }

    # -------------------------------------------------------------------------
    # RULE 3: GRID EQUILIBRIUM (BALANCED NOMINAL)
    # -------------------------------------------------------------------------
    return {
        "flag": "GRID_BALANCED",
        "status": "BALANCED",
        "severity": "INFO",
        "curtailment_required": False,
        "curtailment_mw": 0.0,
        "curtailment_pct": 0.0,
        "bess_charge_mw": 0.0,
        "bess_discharge_mw": 0.0,
        "peaker_backup_mw": 0.0,
        "lead_time_hours": 0,
        "action_title": "Grid Operating in Nominal Equilibrium",
        "action_description": f"Forecast envelope [{p10_mw} – {p90_mw}] MW satisfies scheduled demand ({demand_mw} MW)."
    }
