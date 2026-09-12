"""
Tests for Nimbus Decision Engine Plain Threshold Rules:
1. Over-generation (Curtailment): Upper bound > demand + storage capacity
2. Under-generation (Backup Activation): Lower bound < reliability threshold
3. Equilibrium: Grid within nominal bounds
"""

import pytest
from app.services.decision_engine import evaluate_decision_rules


def test_decision_engine_rule_curtailment_active():
    """
    Test Rule 1: When scheduled and upper bound forecast exceeds demand + storage capacity,
    curtailment alert is triggered with exact curtailment MW and derating percentage.
    """
    decision = evaluate_decision_rules(
        p10_mw=700.0,
        p50_mw=900.0,
        p90_mw=1000.0,
        demand_mw=500.0,
        battery_headroom_mwh=100.0,
        bess_max_charge_mw=100.0,
        bess_available_discharge_mwh=50.0,
        bess_max_discharge_mw=50.0,
        plant_capacity_mw=1000.0,
        reliability_threshold_pct=0.85
    )

    assert decision["flag"] == "CURTAILMENT_ALERT"
    assert decision["status"] == "OVER_GENERATION"
    assert decision["curtailment_required"] is True
    # Demand = 500, storage headroom = 100 -> Total absorption ceiling = 600
    # P50 = 900 -> Surplus = 400. BESS absorbs 100 MW. Curtailment = 300 MW (30.0%)
    assert decision["bess_charge_mw"] == 100.0
    assert decision["curtailment_mw"] == 300.0
    assert decision["curtailment_pct"] == 30.0
    assert decision["severity"] == "CRITICAL"
    assert "Active Curtailment" in decision["action_title"]


def test_decision_engine_rule_curtailment_standby_upper_bound():
    """
    Test Rule 1: When P50 is within demand + storage, but upper bound (P90) exceeds absorption ceiling,
    curtailment standby alert is flagged to protect grid frequency.
    """
    decision = evaluate_decision_rules(
        p10_mw=300.0,
        p50_mw=480.0,
        p90_mw=700.0,
        demand_mw=450.0,
        battery_headroom_mwh=100.0,
        bess_max_charge_mw=100.0,
        bess_available_discharge_mwh=50.0,
        bess_max_discharge_mw=50.0,
        plant_capacity_mw=1000.0,
        reliability_threshold_pct=0.85
    )

    # Ceiling = 450 + 100 = 550 MW. P90 = 700 MW > 550 MW ceiling
    assert decision["flag"] == "CURTAILMENT_ALERT"
    assert decision["status"] == "OVER_GENERATION"
    assert decision["curtailment_required"] is True
    assert decision["curtailment_mw"] == 150.0  # 700 - 550
    assert "Curtailment Standby" in decision["action_title"]


def test_decision_engine_rule_backup_activation_under_generation():
    """
    Test Rule 2: When lower bound drops below reliability threshold,
    backup activation is flagged with lead-time notice.
    """
    decision = evaluate_decision_rules(
        p10_mw=100.0,
        p50_mw=250.0,
        p90_mw=350.0,
        demand_mw=500.0,
        battery_headroom_mwh=200.0,
        bess_max_charge_mw=100.0,
        bess_available_discharge_mwh=50.0,
        bess_max_discharge_mw=50.0,
        plant_capacity_mw=1000.0,
        reliability_threshold_pct=0.85
    )

    # Reliability target = 500 * 0.85 = 425 MW
    # Firm supply floor = P10 (100) + BESS discharge (50) = 150 MW
    # Breaches 425 MW!
    # Scheduled deficit = 500 - (250 + 50) = 200 MW
    # Reliability deficit = 425 - 150 = 275 MW
    # Peaker backup = max(200, 275) = 275 MW
    assert decision["flag"] == "BACKUP_PEAKER_ALERT"
    assert decision["status"] == "UNDER_GENERATION"
    assert decision["peaker_backup_mw"] == 275.0
    assert decision["bess_discharge_mw"] == 50.0
    # 275 MW > 20% of 1000 MW -> 2 hours lead time
    assert decision["lead_time_hours"] == 2
    assert "Backup Peaker Activation" in decision["action_title"]


def test_decision_engine_rule_grid_equilibrium():
    """
    Test Rule 3: When generation and storage comfortably satisfy demand within bounds,
    system reports nominal equilibrium.
    """
    decision = evaluate_decision_rules(
        p10_mw=450.0,
        p50_mw=500.0,
        p90_mw=530.0,
        demand_mw=500.0,
        battery_headroom_mwh=100.0,
        bess_max_charge_mw=100.0,
        bess_available_discharge_mwh=50.0,
        bess_max_discharge_mw=50.0,
        plant_capacity_mw=1000.0,
        reliability_threshold_pct=0.85
    )

    # Reliability target = 500 * 0.85 = 425 MW. Firm floor = 450 + 50 = 500 MW >= 425 MW.
    # Total absorption ceiling = 500 + 100 = 600 MW. P90 = 530 MW <= 600 MW.
    assert decision["flag"] == "GRID_BALANCED"
    assert decision["status"] == "BALANCED"
    assert decision["severity"] == "INFO"
    assert decision["curtailment_required"] is False
    assert decision["curtailment_mw"] == 0.0
    assert decision["peaker_backup_mw"] == 0.0
    assert decision["lead_time_hours"] == 0
