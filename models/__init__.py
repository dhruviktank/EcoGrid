"""
Nimbus Forecasting Models Package
Contains Baseline Persistence benchmarks, XGBoost Quantile Regressors,
Prophet Uncertainty Forecasters, and Skill Score Evaluators.
"""

from .baseline import PersistenceBaselineModel
from .xgboost_model import XGBoostQuantileModel
from .prophet_model import ProphetRenewableModel
from .evaluator import compute_forecast_metrics, calculate_skill_score

__all__ = [
    "PersistenceBaselineModel",
    "XGBoostQuantileModel",
    "ProphetRenewableModel",
    "compute_forecast_metrics",
    "calculate_skill_score"
]
