import React, { useState, useRef, useEffect } from 'react';

/**
 * Predefined data provenance configurations for enterprise transparency.
 */
export const DATA_PROVENANCE = {
  // 1. Real Empirical SCADA Telemetry
  'real-scada': {
    tier: 'REAL DATA',
    tierColor: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    dotColor: 'bg-emerald-500 shadow-emerald-500/50',
    badgeLabel: 'Real SCADA',
    icon: 'verified',
    source: 'Empirical SCADA Meter Readings (UK Dryad Offshore Wind & Kaggle Inverter Telemetry)',
    justification: 'Actual historical generation logs recorded from physical grid meters and inverter sensors. Raw half-hour MWh readings are converted to average MW (MW = MWh / 0.5) and resampled hourly for verified empirical comparison.',
    audit: 'Ground-truth sensor audit verified · No synthetic random generation'
  },

  // 2. Real-Time Numerical Weather Prediction (NWP)
  'real-weather': {
    tier: 'LIVE EXTERNAL DATA',
    tierColor: 'bg-cyan-50 text-cyan-800 border-cyan-300',
    dotColor: 'bg-cyan-500 shadow-cyan-500/50',
    badgeLabel: 'Live Weather',
    icon: 'satellite_alt',
    source: 'Open-Meteo Global NWP API (ECMWF & GFS atmospheric models)',
    justification: 'Fetches live meteorological parameters (Global Horizontal Irradiance GHI, Direct Normal Irradiance DNI, 10m & 100m wind speeds, ambient temperature, cloud cover %) for the exact latitude and longitude of the facility.',
    audit: 'Live HTTP weather ingestion · Synchronized with 72-hour forecast horizon'
  },

  // 3. 100% Real GIS Imagery & Positioning
  'real-gis': {
    tier: 'REAL GIS ASSET DATA',
    tierColor: 'bg-blue-50 text-blue-800 border-blue-300',
    dotColor: 'bg-blue-500 shadow-blue-500/50',
    badgeLabel: 'Real GIS',
    icon: 'public',
    source: 'ArcGIS Online World Imagery & Dark Canvas CDN (Esri Global GIS)',
    justification: 'High-resolution aerial satellite imagery and spatial map tiles centered exactly at the registered GPS coordinates of the renewable energy plant. No mock graphics or simulated maps.',
    audit: '100% genuine geodetic coordinates · Worldwide high-speed CDN'
  },

  // 4. Real Utility Plant Specifications
  'real-specs': {
    tier: 'VERIFIED ASSET DATA',
    tierColor: 'bg-teal-50 text-teal-800 border-teal-300',
    dotColor: 'bg-teal-500 shadow-teal-500/50',
    badgeLabel: 'Verified Specs',
    icon: 'domain',
    source: 'Official Utility Grid Registers (UK Crown Estate, MNRE India, CAISO US)',
    justification: 'Actual nameplate capacities (MW), coordinates, turbine counts, PV tilt angles, temperature coefficients, and BESS storage ratings (MW/MWh) matched against public grid filings.',
    audit: 'Validated utility registry specifications'
  },

  // 5. Machine Learning Quantile Predictions
  'ml-forecast': {
    tier: 'ML PREDICTED DATA',
    tierColor: 'bg-purple-50 text-purple-800 border-purple-300',
    dotColor: 'bg-purple-500 shadow-purple-500/50',
    badgeLabel: 'ML Forecast',
    icon: 'psychology',
    source: 'Calibrated XGBoost Quantile Regressors (P10/P50/P90) + Prophet Seasonality',
    justification: 'Trained on empirical SCADA holdouts with quantile pinball loss. Provides asymmetric uncertainty intervals: P50 represents the median expected generation, P10 defines the firm capacity floor, and P90 captures peak solar/wind surge ceilings.',
    audit: 'Cross-validated backtests · Calibrated PICP coverage > 80%'
  },

  // 6. Physical Engineering Aerodynamics & PV Cell Physics
  'physical-sim': {
    tier: 'PHYSICAL ENGINEERING CALCULATION',
    tierColor: 'bg-indigo-50 text-indigo-800 border-indigo-300',
    dotColor: 'bg-indigo-500 shadow-indigo-500/50',
    badgeLabel: 'Physical Model',
    icon: 'precision_manufacturing',
    source: 'IEC 61400 Turbine Power Curve & PV Cell Temperature Derating Algorithms',
    justification: 'Calculates physical power using aerodynamics (cut-in 3.0 m/s, rated 12.0 m/s, cut-out 25.0 m/s) and cell temperature derating: P = P_nom * [1 + γ * (T_cell - 25°C)] * (GHI / 1000). Combined into physics-informed ensemble.',
    audit: 'Physics-informed engineering constraints enforced'
  },

  // 7. BESS Battery Storage Optimization
  'bess-dispatch': {
    tier: 'ALGORITHMIC DISPATCH',
    tierColor: 'bg-amber-50 text-amber-800 border-amber-300',
    dotColor: 'bg-amber-500 shadow-amber-500/50',
    badgeLabel: 'BESS Dispatch',
    icon: 'battery_charging_full',
    source: 'EcoGrid Automated Grid Balancing & Peak Shaving Dispatcher',
    justification: 'Chronological hourly battery simulation tracking State-of-Charge (SoC 10%–95%), round-trip efficiency (88%), and maximum C-rate power constraints (MW) to absorb curtailment spikes and discharge during peak demand.',
    audit: 'Constrained physical battery simulation · Zero thermal over-discharge'
  },

  // 8. Deterministic Decision Engine & Grid Protection Rules
  'decision-engine': {
    tier: 'DETERMINISTIC RULE ENGINE',
    tierColor: 'bg-rose-50 text-rose-800 border-rose-300',
    dotColor: 'bg-rose-500 shadow-rose-500/50',
    badgeLabel: 'Decision Engine',
    icon: 'shield',
    source: 'Four Deterministic Grid Reliability & Ramp-Rate Rules',
    justification: 'Automated operational alerts generated strictly by comparing forecast confidence bounds (P10/P90) against physical interconnection limits: Rule 1 flags curtailment if P90 > ceiling; Rule 2 flags peaker backup with 2h lead time if P10 + BESS < threshold.',
    audit: 'Deterministic safety rules · Auditable decision logic'
  },

  // 9. Empirical Model Skill Score & Benchmarks
  'benchmark-skill': {
    tier: 'EMPIRICAL BENCHMARK',
    tierColor: 'bg-sky-50 text-sky-800 border-sky-300',
    dotColor: 'bg-sky-500 shadow-sky-500/50',
    badgeLabel: 'Skill Score',
    icon: 'analytics',
    source: 'Persistence Baseline (y_t-24) Holdout Validation',
    justification: 'Skill score quantifies percentage error reduction achieved by the ML ensemble over the standard persistence baseline model: Skill = [1 - (MAE_ensemble / MAE_baseline)] * 100. Evaluated against actual SCADA telemetry.',
    audit: 'Statistically verified against persistence benchmarks'
  }
};

