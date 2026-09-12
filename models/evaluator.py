"""
Nimbus Forecast Model Quality & Benchmark Evaluator
Computes MAE, RMSE, and the crucial Forecast Skill Score relative to Persistence Baseline:
    Skill Score = 1 - (MAE_model / MAE_baseline)
As specified in the Ideation Report, an accuracy number means nothing on its own;
what matters is how much better than 'just assume tomorrow looks like today' we actually managed.
"""

from typing import Dict, Any, List
import numpy as np

def calculate_mae(actuals: List[float], predictions: List[float]) -> float:
    y_true = np.array(actuals)
    y_pred = np.array(predictions)
    return round(float(np.mean(np.abs(y_true - y_pred))), 2)

def calculate_rmse(actuals: List[float], predictions: List[float]) -> float:
    y_true = np.array(actuals)
    y_pred = np.array(predictions)
    return round(float(np.sqrt(np.mean((y_true - y_pred) ** 2))), 2)

def calculate_skill_score(mae_model: float, mae_baseline: float) -> float:
    """
    Computes percentage improvement of model error over persistence baseline error.
    Returns percentage: e.g. +28.5% skill.
    """
    if mae_baseline <= 1e-4:
        return 0.0
    skill = (1.0 - (mae_model / mae_baseline)) * 100.0
    return round(float(skill), 2)

def compute_forecast_metrics(actuals: List[float], 
                             model_p50: List[float], 
                             baseline_preds: List[float],
                             model_p10: List[float] = None,
                             model_p90: List[float] = None) -> Dict[str, Any]:
    """
    Computes comprehensive validation scorecard for Nimbus.
    """
    mae_model = calculate_mae(actuals, model_p50)
    rmse_model = calculate_rmse(actuals, model_p50)
    mae_base = calculate_mae(actuals, baseline_preds)
    rmse_base = calculate_rmse(actuals, baseline_preds)
    skill_score = calculate_skill_score(mae_model, mae_base)

    coverage_pct = 0.0
    if model_p10 and model_p90 and len(actuals) > 0:
        in_interval = 0
        for y, p10, p90 in zip(actuals, model_p10, model_p90):
            if p10 <= y <= p90:
                in_interval += 1
        coverage_pct = round((in_interval / len(actuals)) * 100.0, 1)

    return {
        "model_mae_mw": mae_model,
        "model_rmse_mw": rmse_model,
        "baseline_mae_mw": mae_base,
        "baseline_rmse_mw": rmse_base,
        "skill_score_pct": skill_score,
        "confidence_coverage_pct": coverage_pct,
        "interpretation": f"Model reduces error by {skill_score}% compared to persistence baseline." if skill_score > 0 else "Model performs below persistence baseline benchmark."
    }
