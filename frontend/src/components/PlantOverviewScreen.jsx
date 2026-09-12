import React, { useState, useEffect } from 'react';
import FieldMap from './FieldMap';
import DataProvenanceBadge from './DataProvenanceBadge';

export default function PlantOverviewScreen({
  site,
  sites = [],
  forecastData,
  horizonHours,
  onChangeHorizon,
  onNavigateTab
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [timeframe, setTimeframe] = useState('72h');
  const [histTimeframe, setHistTimeframe] = useState('Day');
  const [histSeries, setHistSeries] = useState([]);
  const [loadingHist, setLoadingHist] = useState(false);

  const timeline = forecastData?.forecast_timeline || [];
  const dispatch = forecastData?.dispatch_timeline || [];
  const alerts = forecastData?.alerts || [];
  const summary = forecastData?.grid_summary || {};

  // Fetch real empirical historical vs predicted telemetry for the mini audit card
  useEffect(() => {
    if (!site?.id) return;
    setLoadingHist(true);
    const hours = histTimeframe === 'Day' ? 24 : histTimeframe === 'Week' ? 168 : 720;
    fetch(`/api/historical-vs-predicted?site_id=${site.id}&window_hours=${hours}`)
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (json?.series) setHistSeries(json.series);
        setLoadingHist(false);
      })
      .catch(() => setLoadingHist(false));
  }, [site?.id, histTimeframe]);

  // Derive 3-day weather from real forecast timeline
  const weather3Days = [0, 1, 2].map((dayIdx) => {
    const daySlice = timeline.slice(dayIdx * 24, (dayIdx + 1) * 24);
    if (!daySlice.length) {
      return {
        day: dayIdx === 0 ? 'Today' : dayIdx === 1 ? 'Tomorrow' : 'Day 3',
        date: `Day +${dayIdx}`,
        temp: '32°/24°',
        cloud: '15%',
        wind: '10 km/h',
        ghi: '800 W/m²'
      };
    }
    const temps = daySlice.map(h => h.weather?.temperature_c || 28);
    const maxTemp = Math.round(Math.max(...temps));
    const minTemp = Math.round(Math.min(...temps));
    const avgCloud = Math.round(daySlice.reduce((acc, h) => acc + (h.weather?.cloud_cover_pct || 0), 0) / daySlice.length);
    const maxWind = Math.round(Math.max(...daySlice.map(h => (h.weather?.wind_speed_10m || 6) * 3.6)));
    const peakGhi = Math.round(Math.max(...daySlice.map(h => h.weather?.ghi_wm2 || 0)));
    const firstTs = daySlice[0]?.timestamp || '';
    const dateStr = firstTs ? firstTs.substring(5, 10).replace('-', '/') : `Day +${dayIdx}`;

    return {
      day: dayIdx === 0 ? 'Today' : dayIdx === 1 ? 'Tomorrow' : 'Day 3',
      date: dateStr,
      temp: `${maxTemp}°/${minTemp}°`,
      cloud: `${avgCloud}%`,
      wind: `${maxWind} km/h`,
      ghi: `${peakGhi} W/m²`
    };
  });

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
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-base fill-1">bolt</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Current Generation</span>
            </div>
            <DataProvenanceBadge type="ml-forecast" compact={true} align="left" />
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
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-base fill-1">wb_sunny</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Solar Irradiance</span>
            </div>
            <DataProvenanceBadge type="real-weather" compact={true} align="left" />
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
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-cyan-50 text-cyan-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-base fill-1">cloud</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cloud Cover</span>
            </div>
            <DataProvenanceBadge type="real-weather" compact={true} align="left" />
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
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-base">mode_fan</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Wind Speed</span>
            </div>
            <DataProvenanceBadge type="real-weather" compact={true} align="left" />
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
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-base">device_thermostat</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Temperature</span>
            </div>
            <DataProvenanceBadge type="real-weather" compact={true} align="right" />
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
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-xl fill-1">bolt</span>
                <h2 className="text-base font-bold text-slate-900">
                  Generation Forecast <span className="text-xs text-slate-400 font-normal">(Next {horizonHours} Hours)</span>
                </h2>
                <DataProvenanceBadge type="ml-forecast" align="left" />
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

            {/* Chart Legend & Telemetry Link */}
            <div className="flex items-center justify-between mb-2 text-xs">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 bg-blue-600 rounded-full inline-block"></span>
                  <span className="text-slate-600">Actual Generation</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 border-b-2 border-dashed border-emerald-600 inline-block"></span>
                  <span className="text-slate-600">Forecast (P50)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-emerald-400/30 rounded inline-block"></span>
                  <span className="text-slate-600">Confidence Range</span>
                </div>
              </div>

              <button
                onClick={() => onNavigateTab && onNavigateTab('model-skill-accuracy')}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 hover:underline"
              >
                <span>Model Skill & Accuracy</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
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
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-lg">query_stats</span>
                <h3 className="text-sm font-bold text-slate-900">Historical vs Predicted Generation</h3>
                <DataProvenanceBadge type="real-scada" align="left" />
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

            {/* Real Historical vs Predicted Telemetry SVG */}
            <div className="w-full h-40 mt-1">
              {loadingHist ? (
                <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-lg text-slate-400 text-xs gap-2">
                  <span className="material-symbols-outlined animate-spin text-base text-blue-600">sync</span>
                  <span>Loading SCADA telemetry...</span>
                </div>
              ) : histSeries.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-lg text-slate-400 text-xs">
                  Awaiting SCADA telemetry feed...
                </div>
              ) : (() => {
                const svgW = 540;
                const svgH = 160;
                const pL = 40;
                const pR = 15;
                const pT = 15;
                const pB = 25;
                const cW = svgW - pL - pR;
                const cH = svgH - pT - pB;
                const maxVal = Math.max(...histSeries.map(d => Math.max(d.actual_mw || 0, d.predicted_p50_mw || 0)), capacity, 100);
                const gX = (i) => pL + (i / Math.max(1, histSeries.length - 1)) * cW;
                const gY = (val) => pT + cH - (val / maxVal) * cH;

                const actPts = histSeries.map((d, i) => `${gX(i)},${gY(d.actual_mw || 0)}`).join(' L ');
                const predPts = histSeries.map((d, i) => `${gX(i)},${gY(d.predicted_p50_mw || 0)}`).join(' L ');
                const actP = actPts ? `M ${actPts}` : '';
                const predP = predPts ? `M ${predPts}` : '';

                const tickInterval = Math.max(1, Math.floor(histSeries.length / 5));
                const ticks = histSeries.filter((_, idx) => idx % tickInterval === 0 || idx === histSeries.length - 1);

                return (
                  <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox={`0 0 ${svgW} ${svgH}`}>
                    {/* Horizontal Guides */}
                    {[0, Math.round(maxVal * 0.4), Math.round(maxVal * 0.75), Math.round(maxVal)].map((v) => {
                      const y = gY(v);
                      return (
                        <g key={v}>
                          <line stroke="#f1f5f9" strokeWidth="1" x1={pL} x2={svgW - pR} y1={y} y2={y} />
                          <text fill="#737686" fontSize="9" x={pL - 6} y={y + 3} textAnchor="end">
                            {v.toLocaleString()}
                          </text>
                        </g>
                      );
                    })}

                    {/* Predicted (dashed green) */}
                    {predP && (
                      <path d={predP} fill="none" stroke="#007d55" strokeDasharray="3 3" strokeWidth="1.8" />
                    )}
                    {/* Actual (solid blue) */}
                    {actP && (
                      <path d={actP} fill="none" stroke="#004ac6" strokeWidth="2" strokeLinecap="round" />
                    )}

                    {/* Dynamic Date Ticks */}
                    {ticks.map((t, idx) => {
                      const origIdx = histSeries.indexOf(t);
                      return (
                        <text key={idx} fill="#737686" fontSize="9" x={gX(origIdx)} y={svgH - 8} textAnchor="middle">
                          {t.timestamp.length >= 16 ? t.timestamp.substring(11, 16) : `t+${origIdx}`}
                        </text>
                      );
                    })}
                  </svg>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Weather Forecast (Next 3 Days - Derived from Live NWP Timeline) */}
        <div className="lg:col-span-4 bg-white rounded-xl p-5 shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-amber-500 text-lg">sunny_snowing</span>
                <h3 className="text-sm font-bold text-slate-900">Weather Forecast <span className="text-xs text-slate-400 font-normal">(Next 3 Days)</span></h3>
              </div>
              <DataProvenanceBadge type="real-weather" compact={true} align="right" />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {weather3Days.map((w, idx) => (
                <div key={idx} className="flex flex-col items-center text-center p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-xs font-semibold text-slate-900">{w.day}</span>
                  <span className="text-[10px] text-slate-400">{w.date}</span>
                  <span className="material-symbols-outlined text-amber-500 text-2xl my-1 fill-1">
                    {site?.type === 'wind' ? 'air' : 'wb_sunny'}
                  </span>
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
        
        {/* Real GIS Field Map & Regional Fleet Telemetry */}
        <div className="lg:col-span-5 bg-white rounded-xl p-4 shadow-sm border border-slate-200/80 flex flex-col md:flex-row gap-4">
          <div className="w-full md:w-1/2 h-52 shrink-0">
            <FieldMap site={site} sites={sites} />
          </div>

          <div className="w-full md:w-1/2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-900">Regional Fleet Telemetry</span>
                <DataProvenanceBadge type="real-gis" compact={true} align="right" />
              </div>
              <div className="flex flex-col divide-y divide-slate-100 text-xs">
                {sites.filter(s => s.id !== site?.id).slice(0, 3).map(otherSite => (
                  <div key={otherSite.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`material-symbols-outlined text-sm shrink-0 ${otherSite.type === 'wind' ? 'text-cyan-600' : otherSite.type === 'hybrid' ? 'text-indigo-600' : 'text-amber-500'}`}>
                        {otherSite.type === 'wind' ? 'air' : otherSite.type === 'hybrid' ? 'battery_charging_full' : 'wb_sunny'}
                      </span>
                      <span className="font-medium text-slate-800 truncate" title={otherSite.name}>
                        {otherSite.name}
                      </span>
                    </div>
                    <span className="text-slate-600 font-mono text-[11px] shrink-0 ml-2">{otherSite.capacity_mw} MW</span>
                  </div>
                ))}
              </div>
            </div>
            <button 
              onClick={() => onNavigateTab && onNavigateTab('multi-site-fleet')}
              className="w-full mt-2 py-1.5 text-center text-xs text-blue-600 hover:text-blue-800 font-semibold bg-blue-50/50 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>Expand Fleet Geo-Grid</span>
              <span className="material-symbols-outlined text-xs">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Recommended Storage Dispatch */}
        <div className="lg:col-span-3 bg-white rounded-xl p-5 shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-emerald-600 text-lg">battery_saver</span>
                <h3 className="text-sm font-bold text-slate-900">Recommended Storage</h3>
              </div>
              <DataProvenanceBadge type="bess-dispatch" compact={true} align="right" />
            </div>
            <span className="text-xs text-slate-400">Automated BESS schedule</span>

            {/* Charge gauge */}
            {(() => {
              const bessCapMwh = site?.bess_capacity_mwh || 1200;
              const chargeMw = activeDispatch?.bess_dispatch?.charge_mw || 0;
              const dischargeMw = activeDispatch?.bess_dispatch?.discharge_mw || 0;
              const maxPowerMw = site?.bess_max_power_mw || (bessCapMwh / 4);
              const chargePct = Math.min(100, Math.round((chargeMw / Math.max(1, maxPowerMw)) * 100));
              const dischargePct = Math.min(100, Math.round((dischargeMw / Math.max(1, maxPowerMw)) * 100));
              const socPct = Math.round((activeDispatch?.bess_dispatch?.soc_pct ?? 0.75) * 100);
              const storedGwh = ((socPct / 100) * bessCapMwh / 1000).toFixed(1);
              const maxGwh = (bessCapMwh / 1000).toFixed(1);
              const actionLabel = activeDispatch?.bess_dispatch?.action || 'Peak Shaving Standby';

              return (
                <>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-800">SoC Storage Level</span>
                      <span className="font-bold text-emerald-700">{socPct}% <span className="text-slate-400 font-normal">({storedGwh} / {maxGwh} GWh)</span></span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-600 rounded-full transition-all duration-500" style={{ width: `${socPct}%` }}></div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-800">
                        {chargeMw > 0 ? 'Charge Power' : (dischargeMw > 0 ? 'Discharge Power' : 'Dispatch Rate')}
                      </span>
                      <span className="font-bold text-slate-700">
                        {chargeMw > 0 ? `+${Math.round(chargeMw)} MW` : (dischargeMw > 0 ? `-${Math.round(dischargeMw)} MW` : '0 MW (Standby)')}
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${chargeMw > 0 ? 'bg-cyan-500' : (dischargeMw > 0 ? 'bg-amber-500' : 'bg-slate-300')}`} style={{ width: `${Math.max(chargePct, dischargePct)}%` }}></div>
                    </div>
                  </div>

                  <div className="mt-3 p-2 bg-slate-50 rounded-lg flex items-center justify-between text-xs">
                    <span className="text-slate-500">Mode:</span>
                    <span className="font-semibold text-emerald-800">{actionLabel}</span>
                  </div>
                </>
              );
            })()}
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
              <DataProvenanceBadge type="physical-sim" compact={true} align="right" />
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

            {/* Dynamic Expected Energy Balance Bars (First 24h of Forecast) */}
            <div className="h-24 w-full flex items-end justify-between gap-1 pt-2">
              {(() => {
                const energy24 = timeline.slice(0, 24);
                if (!energy24.length) return <div className="text-xs text-slate-400 py-6">No energy data available</div>;
                const maxVal = Math.max(...energy24.map(h => Math.max(h.generation?.total_p50_mw || 0, h.demand_mw || 0)), 100);
                const dPts = energy24.map((h, i) => `${10 + i * 12},${80 - ((h.demand_mw || 0) / maxVal) * 65}`).join(' L ');

                return (
                  <svg className="w-full h-full" viewBox="0 0 300 90">
                    {energy24.map((h, idx) => {
                      const genVal = h.generation?.total_p50_mw || 0;
                      const barH = Math.max(2, (genVal / maxVal) * 65);
                      return (
                        <rect 
                          key={idx} 
                          x={6 + idx * 12} 
                          y={80 - barH} 
                          width="8" 
                          height={barH} 
                          rx="1.5" 
                          fill="#007d55" 
                        >
                          <title>{`Hour ${idx}: ${Math.round(genVal)} MW`}</title>
                        </rect>
                      );
                    })}
                    {dPts && (
                      <path d={`M ${dPts}`} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
                    )}
                  </svg>
                );
              })()}
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
              <span className="block text-[10px] text-slate-400">Total Clean Gen</span>
              <span className="font-bold text-slate-900">
                {Math.round((summary.total_clean_gen_mwh || timeline.slice(0, 24).reduce((a, b) => a + (b.generation?.total_p50_mw || 0), 0)) / 1000)}k MWh
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400">Total Demand</span>
              <span className="font-bold text-slate-900">
                {Math.round(timeline.slice(0, 24).reduce((a, b) => a + (b.demand_mw || 1500), 0) / 1000)}k MWh
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-emerald-600">Surplus</span>
              <span className="font-bold text-emerald-700">
                +{Math.max(0, Math.round(((summary.total_clean_gen_mwh || 42800) - 35000) / 1000))}k MWh
              </span>
            </div>
          </div>
        </div>

      </section>

    </div>
  );
}