/**
 * Reusable DataProvenanceBadge component.
 * Displays an info icon and provenance pill with an interactive popover detailing whether
 * data is REAL, ML-PREDICTED, LIVE NWP, or PHYSICAL SIMULATION, and justifies the display.
 */
export default function DataProvenanceBadge({
  type = 'ml-forecast',
  customTitle,
  customSource,
  customJustification,
  compact = false,
  showLabel = true,
  align = 'right', // 'right' | 'left' | 'center'
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);

  const config = DATA_PROVENANCE[type] || DATA_PROVENANCE['ml-forecast'];
  const title = customTitle || config.badgeLabel;
  const source = customSource || config.source;
  const justification = customJustification || config.justification;

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const alignClasses =
    align === 'left'
      ? 'left-0 origin-top-left'
      : align === 'center'
      ? 'left-1/2 -translate-x-1/2 origin-top'
      : 'right-0 origin-top-right';

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        className={`group inline-flex items-center gap-1 rounded-md transition-all cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
          compact
            ? 'p-0.5 text-slate-400 hover:text-cyan-700 hover:bg-cyan-50/80'
            : 'px-1.5 py-0.5 bg-slate-100/90 hover:bg-slate-200/90 text-slate-600 hover:text-slate-900 border border-slate-200/80 text-[10px] font-medium shadow-2xs'
        }`}
        title="Click to view data provenance & justification"
        aria-label={`Data provenance: ${config.tier}`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dotColor} group-hover:scale-110 transition-transform`}
        />
        {showLabel && !compact && (
          <span className="font-semibold tracking-tight">{title}</span>
        )}
        <span
          className={`material-symbols-outlined shrink-0 text-slate-400 group-hover:text-cyan-700 transition-colors ${
            compact ? 'text-[14px]' : 'text-[12px]'
          }`}
        >
          info
        </span>
      </button>

      {/* Floating Provenance & Justification Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          onMouseLeave={() => setIsOpen(false)}
          className={`absolute top-full mt-1.5 z-[9999] w-72 sm:w-80 p-3.5 bg-white/98 backdrop-blur-xl rounded-xl border border-slate-200 shadow-2xl shadow-slate-900/15 text-slate-800 text-left animate-in fade-in zoom-in-95 duration-150 ${alignClasses}`}
        >
          {/* Header Tier Pill */}
          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border ${config.tierColor}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
              {config.tier}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="text-slate-400 hover:text-slate-700 text-xs p-0.5 rounded hover:bg-slate-100"
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* Source Attribution */}
          <div className="mb-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
              Data Source & Origin
            </div>
            <div className="text-xs font-semibold text-slate-900 leading-snug flex items-start gap-1.5">
              <span className="material-symbols-outlined text-cyan-600 text-sm mt-0.5 shrink-0">
                {config.icon}
              </span>
              <span>{source}</span>
            </div>
          </div>

          {/* Justification & Engineering Methodology */}
          <div className="mb-2.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
              Data Justification & Method
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed bg-slate-50/80 p-2 rounded-lg border border-slate-100">
              {justification}
            </p>
          </div>

          {/* Audit Footer */}
          <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-emerald-700 font-medium">
            <span className="material-symbols-outlined text-xs shrink-0">verified</span>
            <span className="truncate">{config.audit}</span>
          </div>
        </div>
      )}
    </div>
  );
}
