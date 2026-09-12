import React, { useState, useEffect, useRef } from 'react';
import DataProvenanceBadge from './DataProvenanceBadge';

export default function HistoricalVsPredictedView({
  selectedSiteId = 'bhadla-solar',
  sites = [],
  embedded = false // when true, compact card version for embedding
}) {
  const [siteId, setSiteId] = useState(selectedSiteId);
  const [datasetOverride, setDatasetOverride] = useState(null); // 'kaggle_solar' or 'kaggle_wind'
  const [windowHours, setWindowHours] = useState(72);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Series visibility toggles
  const [showActual, setShowActual] = useState(true);
  const [showP50, setShowP50] = useState(true);
  const [showConfidence, setShowConfidence] = useState(true);
  const [showBaseline, setShowBaseline] = useState(true);
  const [showWeather, setShowWeather] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [tableFilter, setTableFilter] = useState('all'); // 'all' or 'deviations'

  // Hover state for interactive SVG
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  // Sync selectedSiteId prop when changed externally
  useEffect(() => {
    if (selectedSiteId && !datasetOverride) {
      setSiteId(selectedSiteId);
    }
  }, [selectedSiteId]);

  // Fetch historical vs predicted data
  useEffect(() => {
    setLoading(true);
    setError(null);

    let url = `/api/historical-vs-predicted?window_hours=${windowHours}`;
    if (datasetOverride) {
      url += `&dataset=${datasetOverride}`;
    } else {
      url += `&site_id=${siteId}`;
    }

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching historical vs predicted:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [siteId, datasetOverride, windowHours]);

  const series = data?.series || [];
  const metrics = data?.metrics || {};

  // Find site name
  const currentSite = sites.find(s => s.id === siteId) || { name: siteId, capacity_mw: 2245 };
  const displayName = datasetOverride === 'kaggle_solar'
    ? 'Kaggle Solar Plant 1 (28.7 MW Ground Truth Holdout)'
    : datasetOverride === 'kaggle_wind'
    ? 'Kaggle Wind Turbine SCADA (3.6 MW Ground Truth Holdout)'
    : `${currentSite.name || siteId} (${currentSite.capacity_mw} MW)`;

  // Chart dimensions
  const width = 960;
  const height = 280;
  const errorHeight = 85;
  const padding = { top: 25, right: 35, bottom: 30, left: 55 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Max scale for Power (MW)
  const maxActual = metrics.max_actual_mw || 100;
  const maxPred = metrics.max_predicted_mw || 100;
  const yMaxPower = Math.max(10, Math.ceil(Math.max(maxActual, maxPred) * 1.15));

  // Max scale for weather
  const isSolar = (datasetOverride === 'kaggle_solar') || (!datasetOverride && (currentSite.type === 'solar' || currentSite.type === 'hybrid'));
  const yMaxWeather = isSolar ? 1100 : 25; // 1100 W/m² or 25 m/s

  const getX = (i) => padding.left + (i / Math.max(1, series.length - 1)) * chartW;
  const getYPower = (val) => padding.top + chartH - (Math.max(0, val) / yMaxPower) * chartH;
  const getYWeather = (val) => padding.top + chartH - (Math.max(0, val) / yMaxWeather) * chartH;

  // Residual error Y scale (centered at 0)
  const maxErr = Math.max(1, ...series.map(d => Math.abs(d.error_mw || 0)));
  const yZeroErr = errorHeight / 2;
  const getYError = (val) => yZeroErr - (val / (maxErr * 1.2)) * (yZeroErr - 10);

  // Path generators
  const p10Points = series.map((d, i) => `${getX(i)},${getYPower(d.predicted_p10_mw)}`);
  const p90PointsRev = series.map((d, i) => `${getX(i)},${getYPower(d.predicted_p90_mw)}`).reverse();
  const confArea = p10Points.length > 0 ? `M ${p10Points.join(' L ')} L ${p90PointsRev.join(' L ')} Z` : '';

  const actualPoints = series.map((d, i) => `${getX(i)},${getYPower(d.actual_mw)}`);
  const actualPath = actualPoints.length > 0 ? `M ${actualPoints.join(' L ')}` : '';

  const p50Points = series.map((d, i) => `${getX(i)},${getYPower(d.predicted_p50_mw)}`);
  const p50Path = p50Points.length > 0 ? `M ${p50Points.join(' L ')}` : '';

  const basePoints = series.map((d, i) => `${getX(i)},${getYPower(d.baseline_mw)}`);
  const basePath = basePoints.length > 0 ? `M ${basePoints.join(' L ')}` : '';

  const weatherPoints = series.map((d, i) => {
    const val = isSolar ? d.weather?.ghi_wm2 || 0 : d.weather?.wind_speed_100m || 0;
    return `${getX(i)},${getYWeather(val)}`;
  });
  const weatherPath = weatherPoints.length > 0 ? `M ${weatherPoints.join(' L ')}` : '';

  const activeRec = hoverIdx !== null && series[hoverIdx] ? series[hoverIdx] : null;

  // Filtered table rows
  const tableRows = series.filter(row => {
    if (tableFilter === 'deviations') return !row.in_confidence_band;
    return true;
  });

  const handleExportCSV = () => {
    if (!series || series.length === 0) return;
    const headers = ['Timestamp', 'Actual_MW', 'Predicted_P50_MW', 'Predicted_P10_MW', 'Predicted_P90_MW', 'Baseline_MW', 'Residual_Error_MW', 'In_Confidence_Band', 'GHI_Wm2', 'Wind_Speed_ms', 'Temperature_C'];
    const rows = series.map(d => [
      d.timestamp,
      d.actual_mw,
      d.predicted_p50_mw,
      d.predicted_p10_mw,
      d.predicted_p90_mw,
      d.baseline_mw,
      d.error_mw,
      d.in_confidence_band ? 'YES' : 'NO',
      d.weather?.ghi_wm2 || '',
      d.weather?.wind_speed_100m || '',
      d.weather?.temperature_2m || ''
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ecogrid_audit_${siteId}_${windowHours}h.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200/80 flex flex-col ${embedded ? 'p-4' : 'p-6 gap-6'}`}>
      
      {/* 1. Header with Title and Global Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="material-symbols-outlined text-blue-600 text-xl shrink-0">history</span>
            <h3 className="text-base font-bold text-slate-900 whitespace-nowrap">
              Historical Actual vs Predicted Generation
            </h3>
            <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-200 whitespace-nowrap">
              SCADA Ground-Truth Telemetry
            </span>
            <DataProvenanceBadge type="real-scada" compact={false} align="left" />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Replaying recorded utility sensor generation side-by-side against calibrated XGBoost Quantile predictions (P10/P50/P90) &amp; Persistence Baseline.
          </p>
        </div>

        {/* Dataset & Horizon Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Dataset Dropdown */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-medium">Dataset:</span>
            <select
              value={datasetOverride || siteId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'kaggle_solar' || val === 'kaggle_wind') {
                  setDatasetOverride(val);
                } else {
                  setDatasetOverride(null);
                  setSiteId(val);
                }
              }}
              className="bg-slate-50 border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <optgroup label="Utility Fleet Telemetry">
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.type.toUpperCase()})</option>
                ))}
              </optgroup>
              <optgroup label="Kaggle Research Holdouts">
                <option value="kaggle_solar">Kaggle Plant 1 Solar (28.7 MW Holdout)</option>
                <option value="kaggle_wind">Kaggle Wind SCADA (3.6 MW Holdout)</option>
              </optgroup>
            </select>
          </div>

          {/* Window Range Pills */}
          <div className="inline-flex p-0.5 bg-slate-100 rounded-lg gap-0.5 border border-slate-200/80">
            {[
              { label: '24h', val: 24 },
              { label: '72h', val: 72 },
              { label: '7 Days', val: 168 },
              { label: '14 Days', val: 336 },
              { label: '30 Days', val: 720 }
            ].map(item => (
              <button
                key={item.val}
                onClick={() => setWindowHours(item.val)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  windowHours === item.val
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCSV}
            title="Download CSV of Historical vs Predicted records"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Live Validation Scorecard Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Metric 1: MAE */}
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mean Abs Error</span>
          <div className="my-1">
            <span className="text-xl font-bold text-slate-900 tabular-nums">
              {metrics.mae_mw ?? '--'} <span className="text-xs font-normal text-slate-500">MW</span>
            </span>
          </div>
          <span className="text-[11px] text-emerald-700 font-semibold">
            {metrics.nmae_pct ?? '--'}% <span className="text-slate-400 font-normal">of capacity</span>
          </span>
        </div>

        {/* Metric 2: RMSE */}
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Root Mean Sq Err</span>
          <div className="my-1">
            <span className="text-xl font-bold text-slate-900 tabular-nums">
              {metrics.rmse_mw ?? '--'} <span className="text-xs font-normal text-slate-500">MW</span>
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Peak: {metrics.max_actual_mw ?? '--'} MW
          </span>
        </div>

        {/* Metric 3: Skill Score */}
        {(() => {
          const score = Number(metrics.skill_score_pct ?? 0);
          const isPositive = score >= 0;
          return (
            <div className={`border rounded-xl p-3 flex flex-col justify-between ${
              isPositive ? 'bg-emerald-50/50 border-emerald-200/80' : 'bg-amber-50/50 border-amber-200/80'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  isPositive ? 'text-emerald-700' : 'text-amber-700'
                }`}>Skill Score</span>
                <DataProvenanceBadge type="benchmark-skill" compact={true} align="right" />
              </div>
              <div className="my-1">
                <span className={`text-xl font-bold tabular-nums ${
                  isPositive ? 'text-emerald-700' : 'text-amber-700'
                }`}>
                  {metrics.skill_score_pct != null 
                    ? (score > 0 ? `+${score}%` : `${score}%`)
                    : '--%'}
                </span>
              </div>
              <span className={`text-[11px] font-medium ${
                isPositive ? 'text-emerald-800' : 'text-amber-800'
              }`}>
                vs Baseline ({metrics.baseline_mae_mw ?? '--'} MW)
              </span>
            </div>
          );
        })()}

        {/* Metric 4: PICP Coverage */}
        <div className="bg-blue-50/50 border border-blue-200/80 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">P10–P90 Coverage</span>
          <div className="my-1">
            <span className="text-xl font-bold text-blue-700 tabular-nums">
              {metrics.picp_coverage_pct ?? '--'}%
            </span>
          </div>
          <span className="text-[11px] text-blue-800 font-medium">
            Nominal target: 80%
          </span>
        </div>

        {/* Metric 5: Correlation R² */}
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Correlation (R²)</span>
          <div className="my-1">
            <span className="text-xl font-bold text-slate-900 tabular-nums">
              {metrics.correlation_r2 ?? '--'}
            </span>
          </div>
          <span className="text-[11px] text-emerald-700 font-semibold">
            Strong Alignment
          </span>
        </div>

        {/* Metric 6: Total Energy Balance */}
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Energy Delta</span>
          <div className="my-1">
            <span className={`text-xl font-bold tabular-nums ${
              Math.abs(metrics.energy_delta_pct || 0) < 5 ? 'text-emerald-700' : 'text-slate-900'
            }`}>
              {metrics.energy_delta_pct != null 
                ? (metrics.energy_delta_pct > 0 ? `+${metrics.energy_delta_pct}%` : `${metrics.energy_delta_pct}%`)
                : '--%'}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 truncate" title={`${metrics.total_actual_mwh} MWh actual vs ${metrics.total_predicted_mwh} MWh pred`}>
            {metrics.total_actual_mwh?.toLocaleString()} MWh act
          </span>
        </div>
      </div>

      {/* 3. Series Toggle Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Actual Toggle */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowActual(!showActual)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                showActual ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200' : 'text-slate-400 line-through'
              }`}
            >
              <span className="w-3 h-1 bg-blue-600 rounded-full inline-block"></span>
              <span>Historical Actual (SCADA Ground Truth)</span>
            </button>
            <DataProvenanceBadge type="real-scada" compact={true} align="left" />
          </div>

          {/* P50 Toggle */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowP50(!showP50)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                showP50 ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200' : 'text-slate-400 line-through'
              }`}
            >
              <span className="w-3 h-1 bg-emerald-600 rounded-full inline-block"></span>
              <span>XGBoost Point Forecast (P50)</span>
            </button>
            <DataProvenanceBadge type="ml-forecast" compact={true} align="left" />
          </div>

          {/* Confidence Interval Toggle */}
          <button
            onClick={() => setShowConfidence(!showConfidence)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
              showConfidence ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200' : 'text-slate-400 line-through'
            }`}
          >
            <span className="w-3 h-3 bg-emerald-400/30 rounded inline-block"></span>
            <span>P10–P90 Confidence Envelope</span>
          </button>

          {/* Baseline Toggle */}
          <button
            onClick={() => setShowBaseline(!showBaseline)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
              showBaseline ? 'bg-amber-50 text-amber-700 font-bold border border-amber-200' : 'text-slate-400 line-through'
            }`}
          >
            <span className="w-3 h-0.5 border-b-2 border-dashed border-amber-600 inline-block"></span>
            <span>Persistence Baseline (Lag-24h)</span>
          </button>

          {/* Weather Overlay Toggle */}
          <button
            onClick={() => setShowWeather(!showWeather)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
              showWeather ? 'bg-cyan-50 text-cyan-700 font-bold border border-cyan-200' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className="w-3 h-0.5 border-b-2 border-dotted border-cyan-600 inline-block"></span>
            <span>{isSolar ? 'GHI Irradiance (W/m²)' : 'Wind Speed (m/s)'}</span>
          </button>
        </div>

        <button
          onClick={() => setShowTable(!showTable)}
          className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors"
        >
          <span className="material-symbols-outlined text-base">table_view</span>
          <span>{showTable ? 'Hide SCADA Audit Table' : 'Show SCADA Audit Table'}</span>
        </button>
      </div>

      {/* 4. Interactive Telemetry Chart */}
      {loading ? (
        <div className="w-full h-72 flex items-center justify-center bg-slate-50 rounded-xl border border-slate-100">
          <div className="flex flex-col items-center gap-2 text-slate-500 text-xs">
            <span className="material-symbols-outlined animate-spin text-2xl text-blue-600">sync</span>
            <span>Loading historical SCADA data & executing XGBoost models...</span>
          </div>
        </div>
      ) : error ? (
        <div className="w-full p-6 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-xs">
          Failed to load historical comparison: {error}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Main Line Chart (Generation MW) */}
          <div className="relative w-full bg-slate-50/40 rounded-xl p-2 border border-slate-100">
            <svg
              ref={svgRef}
              className="w-full overflow-visible cursor-crosshair"
              viewBox={`0 0 ${width} ${height}`}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * width;
                const ratio = Math.max(0, Math.min(1, (x - padding.left) / chartW));
                setHoverIdx(Math.round(ratio * (series.length - 1)));
              }}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <defs>
                <linearGradient id="hist-conf-grad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((step) => {
                const val = Math.round(yMaxPower * step);
                const y = getYPower(val);
                return (
                  <g key={val}>
                    <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" />
                    <text x={padding.left - 8} y={y + 3} fill="#94a3b8" fontSize="10" fontFamily="Geist" textAnchor="end">
                      {val.toLocaleString()} MW
                    </text>
                  </g>
                );
              })}

              {/* Weather Secondary Axis (Right Side) */}
              {showWeather && [0, 0.5, 1.0].map((step) => {
                const val = Math.round(yMaxWeather * step);
                const y = getYWeather(val);
                return (
                  <text key={val} x={width - padding.right + 8} y={y + 3} fill="#0891b2" fontSize="9" fontFamily="Geist">
                    {val} {isSolar ? 'W/m²' : 'm/s'}
                  </text>
                );
              })}

              {/* Shaded Confidence Band (P10 to P90) */}
              {showConfidence && confArea && (
                <path d={confArea} fill="url(#hist-conf-grad)" />
              )}

              {/* Persistence Baseline Curve */}
              {showBaseline && basePath && (
                <path d={basePath} fill="none" stroke="#d97706" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" />
              )}

              {/* Weather Curve */}
              {showWeather && weatherPath && (
                <path d={weatherPath} fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeDasharray="2 2" opacity="0.8" />
              )}

              {/* XGBoost Predicted (P50) Line */}
              {showP50 && p50Path && (
                <path d={p50Path} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" />
              )}

              {/* Actual SCADA Generation Line */}
              {showActual && actualPath && (
                <path d={actualPath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" />
              )}

              {/* Hover Crosshair & Indicators */}
              {activeRec && (
                <g>
                  <line
                    x1={getX(hoverIdx)}
                    y1={padding.top}
                    x2={getX(hoverIdx)}
                    y2={height - padding.bottom}
                    stroke="#475569"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />

                  {/* Actual marker */}
                  {showActual && (
                    <circle cx={getX(hoverIdx)} cy={getYPower(activeRec.actual_mw)} r="4.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
                  )}

                  {/* P50 marker */}
                  {showP50 && (
                    <circle cx={getX(hoverIdx)} cy={getYPower(activeRec.predicted_p50_mw)} r="4" fill="#059669" stroke="#ffffff" strokeWidth="2" />
                  )}

                  {/* Baseline marker */}
                  {showBaseline && (
                    <circle cx={getX(hoverIdx)} cy={getYPower(activeRec.baseline_mw)} r="3" fill="#d97706" />
                  )}
                </g>
              )}

              {/* Bottom Date Labels */}
              <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="1" />
              {series.map((d, i) => {
                const interval = windowHours <= 24 ? 3 : windowHours <= 72 ? 8 : windowHours <= 168 ? 24 : 48;
                if (i % interval === 0 || i === series.length - 1) {
                  const dateStr = d.timestamp.includes('T') ? d.timestamp.split('T')[0].slice(5) : d.timestamp.split(' ')[0].slice(5);
                  const timeStr = d.timestamp.includes('T') ? d.timestamp.split('T')[1].slice(0, 5) : d.timestamp.split(' ')[1].slice(0, 5);
                  return (
                    <g key={i}>
                      <line x1={getX(i)} y1={height - padding.bottom} x2={getX(i)} y2={height - padding.bottom + 4} stroke="#94a3b8" />
                      <text x={getX(i)} y={height - padding.bottom + 16} fill="#64748b" fontSize="9" fontFamily="Geist" textAnchor="middle">
                        {timeStr}
                      </text>
                      <text x={getX(i)} y={height - padding.bottom + 26} fill="#94a3b8" fontSize="8" fontFamily="Geist" textAnchor="middle">
                        {dateStr}
                      </text>
                    </g>
                  );
                }
                return null;
              })}
            </svg>

            {/* Floating Tooltip Card */}
            {activeRec && (
              <div
                className="absolute pointer-events-none z-20 bg-slate-900/95 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs backdrop-blur-md"
                style={{
                  left: `${Math.min(75, Math.max(10, (hoverIdx / series.length) * 100))}%`,
                  top: '15px',
                  transform: 'translateX(-50%)'
                }}
              >
                <div className="flex items-center justify-between gap-3 pb-1.5 mb-1.5 border-b border-slate-800">
                  <span className="font-bold text-slate-200">
                    {activeRec.timestamp.replace('T', ' ').replace('Z', '')}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    activeRec.in_confidence_band ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                  }`}>
                    {activeRec.in_confidence_band ? '✓ IN CONFIDENCE BAND' : '⚠ OUTLIER DEVIATION'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                    <span className="text-slate-400">Actual SCADA:</span>
                    <strong className="text-white font-mono">{activeRec.actual_mw} MW</strong>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                    <span className="text-slate-400">XGBoost (P50):</span>
                    <strong className="text-white font-mono">{activeRec.predicted_p50_mw} MW</strong>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                    <span className="text-slate-400">Baseline (Lag-24):</span>
                    <strong className="text-slate-300 font-mono">{activeRec.baseline_mw} MW</strong>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Residual Error:</span>
                    <strong className={`font-mono ${activeRec.error_mw >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {activeRec.error_mw > 0 ? `+${activeRec.error_mw}` : activeRec.error_mw} MW
                    </strong>
                  </div>

                  <div className="flex items-center gap-1.5 col-span-2 pt-1 border-t border-slate-800 text-[11px] text-slate-400">
                    <span>Quantile [P10 - P90]:</span>
                    <span className="font-mono text-emerald-300">
                      [{activeRec.predicted_p10_mw} — {activeRec.predicted_p90_mw}] MW
                    </span>
                    {activeRec.weather && (
                      <span className="ml-auto text-cyan-300 font-mono">
                        {isSolar ? `${activeRec.weather.ghi_wm2} W/m²` : `${activeRec.weather.wind_speed_100m} m/s`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Synchronized Residual Error Bar Chart (Actual - Predicted) */}
          <div className="w-full bg-slate-50/70 rounded-xl p-3 border border-slate-200/60">
            <div className="flex items-center justify-between mb-1 text-[11px] text-slate-500">
              <span className="font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-slate-500">waterfall_chart</span>
                Hourly Residual Error (Actual − Predicted P50)
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-blue-700">
                  <span className="w-2 h-2 bg-blue-500 rounded-sm inline-block"></span>
                  Under-forecast (Actual &gt; Model)
                </span>
                <span className="flex items-center gap-1 text-amber-700">
                  <span className="w-2 h-2 bg-amber-500 rounded-sm inline-block"></span>
                  Over-forecast (Model &gt; Actual)
                </span>
              </div>
            </div>

            <div className="w-full h-20">
              <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${errorHeight}`}>
                {/* Zero Center Line */}
                <line x1={padding.left} y1={yZeroErr} x2={width - padding.right} y2={yZeroErr} stroke="#94a3b8" strokeWidth="1" />
                <text x={padding.left - 6} y={yZeroErr + 3} fill="#64748b" fontSize="9" textAnchor="end">0</text>

                {/* Error Bars */}
                {series.map((d, i) => {
                  const x = getX(i);
                  const barW = Math.max(2, (chartW / series.length) * 0.7);
                  const errVal = d.error_mw || 0;
                  const y = getYError(errVal);
                  const barH = Math.max(1.5, Math.abs(y - yZeroErr));
                  const isUnder = errVal >= 0;

                  return (
                    <g key={i}>
                      <rect
                        x={x - barW / 2}
                        y={isUnder ? y : yZeroErr}
                        width={barW}
                        height={barH}
                        fill={isUnder ? '#3b82f6' : '#f59e0b'}
                        rx="1"
                        opacity={hoverIdx === i ? 1 : 0.75}
                      />
                      {/* Red indicator if outside confidence band */}
                      {!d.in_confidence_band && (
                        <circle cx={x} cy={isUnder ? y - 3 : yZeroErr + barH + 3} r="1.5" fill="#ef4444" />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* 5. Collapsible SCADA Ground-Truth Telemetry Audit Table */}
          {showTable && (
            <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-800">
                    SCADA Telemetry Inspection Log ({tableRows.length} Hours)
                  </h4>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <button
                    onClick={() => setTableFilter('all')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      tableFilter === 'all' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500'
                    }`}
                  >
                    All Hours ({series.length})
                  </button>
                  <button
                    onClick={() => setTableFilter('deviations')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      tableFilter === 'deviations' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'text-slate-500'
                    }`}
                  >
                    Outlier Deviations ({series.filter(s => !s.in_confidence_band).length})
                  </button>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-sm text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Timestamp</th>
                      <th className="py-2 px-3">Actual SCADA</th>
                      <th className="py-2 px-3">XGBoost (P50)</th>
                      <th className="py-2 px-3">Persistence Baseline</th>
                      <th className="py-2 px-3">Residual Error</th>
                      <th className="py-2 px-3">Confidence Envelope [P10–P90]</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {tableRows.map((row, idx) => (
                      <tr key={idx} className={`hover:bg-slate-50 transition-colors ${!row.in_confidence_band ? 'bg-rose-50/30' : ''}`}>
                        <td className="py-2 px-3 text-slate-700 font-sans font-medium text-[11px]">
                          {row.timestamp.replace('T', ' ').replace('Z', '')}
                        </td>
                        <td className="py-2 px-3 font-bold text-blue-700">
                          {row.actual_mw} MW
                        </td>
                        <td className="py-2 px-3 font-semibold text-emerald-700">
                          {row.predicted_p50_mw} MW
                        </td>
                        <td className="py-2 px-3 text-slate-500">
                          {row.baseline_mw} MW
                        </td>
                        <td className={`py-2 px-3 font-semibold ${row.error_mw >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                          {row.error_mw > 0 ? `+${row.error_mw}` : row.error_mw} MW
                        </td>
                        <td className="py-2 px-3 text-slate-600 text-[11px]">
                          [{row.predicted_p10_mw} — {row.predicted_p90_mw}] MW
                        </td>
                        <td className="py-2 px-3 font-sans">
                          {row.in_confidence_band ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              ✓ In Band
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                              ⚠ Deviation
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
