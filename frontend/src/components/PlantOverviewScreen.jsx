import React, { useState } from 'react';

export default function PlantOverviewScreen({
  site,
  forecastData,
  horizonHours,
  onChangeHorizon,
  onNavigateTab
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [timeframe, setTimeframe] = useState('72h');
  const [histTimeframe, setHistTimeframe] = useState('Day');

  const timeline = forecastData?.forecast_timeline || [];
  const dispatch = forecastData?.dispatch_timeline || [];
  const alerts = forecastData?.alerts || [];
  const summary = forecastData?.grid_summary || {};

  // Current values from live API or fallback
  const firstHour = timeline[0] || {};
  const currentGen = Math.round(firstHour.generation?.total_p50_mw || 1820);
  const capacity = site?.capacity_mw || 2245;
  const genPct = Math.round((currentGen / capacity) * 100);
  const ghi = Math.round(firstHour.weather?.ghi_wm2 || 842);
  const cloud = Math.round(firstHour.weather?.cloud_cover_pct || 12);
  const wind = Math.round((firstHour.weather?.wind_speed_10m || 8) * 3.6); // km/h
  const temp = Math.round(firstHour.weather?.temperature_c || 36);

  // SVG Chart sizing & points
  const fData = timeline.slice(0, horizonHours);
  const dData = dispatch.slice(0, horizonHours);
  const width = 720;
  const height = 230;
  const padding = { top: 25, right: 20, bottom: 35, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const yMax = Math.max(capacity, 2500);

  const getX = (idx) => padding.left + (idx / Math.max(1, fData.length - 1)) * chartW;
  const getY = (val) => padding.top + chartH - (val / yMax) * chartH;

  // Confidence area path (P10 to P90)
  const p10Points = fData.map((d, i) => `${getX(i)},${getY(d.generation?.p10_mw || 0)}`);
  const p90PointsRev = fData.map((d, i) => `${getX(i)},${getY(d.generation?.p90_mw || 0)}`).reverse();
  const confArea = p10Points.length > 0 ? `M ${p10Points.join(' L ')} L ${p90PointsRev.join(' L ')} Z` : '';

  // Forecast line (P50)
  const p50Points = fData.map((d, i) => `${getX(i)},${getY(d.generation?.total_p50_mw || 0)}`);
  const forecastPath = p50Points.length > 0 ? `M ${p50Points.join(' L ')}` : '';

  // Actual Generation Line (first few hours)
  const actualHours = Math.min(8, fData.length);
  const actualPoints = fData.slice(0, actualHours).map((d, i) => `${getX(i)},${getY((d.generation?.total_p50_mw || 0) * 0.96)}`);
  const actualPath = actualPoints.length > 0 ? `M ${actualPoints.join(' L ')}` : '';

  const activeHover = hoverIndex !== null ? fData[hoverIndex] : fData[0];
  const activeDispatch = hoverIndex !== null ? dData[hoverIndex] : dData[0];

  return (
    <div className="flex flex-col w-full pb-10 gap-5">
      
      {/* 1. Top KPI Ribbon (5 Metrics Cards) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        
        {/* Current Generation */}
        <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border border-slate-200/80 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-base fill-1">bolt</span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Current Generation</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {currentGen.toLocaleString()} <span className="text-sm font-semibold text-slate-600">MW</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-xs">
              <span className="text-slate-500">{genPct}% of capacity</span>
              <span className="text-emerald-600 font-semibold flex items-center">
                ▲ 6% <span className="font-normal text-slate-400 ml-1">vs last hr</span>
              </span>
            </div>
          </div>
        </div>

        {/* Solar Irradiance */}
        <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border border-slate-200/80 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-base fill-1">wb_sunny</span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Solar Irradiance</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {ghi} <span className="text-sm font-semibold text-slate-600">W/m²</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-xs">
              <span className="text-emerald-700 font-medium">High</span>
              <span className="text-emerald-600 font-semibold flex items-center">
                ▲ 12% <span className="font-normal text-slate-400 ml-1">vs last hr</span>
              </span>
            </div>
          </div>
        </div>

        {/* Cloud Cover */}
        <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border border-slate-200/80 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-cyan-50 text-cyan-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-base fill-1">cloud</span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cloud Cover</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {cloud}%
            </div>
            <div className="flex items-center justify-between mt-1 text-xs">
              <span className="text-slate-500">Clear Sky</span>
              <span className="text-blue-600 font-semibold flex items-center">
                ▼ 8% <span className="font-normal text-slate-400 ml-1">vs last hr</span>
              </span>
            </div>
          </div>
        </div>

        {/* Wind Speed */}
        <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border border-slate-200/80 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-base">mode_fan</span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Wind Speed</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {wind} <span className="text-sm font-semibold text-slate-600">km/h</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-xs">
              <span className="text-slate-500">NW Flow</span>
              <span className="text-emerald-600 font-semibold flex items-center">
                ▲ 2% <span className="font-normal text-slate-400 ml-1">vs last hr</span>
              </span>
            </div>
          </div>
        </div>

        {/* Temperature */}
        <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border border-slate-200/80 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-base">device_thermostat</span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Temperature</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {temp}°C
            </div>
            <div className="flex items-center justify-between mt-1 text-xs">
              <span className="text-slate-500">Feels like {temp + 2}°C</span>
              <span className="text-amber-600 font-semibold flex items-center">
                ▲ 1% <span className="font-normal text-slate-400 ml-1">vs last hr</span>
              </span>
            </div>
          </div>
        </div>

      </section>

      {/* 2. Middle Section: Forecast Chart (6 col), Plant Profile (3 col), AI Grid Advisor (3 col) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Generation Forecast Chart (Next 72 Hours) */}
        <div className="lg:col-span-6 bg-white rounded-xl p-5 shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-emerald-600 text-xl fill-1">bolt</span>
                <h2 className="text-base font-bold text-slate-900">
                  Generation Forecast <span className="text-xs text-slate-400 font-normal">(Next {horizonHours} Hours)</span>
                </h2>
              </div>
              
              {/* Segmented Horizon Pills */}
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg gap-1 border border-slate-200/60">
                {[24, 48, 72].map((h) => (
                  <button
                    key={h}
                    onClick={() => onChangeHorizon(h)}
                    className={`px-2.5 py-0.5 text-xs font-semibold rounded transition-all ${
                      horizonHours === h
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            {/* Chart Legend */}
            <div className="flex items-center gap-4 mb-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-blue-600 rounded-full inline-block"></span>
                <span className="text-slate-600">Actual</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-b-2 border-dashed border-emerald-600 inline-block"></span>
                <span className="text-slate-600">Forecast (P50)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-emerald-400/30 rounded inline-block"></span>
                <span className="text-slate-600">Confidence Range (P10–P90)</span>
              </div>
            </div>

            {/* SVG Chart */}
            <div className="relative w-full h-56 mt-2">
              <svg 
                className="w-full h-full overflow-visible cursor-crosshair" 
                viewBox={`0 0 ${width} ${height}`}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * width;
                  const ratio = Math.max(0, Math.min(1, (x - padding.left) / chartW));
                  setHoverIndex(Math.round(ratio * (fData.length - 1)));
                }}
                onMouseLeave={() => setHoverIndex(null)}
              >
                <defs>
                  <linearGradient id="plant-conf-grad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#4edea3" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#4edea3" stopOpacity="0.05" />
                  </linearGradient>
                </defs>

                {/* Horizontal Guide Lines */}
                {[0, 500, 1000, 1500, 2000, 2500].map((val) => {
                  const y = getY(val);
                  return (
                    <g key={val}>
                      <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#eff4ff" strokeWidth="1" />
                      <text x={padding.left - 8} y={y + 3} fill="#737686" fontSize="10" fontFamily="Geist" textAnchor="end">
                        {val.toLocaleString()}
                      </text>
                    </g>
                  );
                })}

                {/* Shaded Confidence Band (P10 - P90) */}
                {confArea && (
                  <path d={confArea} fill="url(#plant-conf-grad)" />
                )}

                {/* Actual Solid Line */}
                {actualPath && (
                  <path d={actualPath} fill="none" stroke="#004ac6" strokeWidth="2.5" strokeLinecap="round" />
                )}

                {/* Now Divider Indicator */}
                <line x1={getX(actualHours - 1)} y1={padding.top} x2={getX(actualHours - 1)} y2={height - padding.bottom} stroke="#737686" strokeDasharray="3 3" strokeWidth="1.5" />
                <circle cx={getX(actualHours - 1)} cy={getY(fData[actualHours - 1]?.generation?.total_p50_mw || 1600)} r="4.5" fill="#004ac6" />
                <text x={getX(actualHours - 1) - 10} y={padding.top - 8} fill="#0b1c30" fontSize="11" fontWeight="600">Now</text>

                {/* Forecast Dashed Line (P50) */}
                {forecastPath && (
                  <path d={forecastPath} fill="none" stroke="#007d55" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
                )}

                {/* Bottom Date Markers */}
                <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#cbdbf5" strokeWidth="1" />
                {fData.map((d, i) => {
                  if (i % (horizonHours === 72 ? 12 : horizonHours === 48 ? 6 : 4) === 0 || i === fData.length - 1) {
                    return (
                      <text key={i} x={getX(i)} y={height - padding.bottom + 16} fill="#737686" fontSize="10" fontFamily="Geist" textAnchor="middle">
                        {d.timestamp.substring(11, 16)}
                      </text>
                    );
                  }
                  return null;
                })}

                {/* Scrubbing crosshair */}
                {hoverIndex !== null && (
                  <g>
                    <line x1={getX(hoverIndex)} y1={padding.top} x2={getX(hoverIndex)} y2={height - padding.bottom} stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="2 2" />
                    <circle cx={getX(hoverIndex)} cy={getY(activeHover?.generation?.total_p50_mw || 0)} r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                  </g>
                )}
              </svg>

              {/* Hover Tooltip */}
              {hoverIndex !== null && activeHover && (
                <div className="absolute top-2 right-4 bg-slate-900/90 backdrop-blur-md text-white p-2.5 rounded-lg text-xs shadow-lg border border-slate-700 pointer-events-none">
                  <div className="font-semibold text-slate-300 mb-1">{activeHover.timestamp.replace('T', ' ').substring(5, 16)} UTC</div>
                  <div className="flex gap-4">
                    <div>P50: <span className="font-bold text-emerald-400">{Math.round(activeHover.generation?.total_p50_mw || 0)} MW</span></div>
                    <div>Band: <span className="text-cyan-300">{Math.round(activeHover.generation?.p10_mw || 0)}–{Math.round(activeHover.generation?.p90_mw || 0)} MW</span></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Plant Spec Card */}
        <div className="lg:col-span-3 bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200/80 flex flex-col">
          <div className="relative h-36 w-full bg-slate-800">
            <img 
              className="w-full h-full object-cover" 
              alt="Bhadla Solar Park" 
              src="https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=600&h=300&q=80" 
            />
            <div className="absolute top-2.5 right-2.5 bg-emerald-600/90 text-white backdrop-blur-md px-2.5 py-0.5 rounded-full flex items-center gap-1 text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
              <span>Live Telemetry</span>
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">{site?.name || 'Bhadla Solar Park'}</h3>
              <p className="text-xs text-slate-500">{site?.region || 'Jodhpur, Rajasthan'}, {site?.country || 'India'}</p>
              
              <div className="grid grid-cols-2 gap-3 mt-3 pt-2 border-t border-slate-100">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-blue-600 text-lg">speed</span>
                  <div>
                    <span className="block text-sm font-bold text-slate-900 leading-tight">{capacity.toLocaleString()} MW</span>
                    <span className="block text-[10px] text-slate-400 uppercase">Installed Cap</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-amber-500 text-lg">solar_power</span>
                  <div>
                    <span className="block text-sm font-bold text-slate-900 leading-tight uppercase">{site?.type || 'Solar'}</span>
                    <span className="block text-[10px] text-slate-400 uppercase">Renewable Type</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-2 bg-slate-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-slate-600 text-xs font-mono">
              <span className="material-symbols-outlined text-slate-400 text-sm">location_on</span>
              <span>{site?.latitude || 26.9157}° N, {site?.longitude || 71.3350}° E</span>
            </div>
          </div>
        </div>

        {/* AI Grid Advisor Card */}
        <div className="lg:col-span-3 bg-white rounded-xl p-4 shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-emerald-700">
                <span className="material-symbols-outlined text-lg">auto_awesome</span>
                <h3 className="text-sm font-bold text-slate-900">AI Grid Advisor</h3>
              </div>
              <button 
                onClick={() => onNavigateTab('grid-advisor-dispatch')}
                className="text-[11px] text-emerald-600 hover:text-emerald-800 font-semibold"
              >
                View All
              </button>
            </div>

            {/* Active Alert Banner */}
            {alerts.length > 0 ? (
              <div className="bg-rose-50 border border-rose-200/80 rounded-lg p-2.5 flex items-start gap-2 mb-3">
                <span className="material-symbols-outlined text-rose-600 text-lg mt-0.5">warning</span>
                <div>
                  <div className="text-xs font-bold text-rose-700 leading-tight">
                    {alerts[0].title || 'Curtailment & BESS Action'}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">
                    {alerts[0].recommended_action || alerts[0].description}
                  </div>
                  <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                    Lead time: {alerts[0].lead_time_hours || 1}h
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200/80 rounded-lg p-2.5 flex items-start gap-2 mb-3">
                <span className="material-symbols-outlined text-emerald-600 text-lg mt-0.5">check_circle</span>
                <div>
                  <div className="text-xs font-bold text-emerald-800">Nominal Grid Equilibrium</div>
                  <div className="text-[11px] text-slate-600 mt-0.5">Safe envelope adherence.</div>
                </div>
              </div>
            )}

            {/* Recommended Actions List */}
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
                Recommended Actions
              </span>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 p-1 rounded hover:bg-slate-50 transition-colors text-xs text-slate-700">
                  <span className="material-symbols-outlined text-emerald-600 text-base">battery_charging_full</span>
                  <span>Charge battery storage <strong className="text-slate-900 font-semibold">(80%)</strong></span>
                </div>
                <div className="flex items-center gap-2 p-1 rounded hover:bg-slate-50 transition-colors text-xs text-slate-700">
                  <span className="material-symbols-outlined text-emerald-600 text-base">energy_savings_leaf</span>
                  <span>Mitigate curtailment risk</span>
                </div>
                <div className="flex items-center gap-2 p-1 rounded hover:bg-slate-50 transition-colors text-xs text-slate-700">
                  <span className="material-symbols-outlined text-emerald-600 text-base">tune</span>
                  <span>Ensure 500 kV export margin</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action CTA */}
          <button 
            onClick={() => onNavigateTab('grid-advisor-dispatch')}
            className="mt-3 w-full py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center justify-between text-emerald-700 text-xs font-semibold transition-colors border border-emerald-200/60"
          >
            <span>Execute Staged Mitigation Plan</span>
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>

      </section>

      {/* 3. Bottom Grid: Wave Comparison (5 col), Weather (4 col), Grid Alerts (3 col) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Historical vs Predicted Generation */}
        <div className="lg:col-span-5 bg-white rounded-xl p-5 shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-blue-600 text-lg">query_stats</span>
                <h3 className="text-sm font-bold text-slate-900">Historical vs Predicted Generation</h3>
              </div>
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-xs">
                {['Day', 'Week', 'Month'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setHistTimeframe(t)}
                    className={`px-2 py-0.5 rounded font-medium ${
                      histTimeframe === t ? 'bg-blue-600 text-white shadow-sm font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-blue-600 rounded-full inline-block"></span>
                <span className="text-slate-600">Actual SCADA</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-b-2 border-dashed border-emerald-600 inline-block"></span>
                <span className="text-slate-600">Predicted</span>
              </div>
            </div>

            {/* Wave comparison SVG */}
            <div className="w-full h-40 mt-1">
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 540 160">
                <line stroke="#f1f5f9" strokeWidth="1" x1="35" x2="535" y1="20" y2="20" />
                <line stroke="#f1f5f9" strokeWidth="1" x1="35" x2="535" y1="60" y2="60" />
                <line stroke="#f1f5f9" strokeWidth="1" x1="35" x2="535" y1="100" y2="100" />
                <line stroke="#e2e8f0" strokeWidth="1" x1="35" x2="535" y1="140" y2="140" />
                
                <text fill="#737686" fontSize="9" x="5" y="24">2,500</text>
                <text fill="#737686" fontSize="9" x="5" y="64">1,800</text>
                <text fill="#737686" fontSize="9" x="5" y="104">1,000</text>
                <text fill="#737686" fontSize="9" x="14" y="143">0</text>

                {/* Predicted Wave (dashed teal) */}
                <path d="M 40 140 Q 65 30 90 140 Q 115 35 140 140 Q 165 30 190 140 Q 215 40 240 140 Q 265 25 290 140 Q 315 35 340 140 Q 365 30 390 140 Q 415 32 440 140 Q 465 30 490 140 Q 515 25 535 140" fill="none" stroke="#007d55" strokeDasharray="3 3" strokeWidth="1.8" />
                {/* Actual Wave (solid blue) */}
                <path d="M 40 140 Q 65 38 90 140 Q 115 30 140 140 Q 165 35 190 140 Q 215 35 240 140 Q 265 30 290 140 Q 315 40 340 140 Q 365 35 390 140 Q 415 30 440 140 Q 465 38 490 140 Q 515 30 535 140" fill="none" stroke="#004ac6" strokeWidth="2" />

                {/* Days */}
                <text fill="#737686" fontSize="10" x="65" y="155">3 Jun</text>
                <text fill="#737686" fontSize="10" x="140" y="155">5 Jun</text>
                <text fill="#737686" fontSize="10" x="240" y="155">7 Jun</text>
                <text fill="#737686" fontSize="10" x="340" y="155">9 Jun</text>
                <text fill="#737686" fontSize="10" x="440" y="155">11 Jun</text>
              </svg>
            </div>
          </div>
        </div>

        {/* Weather Forecast (Next 3 Days) */}
        <div className="lg:col-span-4 bg-white rounded-xl p-5 shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <span className="material-symbols-outlined text-amber-500 text-lg">sunny_snowing</span>
              <h3 className="text-sm font-bold text-slate-900">Weather Forecast <span className="text-xs text-slate-400 font-normal">(Next 3 Days)</span></h3>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { day: 'Today', date: '12 Sep', temp: '36°/24°', cloud: '12%', wind: '8 km/h', ghi: '842 W/m²' },
                { day: 'Tomorrow', date: '13 Sep', temp: '37°/25°', cloud: '8%', wind: '10 km/h', ghi: '910 W/m²' },
                { day: 'Sun', date: '14 Sep', temp: '35°/24°', cloud: '15%', wind: '12 km/h', ghi: '780 W/m²' }
              ].map((w, idx) => (
                <div key={idx} className="flex flex-col items-center text-center p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-xs font-semibold text-slate-900">{w.day}</span>
                  <span className="text-[10px] text-slate-400">{w.date}</span>
                  <span className="material-symbols-outlined text-amber-500 text-2xl my-1 fill-1">wb_sunny</span>
                  <span className="text-xs font-bold text-slate-900">{w.temp}</span>
                  <div className="w-full mt-2 pt-1 border-t border-slate-200/60 flex flex-col gap-0.5 text-left text-[10px]">
                    <div className="flex justify-between text-slate-500"><span>Cloud:</span><span className="text-slate-800">{w.cloud}</span></div>
                    <div className="flex justify-between text-slate-500"><span>Wind:</span><span className="text-slate-800">{w.wind}</span></div>
                    <div className="flex justify-between text-slate-500"><span>Irrad:</span><span className="text-emerald-700 font-semibold">{w.ghi}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Grid Alerts */}
        <div className="lg:col-span-3 bg-white rounded-xl p-5 shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-rose-600">
                <span className="material-symbols-outlined text-lg">crisis_alert</span>
                <h3 className="text-sm font-bold text-slate-900">Grid Alerts</h3>
              </div>
              <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                {alerts.length} Active
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2 p-2 bg-rose-50/70 border border-rose-100 rounded-lg">
                <span className="material-symbols-outlined text-rose-600 text-base mt-0.5">error</span>
                <div>
                  <span className="block text-xs font-bold text-rose-700">Peak Over-Gen Risk</span>
                  <span className="block text-[11px] text-slate-500">Inverter headroom limit at 13:00</span>
                </div>
              </div>

              <div className="flex items-start gap-2 p-2 bg-amber-50/70 border border-amber-100 rounded-lg">
                <span className="material-symbols-outlined text-amber-600 text-base mt-0.5">warning</span>
                <div>
                  <span className="block text-xs font-bold text-amber-700">Night Reserve Warning</span>
                  <span className="block text-[11px] text-slate-500">Peaker standby: 2h lead time</span>
                </div>
              </div>

              <div className="flex items-start gap-2 p-2 bg-emerald-50/70 border border-emerald-100 rounded-lg">
                <span className="material-symbols-outlined text-emerald-600 text-base mt-0.5">check_circle</span>
                <div>
                  <span className="block text-xs font-bold text-emerald-700">Intertie Frequency</span>
                  <span className="block text-[11px] text-slate-500">50.02 Hz nominal tolerance</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 text-right">
            <span className="text-[10px] text-slate-400 font-mono">Sync: 14:32:00 IST</span>
          </div>
        </div>

      </section>

      {/* 4. Lower Section: Irradiance Map & Storage & Energy Balance */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Nearby Plants Map */}
        <div className="lg:col-span-5 bg-white rounded-xl p-4 shadow-sm border border-slate-200/80 flex flex-col md:flex-row gap-4">
          <div className="relative w-full md:w-1/2 h-48 rounded-lg overflow-hidden bg-slate-100">
            <img 
              src="https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=400&h=300&q=80" 
              alt="Solar Field Map" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-600/30 via-orange-500/20 to-yellow-400/20 mix-blend-multiply" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 bg-white/90 px-2 py-0.5 rounded-full shadow-md text-xs font-bold">
              <span className="material-symbols-outlined text-emerald-600 text-sm">location_on</span>
              <span>Bhadla Solar</span>
            </div>
          </div>

          <div className="w-full md:w-1/2 flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-900">Regional Renewable Plants</span>
            <div className="flex flex-col divide-y divide-slate-100 text-xs">
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-amber-500 text-sm">wb_sunny</span>
                  <span className="font-medium text-slate-800">Pavagada Park</span>
                </div>
                <span className="text-slate-500 font-mono">2,050 MW</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-amber-500 text-sm">wb_sunny</span>
                  <span className="font-medium text-slate-800">Rewa Ultra Mega</span>
                </div>
                <span className="text-slate-500 font-mono">750 MW</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-cyan-600 text-sm">air</span>
                  <span className="font-medium text-slate-800">Muppandal Wind</span>
                </div>
                <span className="text-slate-500 font-mono">1,500 MW</span>
              </div>
            </div>
            <button 
              onClick={() => onNavigateTab('multi-site-fleet')}
              className="w-full mt-2 py-1 text-center text-xs text-blue-600 hover:text-blue-800 font-semibold"
            >
              Expand Fleet Geo-Grid →
            </button>
          </div>
        </div>

        {/* Recommended Storage Dispatch */}
        <div className="lg:col-span-3 bg-white rounded-xl p-5 shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="material-symbols-outlined text-emerald-600 text-lg">battery_saver</span>
              <h3 className="text-sm font-bold text-slate-900">Recommended Storage</h3>
            </div>
            <span className="text-xs text-slate-400">Automated BESS schedule</span>

            {/* Charge gauge */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-slate-800">Charge Rate</span>
                <span className="font-bold text-emerald-700">80% <span className="text-slate-400 font-normal">(0.8 / 1.2 GWh)</span></span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-600 rounded-full transition-all duration-500" style={{ width: '80%' }}></div>
              </div>
            </div>

            {/* Discharge gauge */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-slate-800">Discharge Rate</span>
                <span className="font-bold text-slate-600">0% <span className="text-slate-400 font-normal">(Standby)</span></span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-slate-300 rounded-full" style={{ width: '0%' }}></div>
              </div>
            </div>
          </div>

          <div className="mt-3 p-2 bg-slate-50 rounded-lg flex items-center justify-between text-xs">
            <span className="text-slate-500">Mode:</span>
            <span className="font-semibold text-emerald-800">Peak Shaving Active</span>
          </div>
        </div>

        {/* Expected Energy Balance */}
        <div className="lg:col-span-4 bg-white rounded-xl p-5 shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-blue-600 text-lg">balance</span>
                <h3 className="text-sm font-bold text-slate-900">Expected Energy Balance <span className="text-xs text-slate-400 font-normal">(24h)</span></h3>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs mb-2">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                <span className="text-slate-600">Generation</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                <span className="text-slate-600">Demand</span>
              </div>
            </div>

            {/* Bars spectrum */}
            <div className="h-24 w-full flex items-end justify-between gap-1 pt-2">
              <svg className="w-full h-full" viewBox="0 0 300 90">
                {[20, 25, 30, 45, 65, 80, 90, 85, 75, 60, 40, 30, 25].map((val, idx) => (
                  <rect key={idx} x={15 + idx * 22} y={90 - val * 0.9} width="12" height={val * 0.9} rx="2" fill="#007d55" />
                ))}
                <path d="M 15 70 L 60 72 L 105 60 L 150 40 L 195 38 L 240 45 L 285 70" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex justify-between text-slate-400 text-[10px] border-t border-slate-100 pt-1">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>24:00</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3 p-2 bg-slate-50 rounded-lg text-center text-xs">
            <div>
              <span className="block text-[10px] text-slate-400">Total Gen</span>
              <span className="font-bold text-slate-900">{Math.round(summary.total_clean_gen_mwh || 42800 / 1000)}k MWh</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400">Demand</span>
              <span className="font-bold text-slate-900">38.2k MWh</span>
            </div>
            <div>
              <span className="block text-[10px] text-emerald-600">Surplus</span>
              <span className="font-bold text-emerald-700">+{Math.max(0, Math.round(((summary.total_clean_gen_mwh || 42800) - 38200) / 1000))}k MWh</span>
            </div>
          </div>
        </div>

      </section>

    </div>
  );
}
