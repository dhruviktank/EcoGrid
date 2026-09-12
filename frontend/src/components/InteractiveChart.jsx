import React, { useState, useRef } from 'react';
import { Eye, EyeOff, CloudRain, Sun, Wind, Activity, Award, ShieldAlert } from 'lucide-react';

export default function InteractiveChart({
  forecastTimeline,
  dispatchTimeline,
  site,
  horizonHours,
  activeModel
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [showConfidence, setShowConfidence] = useState(true);
  const [showDemand, setShowDemand] = useState(true);
  const [showBaseline, setShowBaseline] = useState(true);
  const [showWeather, setShowWeather] = useState(false);
  const svgRef = useRef(null);

  const fData = (forecastTimeline || []).slice(0, horizonHours);
  const dData = (dispatchTimeline || []).slice(0, horizonHours);

  if (!fData || fData.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        No telemetry stream available for selected horizon.
      </div>
    );
  }

  const width = 1000;
  const height = 360;
  const padding = { top: 25, right: 40, bottom: 45, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const capacityMw = site?.capacity_mw || 1000;
  const maxGen = Math.max(
    ...fData.map(d => Math.max(d.generation?.p90_mw || 0, d.generation?.total_p50_mw || 0, d.generation?.baseline_mw || 0)),
    ...dData.map(d => d.demand_mw || 0),
    capacityMw * 0.8
  );
  const yMax = Math.ceil(maxGen * 1.15 / 100) * 100;

  const isSolar = site?.type === 'solar';
  const weatherMax = isSolar ? 1100 : 25;

  const getX = (idx) => padding.left + (idx / Math.max(1, fData.length - 1)) * chartWidth;
  const getY = (val) => padding.top + chartHeight - (val / yMax) * chartHeight;
  const getYWeather = (val) => padding.top + chartHeight - (val / weatherMax) * chartHeight;

  // 1. Generation Curve (P50 or selected model)
  const genPoints = fData.map((d, i) => {
    let val = d.generation?.total_p50_mw || 0;
    if (activeModel === 'xgboost') val = d.model_breakdown?.xgboost_mw ?? val;
    if (activeModel === 'prophet') val = d.model_breakdown?.prophet_mw ?? val;
    if (activeModel === 'baseline') val = d.generation?.baseline_mw ?? val;
    if (activeModel === 'physics') val = d.model_breakdown?.physics_mw ?? val;
    return `${getX(i)},${getY(val)}`;
  });
  const genPath = `M ${genPoints.join(' L ')}`;

  // 2. Confidence Area (P10 to P90)
  const p10Points = fData.map((d, i) => `${getX(i)},${getY(d.generation?.p10_mw || 0)}`);
  const p90PointsRev = fData.map((d, i) => `${getX(i)},${getY(d.generation?.p90_mw || 0)}`).reverse();
  const confidenceAreaPath = `M ${p10Points.join(' L ')} L ${p90PointsRev.join(' L ')} Z`;

  // 3. Persistence Baseline Curve (Benchmark)
  const baselinePoints = fData.map((d, i) => `${getX(i)},${getY(d.generation?.baseline_mw || d.model_breakdown?.baseline_persistence_mw || 0)}`);
  const baselinePath = `M ${baselinePoints.join(' L ')}`;

  // 4. Regional Demand Curve
  const demandPoints = dData.map((d, i) => `${getX(i)},${getY(d.demand_mw || 0)}`);
  const demandPath = `M ${demandPoints.join(' L ')}`;

  // 5. Weather Curve
  const weatherPoints = fData.map((d, i) => {
    const val = isSolar ? d.weather?.ghi_wm2 || 0 : d.weather?.wind_speed_100m || 0;
    return `${getX(i)},${getYWeather(val)}`;
  });
  const weatherPath = `M ${weatherPoints.join(' L ')}`;

  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * width;
    const clampedX = Math.max(padding.left, Math.min(width - padding.right, mouseX));
    const ratio = (clampedX - padding.left) / chartWidth;
    const index = Math.round(ratio * (fData.length - 1));
    setHoverIndex(index);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activeRecord = hoverIndex !== null ? fData[hoverIndex] : fData[0];
  const activeDispatch = hoverIndex !== null && dData[hoverIndex] ? dData[hoverIndex] : dData[0];

  const themeColor = site?.type === 'wind' ? '#06b6d4' : site?.type === 'solar' ? '#f59e0b' : '#10b981';

  return (
    <div className="glass-panel" style={{ margin: '0 20px 20px 20px', padding: '20px 24px' }}>
      
      {/* Chart Top Header & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', letterSpacing: '-0.01em', color: '#f8fafc' }}>
              Multi-Horizon Renewable Generation vs Grid Demand
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
              {horizonHours}H Horizon • Layer: {activeModel.toUpperCase()}
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Calibrated P10–P90 confidence bounds, Persistence Baseline benchmark, and automated BESS/curtailment decision triggers.
          </p>
        </div>

        {/* Visibility Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowConfidence(!showConfidence)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: showConfidence ? 'rgba(6, 182, 212, 0.15)' : 'rgba(30, 41, 59, 0.4)',
              color: showConfidence ? '#22d3ee' : '#64748b',
              fontSize: '0.75rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {showConfidence ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>P10–P90 Band</span>
          </button>

          <button
            onClick={() => setShowBaseline(!showBaseline)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: showBaseline ? 'rgba(245, 158, 11, 0.15)' : 'rgba(30, 41, 59, 0.4)',
              color: showBaseline ? '#fbbf24' : '#64748b',
              fontSize: '0.75rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {showBaseline ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>Persistence Baseline</span>
          </button>

          <button
            onClick={() => setShowDemand(!showDemand)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: showDemand ? 'rgba(168, 85, 247, 0.15)' : 'rgba(30, 41, 59, 0.4)',
              color: showDemand ? '#c084fc' : '#64748b',
              fontSize: '0.75rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {showDemand ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>Regional Demand</span>
          </button>

          <button
            onClick={() => setShowWeather(!showWeather)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: showWeather ? 'rgba(234, 179, 8, 0.15)' : 'rgba(30, 41, 59, 0.4)',
              color: showWeather ? '#facc15' : '#64748b',
              fontSize: '0.75rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {isSolar ? <Sun size={13} /> : <Wind size={13} />}
            <span>{isSolar ? 'Solar GHI' : 'Wind (100m)'}</span>
          </button>
        </div>
      </div>

      {/* SVG Chart */}
      <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={themeColor} floodOpacity="0.6" />
            </filter>

            <linearGradient id="confidenceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={themeColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={themeColor} stopOpacity="0.03" />
            </linearGradient>
          </defs>

          {/* Grid lines (horizontal) */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((ratio, idx) => {
            const val = yMax * ratio;
            const y = getY(val);
            return (
              <g key={idx}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(148, 163, 184, 0.12)"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  fill="#64748b"
                  fontSize="11"
                  textAnchor="end"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {Math.round(val)} MW
                </text>
              </g>
            );
          })}

          {/* Vertical Time markers */}
          {fData.map((d, i) => {
            if (i % (horizonHours === 72 ? 12 : horizonHours === 48 ? 6 : 4) === 0 || i === fData.length - 1) {
              const x = getX(i);
              const dateStr = d.timestamp.substring(11, 16);
              const dayStr = d.timestamp.substring(5, 10);
              return (
                <g key={i}>
                  <line
                    x1={x}
                    y1={padding.top}
                    x2={x}
                    y2={height - padding.bottom}
                    stroke="rgba(148, 163, 184, 0.08)"
                  />
                  <text
                    x={x}
                    y={height - padding.bottom + 18}
                    fill="#94a3b8"
                    fontSize="11"
                    textAnchor="middle"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {dateStr}
                  </text>
                  <text
                    x={x}
                    y={height - padding.bottom + 30}
                    fill="#64748b"
                    fontSize="9"
                    textAnchor="middle"
                  >
                    {dayStr}
                  </text>
                </g>
              );
            }
            return null;
          })}

          {/* Confidence Band Envelope (P10 - P90) */}
          {showConfidence && (
            <path
              d={confidenceAreaPath}
              fill="url(#confidenceGrad)"
            />
          )}

          {/* Regional Demand Curve */}
          {showDemand && (
            <path
              d={demandPath}
              fill="none"
              stroke="#c084fc"
              strokeWidth="2"
              strokeDasharray="5 4"
              opacity="0.85"
            />
          )}

          {/* Persistence Baseline Curve (Benchmark) */}
          {showBaseline && (
            <path
              d={baselinePath}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.8"
              strokeDasharray="4 3"
              opacity="0.7"
            />
          )}

          {/* Weather Secondary Curve */}
          {showWeather && (
            <path
              d={weatherPath}
              fill="none"
              stroke="#facc15"
              strokeWidth="1.8"
              strokeDasharray="2 2"
              opacity="0.75"
            />
          )}

          {/* Generation Forecast Line (P50) */}
          <path
            d={genPath}
            fill="none"
            stroke={themeColor}
            strokeWidth="3"
            filter="url(#glow)"
          />

          {/* Decision Engine Alert Indicators on Timeline */}
          {dData.map((d, i) => {
            if (d.curtailment_mw > 0) {
              return (
                <g key={`curtail_${i}`}>
                  <circle
                    cx={getX(i)}
                    cy={padding.top + 10}
                    r="4.5"
                    fill="#ef4444"
                    opacity="0.9"
                  />
                  <line
                    x1={getX(i)}
                    y1={padding.top + 15}
                    x2={getX(i)}
                    y2={padding.top + 22}
                    stroke="#ef4444"
                    strokeWidth="1.2"
                    opacity="0.5"
                  />
                </g>
              );
            } else if (d.peaker_backup_mw > 0 && i % (horizonHours === 72 ? 3 : 2) === 0) {
              return (
                <g key={`peaker_${i}`}>
                  <circle
                    cx={getX(i)}
                    cy={padding.top + 10}
                    r="4.5"
                    fill="#f97316"
                    opacity="0.9"
                  />
                </g>
              );
            }
            return null;
          })}

          {/* Hover Crosshair & Dots */}
          {hoverIndex !== null && (
            <g>
              <line
                x1={getX(hoverIndex)}
                y1={padding.top}
                x2={getX(hoverIndex)}
                y2={height - padding.bottom}
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <circle
                cx={getX(hoverIndex)}
                cy={getY(activeRecord?.generation?.total_p50_mw || 0)}
                r="5"
                fill={themeColor}
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Floating Telemetry Tooltip on Hover */}
        {hoverIndex !== null && activeRecord && (
          <div
            style={{
              position: 'absolute',
              top: '15px',
              right: '25px',
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(10px)',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
              fontSize: '0.78rem',
              color: '#f8fafc',
              minWidth: '240px',
              pointerEvents: 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
              <span style={{ fontWeight: '700', color: '#94a3b8' }}>Hour {hoverIndex + 1} ({activeRecord.timestamp.substring(11, 16)} UTC)</span>
              <span style={{ 
                color: activeDispatch?.status === 'OVER_GENERATION' ? '#ef4444' : activeDispatch?.status === 'UNDER_GENERATION' ? '#f59e0b' : '#10b981',
                fontWeight: '700'
              }}>
                {activeDispatch?.status || 'BALANCED'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div>
                <span style={{ color: '#94a3b8' }}>Scheduled (P50):</span>
                <div style={{ fontWeight: '700', color: themeColor, fontSize: '0.9rem' }}>
                  {activeRecord.generation?.total_p50_mw} MW
                </div>
              </div>

              <div>
                <span style={{ color: '#94a3b8' }}>P10–P90 Band:</span>
                <div style={{ fontWeight: '700', color: '#38bdf8' }}>
                  {activeRecord.generation?.p10_mw} – {activeRecord.generation?.p90_mw} MW
                </div>
              </div>

              <div>
                <span style={{ color: '#94a3b8' }}>Persistence Benchmark:</span>
                <div style={{ fontWeight: '700', color: '#94a3b8' }}>
                  {activeRecord.generation?.baseline_mw || 0} MW
                </div>
              </div>

              <div>
                <span style={{ color: '#94a3b8' }}>Regional Demand:</span>
                <div style={{ fontWeight: '700', color: '#c084fc' }}>
                  {activeDispatch?.demand_mw} MW
                </div>
              </div>
            </div>

            {activeDispatch?.bess_flow_mw !== 0 && (
              <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.72rem', color: '#34d399' }}>
                BESS: {activeDispatch.bess_flow_mw > 0 ? `Discharging +${activeDispatch.bess_flow_mw} MW` : `Charging ${activeDispatch.bess_flow_mw} MW`} (SoC: {activeDispatch.bess_soc_pct}%)
              </div>
            )}

            {activeDispatch?.curtailment_mw > 0 && (
              <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.72rem', color: '#f87171' }}>
                ⚠️ <strong>Curtailment Required:</strong> {activeDispatch.curtailment_mw} MW
              </div>
            )}

            {activeDispatch?.peaker_backup_mw > 0 && (
              <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(249, 115, 22, 0.2)', fontSize: '0.72rem', color: '#fb923c' }}>
                ⚡ <strong>Peaker Backup:</strong> {activeDispatch.peaker_backup_mw} MW
              </div>
            )}

            {activeDispatch?.recommendations?.[0]?.description && (
              <div style={{ marginTop: '6px', fontSize: '0.68rem', color: '#94a3b8', fontStyle: 'italic' }}>
                Action: {activeDispatch.recommendations[0].title}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', flexWrap: 'wrap', marginTop: '14px', fontSize: '0.75rem', color: '#94a3b8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '3px', background: themeColor, borderRadius: '2px' }}></span>
          <span>Forecast Point Schedule (P50)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '10px', background: 'rgba(14, 165, 233, 0.25)', border: `1px solid ${themeColor}`, borderRadius: '2px' }}></span>
          <span>Quantile Uncertainty Band (P10–P90)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '2px', borderTop: '2px dashed #94a3b8' }}></span>
          <span>Persistence Baseline Benchmark</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '2px', borderTop: '2px dashed #c084fc' }}></span>
          <span>Regional Grid Demand</span>
        </div>
      </div>

    </div>
  );
}
