import React, { useState, useRef } from 'react';
import { Eye, EyeOff, CloudRain, Sun, Wind, Activity } from 'lucide-react';

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
  const [showWeather, setShowWeather] = useState(false);
  const svgRef = useRef(null);

  // Slice according to selected horizon
  const fData = (forecastTimeline || []).slice(0, horizonHours);
  const dData = (dispatchTimeline || []).slice(0, horizonHours);

  if (!fData || fData.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        No telemetry stream available for selected horizon.
      </div>
    );
  }

  // Chart dimensions & coordinates
  const width = 1000;
  const height = 360;
  const padding = { top: 25, right: 40, bottom: 45, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Compute scale maximums
  const capacityMw = site?.capacity_mw || 1000;
  const maxGen = Math.max(
    ...fData.map(d => Math.max(d.generation.p90_mw || 0, d.generation.total_p50_mw || 0)),
    ...dData.map(d => d.demand_mw || 0),
    capacityMw * 0.8
  );
  const yMax = Math.ceil(maxGen * 1.15 / 100) * 100;

  // Max for weather overlay (either GHI wm2 or wind speed 100m)
  const isSolar = site?.type === 'solar';
  const weatherMax = isSolar ? 1100 : 25; // 1100 W/m2 or 25 m/s

  const getX = (idx) => padding.left + (idx / Math.max(1, fData.length - 1)) * chartWidth;
  const getY = (val) => padding.top + chartHeight - (val / yMax) * chartHeight;
  const getYWeather = (val) => padding.top + chartHeight - (val / weatherMax) * chartHeight;

  // Generate SVG paths
  // 1. Generation Curve (P50 or selected model)
  const genPoints = fData.map((d, i) => {
    let val = d.generation.total_p50_mw;
    if (activeModel === 'xgboost') val = d.model_breakdown.xgboost_mw;
    if (activeModel === 'lstm') val = d.model_breakdown.lstm_mw;
    if (activeModel === 'physics') val = d.model_breakdown.physics_mw;
    return `${getX(i)},${getY(val)}`;
  });
  const genPath = `M ${genPoints.join(' L ')}`;

  // 2. Confidence Area (P10 to P90)
  const p10Points = fData.map((d, i) => `${getX(i)},${getY(d.generation.p10_mw || 0)}`);
  const p90PointsRev = fData.map((d, i) => `${getX(i)},${getY(d.generation.p90_mw || 0)}`).reverse();
  const confidenceAreaPath = `M ${p10Points.join(' L ')} L ${p90PointsRev.join(' L ')} Z`;

  // 3. Demand Curve
  const demandPoints = dData.map((d, i) => `${getX(i)},${getY(d.demand_mw || 0)}`);
  const demandPath = `M ${demandPoints.join(' L ')}`;

  // 4. Weather Curve
  const weatherPoints = fData.map((d, i) => {
    const val = isSolar ? d.weather.ghi_wm2 : d.weather.wind_speed_100m;
    return `${getX(i)},${getYWeather(val)}`;
  });
  const weatherPath = `M ${weatherPoints.join(' L ')}`;

  // Hover interaction
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
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 8px', borderRadius: '4px' }}>
              {horizonHours}H Window • Model: {activeModel.toUpperCase()}
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Hourly generation forecast with P10/P90 confidence interval, regional demand matching, and BESS dispatch.
          </p>
        </div>

        {/* Visibility Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowConfidence(!showConfidence)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: showConfidence ? 'rgba(6, 182, 212, 0.15)' : 'rgba(30, 41, 59, 0.4)',
              color: showConfidence ? '#22d3ee' : '#64748b',
              fontSize: '0.75rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {showConfidence ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>P10–P90 Confidence</span>
          </button>

          <button
            onClick={() => setShowDemand(!showDemand)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: showDemand ? 'rgba(168, 85, 247, 0.15)' : 'rgba(30, 41, 59, 0.4)',
              color: showDemand ? '#c084fc' : '#64748b',
              fontSize: '0.75rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {showDemand ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>Regional Demand</span>
          </button>

          <button
            onClick={() => setShowWeather(!showWeather)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: showWeather ? 'rgba(234, 179, 8, 0.15)' : 'rgba(30, 41, 59, 0.4)',
              color: showWeather ? '#facc15' : '#64748b',
              fontSize: '0.75rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {isSolar ? <Sun size={14} /> : <Wind size={14} />}
            <span>{isSolar ? 'Solar GHI' : 'Wind Speed (100m)'}</span>
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
            {/* Generation line glow */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={themeColor} floodOpacity="0.6" />
            </filter>

            {/* Confidence Area Gradient */}
            <linearGradient id="confidenceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={themeColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={themeColor} stopOpacity="0.03" />
            </linearGradient>

            {/* Generation Area Gradient */}
            <linearGradient id="genAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={themeColor} stopOpacity="0.2" />
              <stop offset="100%" stopColor={themeColor} stopOpacity="0.0" />
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
              {/* Point on Gen line */}
              <circle
                cx={getX(hoverIndex)}
                cy={getY(activeRecord?.generation?.total_p50_mw || 0)}
                r="5"
                fill={themeColor}
                stroke="#ffffff"
                strokeWidth="2"
              />
              {/* Point on Demand line */}
              {showDemand && activeDispatch && (
                <circle
                  cx={getX(hoverIndex)}
                  cy={getY(activeDispatch.demand_mw || 0)}
                  r="4"
                  fill="#c084fc"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              )}
            </g>
          )}
        </svg>

        {/* Floating Telemetry Tooltip on Hover */}
        {hoverIndex !== null && activeRecord && (
          <div
            className="glass-panel"
            style={{
              position: 'absolute',
              top: '15px',
              left: `${Math.min(78, Math.max(12, (getX(hoverIndex) / width) * 100))}%`,
              transform: 'translateX(-50%)',
              padding: '12px 16px',
              pointerEvents: 'none',
              minWidth: '220px',
              zIndex: 30,
              background: 'rgba(15, 23, 42, 0.92)',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(148, 163, 184, 0.15)', paddingBottom: '6px', marginBottom: '8px' }}>
              <span className="mono-num" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#f8fafc' }}>
                {activeRecord.timestamp.replace('T', ' ').replace('Z', ' UTC')}
              </span>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: '700',
                padding: '2px 6px',
                borderRadius: '4px',
                background: activeDispatch?.status === 'OVER_GENERATION' ? 'rgba(245, 158, 11, 0.2)' : activeDispatch?.status === 'UNDER_GENERATION' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                color: activeDispatch?.status === 'OVER_GENERATION' ? '#fbbf24' : activeDispatch?.status === 'UNDER_GENERATION' ? '#f87171' : '#34d399'
              }}>
                {activeDispatch?.status || 'BALANCED'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: themeColor, fontWeight: '600' }}>Forecast (P50):</span>
                <span className="mono-num" style={{ color: '#ffffff', fontWeight: '700' }}>{activeRecord.generation.total_p50_mw} MW</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                <span>Uncertainty (P10–P90):</span>
                <span className="mono-num">{activeRecord.generation.p10_mw} – {activeRecord.generation.p90_mw} MW</span>
              </div>
              {showDemand && activeDispatch && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c084fc' }}>
                  <span>Regional Demand:</span>
                  <span className="mono-num">{activeDispatch.demand_mw} MW</span>
                </div>
              )}
              {activeDispatch && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: activeDispatch.net_load_mw < 0 ? '#34d399' : '#f87171' }}>
                  <span>Net Position:</span>
                  <span className="mono-num">{activeDispatch.net_load_mw < 0 ? `+${Math.abs(activeDispatch.net_load_mw)} MW Surplus` : `-${activeDispatch.net_load_mw} MW Deficit`}</span>
                </div>
              )}
              {activeDispatch?.bess_flow_mw !== 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8' }}>
                  <span>BESS Flow:</span>
                  <span className="mono-num">{activeDispatch.bess_flow_mw < 0 ? `Charging ${Math.abs(activeDispatch.bess_flow_mw)} MW` : `Discharging ${activeDispatch.bess_flow_mw} MW`}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', borderTop: '1px solid rgba(148, 163, 184, 0.1)', paddingTop: '4px', marginTop: '2px' }}>
                <span>Weather:</span>
                <span>{activeRecord.weather.temperature_c}°C • Cloud {activeRecord.weather.cloud_cover_pct}% {isSolar ? `• GHI ${activeRecord.weather.ghi_wm2} W/m²` : `• Wind ${activeRecord.weather.wind_speed_100m} m/s`}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '20px', marginTop: '14px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '3px', background: themeColor, borderRadius: '2px' }}></span>
          <span style={{ color: '#f8fafc', fontWeight: '600' }}>Renewable Generation Forecast (P50)</span>
        </div>
        {showConfidence && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '8px', background: 'rgba(6, 182, 212, 0.3)', borderRadius: '2px', border: '1px solid var(--border-subtle)' }}></span>
            <span>P10–P90 Uncertainty Envelope</span>
          </div>
        )}
        {showDemand && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '2px', background: '#c084fc', borderTop: '2px dashed #c084fc' }}></span>
            <span style={{ color: '#c084fc' }}>Regional Scheduled Demand</span>
          </div>
        )}
        {showWeather && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '2px', background: '#facc15', borderTop: '2px dotted #facc15' }}></span>
            <span style={{ color: '#facc15' }}>{isSolar ? 'Global Horizontal Irradiance (GHI)' : 'Hub-Height Wind Speed (100m)'}</span>
          </div>
        )}
      </div>

    </div>
  );
}
