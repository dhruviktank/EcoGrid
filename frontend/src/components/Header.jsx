import React, { useState, useEffect, useRef } from 'react';

export default function Header({
  sites = [],
  selectedSiteId,
  onSelectSite,
  horizonHours,
  onChangeHorizon,
  weatherSource,
  persona,
  onChangePersona,
  useLiveApi = false,
  onToggleLiveApi
}) {
  const [isSiteDropdownOpen, setIsSiteDropdownOpen] = useState(false);
  const [timeString, setTimeString] = useState({ ist: '14:32 IST', utc: '09:02 UTC' });
  const dropdownRef = useRef(null);

  const currentSite = sites.find(s => s.id === selectedSiteId) || sites[0] || {
    name: 'Bhadla Solar Park',
    region: 'Rajasthan',
    capacity_mw: 2245,
    type: 'solar'
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsSiteDropdownOpen(false);
      }
    };
    if (isSiteDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSiteDropdownOpen]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const istHours = String((now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24).padStart(2, '0');
      const istMins = String((now.getUTCMinutes() + 30) % 60).padStart(2, '0');
      const utcHours = String(now.getUTCHours()).padStart(2, '0');
      const utcMins = String(now.getUTCMinutes()).padStart(2, '0');
      setTimeString({
        ist: `${istHours}:${istMins} IST`,
        utc: `${utcHours}:${utcMins} UTC`
      });
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  const getSiteIcon = (type) => {
    if (type === 'wind') return 'air';
    if (type === 'hybrid') return 'battery_charging_full';
    return 'wb_sunny';
  };

  return (
    <header className="fixed top-0 left-72 right-0 h-16 bg-white/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-slate-200/80 z-50">
      <div className="h-16 w-full px-4 sm:px-6 flex items-center justify-between gap-3 relative">
        
        {/* Left: Site Selector & Weather Condition */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Site Selector Dropdown */}
          <div ref={dropdownRef} className="relative shrink-0">
            <button
              onClick={() => setIsSiteDropdownOpen(!isSiteDropdownOpen)}
              className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 rounded-lg text-slate-800 transition-colors cursor-pointer border border-slate-200 text-xs sm:text-sm"
            >
              <span className={`material-symbols-outlined text-base sm:text-lg ${currentSite.type === 'wind' ? 'text-cyan-600' : 'text-amber-500'}`}>
                {getSiteIcon(currentSite.type)}
              </span>
              <span className="font-semibold text-slate-900 whitespace-nowrap">
                {currentSite.name}
              </span>
              <span className="text-xs text-slate-500 hidden xl:inline whitespace-nowrap">
                {currentSite.region} · {currentSite.capacity_mw} MW
              </span>
              <span className="material-symbols-outlined text-slate-400 text-sm">
                arrow_drop_down
              </span>
            </button>

            {/* Dropdown Menu */}
            {isSiteDropdownOpen && (
              <div 
                className="absolute left-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 z-[60] overflow-hidden max-h-96 overflow-y-auto"
              >
                <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Select Grid Asset
                </div>
                {sites.map((site) => (
                  <button
                    key={site.id}
                    onClick={() => {
                      onSelectSite(site.id);
                      setIsSiteDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 transition-colors ${
                      site.id === selectedSiteId ? 'bg-emerald-50 text-emerald-900 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`material-symbols-outlined text-sm ${site.type === 'wind' ? 'text-cyan-600' : 'text-amber-500'}`}>
                        {getSiteIcon(site.type)}
                      </span>
                      <div>
                        <div className="text-xs font-semibold">{site.name}</div>
                        <div className="text-[10px] text-slate-500">{site.region} ({site.capacity_mw} MW)</div>
                      </div>
                    </div>
                    {site.id === selectedSiteId && (
                      <span className="material-symbols-outlined text-emerald-600 text-sm">check</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Live Data Mode Toggle */}
          <button
            onClick={() => onToggleLiveApi && onToggleLiveApi(!useLiveApi)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer shrink-0 ${
              useLiveApi 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20 shadow-sm' 
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/80'
            }`}
            title={useLiveApi ? "Currently querying Open-Meteo Live API. Click to use offline SCADA." : "Currently using local SCADA holdout telemetry. Click to enable Open-Meteo Live API."}
          >
            <span className={`w-2 h-2 rounded-full ${useLiveApi ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span className="whitespace-nowrap">{useLiveApi ? 'Live API: Open-Meteo' : 'Mode: Local SCADA'}</span>
          </button>

          {/* Live Weather Badge */}
          <div className="hidden 2xl:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-slate-700 border border-slate-200/60 text-xs font-medium shrink-0">
            <span className="material-symbols-outlined text-emerald-600 text-base">thermostat</span>
            <span>{useLiveApi ? 'Live Forecast' : '34°C Clear Sky'}</span>
            <span className="text-slate-400 text-[10px] ml-1">{useLiveApi ? 'Real-Time' : 'GHI: 842 W/m²'}</span>
          </div>
        </div>

        {/* Right: Horizon, Time, Persona, & Operator */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          
          {/* Horizon Switcher (24h / 48h / 72h) */}
          <div className="inline-flex p-0.5 sm:p-1 bg-slate-100 rounded-lg gap-0.5 sm:gap-1 border border-slate-200/60 shrink-0">
            {[24, 48, 72].map((h) => (
              <button
                key={h}
                onClick={() => onChangeHorizon(h)}
                className={`px-2 sm:px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                  horizonHours === h
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>

          {/* Persona Switcher */}
          <div className="hidden xl:flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200/60 text-xs shrink-0">
            {[
              { id: 'operator', label: 'Operator' },
              { id: 'planner', label: 'Planner' },
              { id: 'trader', label: 'Trader' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => onChangePersona && onChangePersona(p.id)}
                className={`px-2 py-1 rounded font-medium transition-all ${
                  persona === p.id 
                    ? 'bg-white text-slate-900 shadow-sm font-semibold' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Live Clock Badge */}
          <div className="hidden 2xl:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-slate-800 border border-slate-200/60 text-xs shrink-0">
            <span className="material-symbols-outlined text-slate-500 text-base">schedule</span>
            <span className="font-semibold tabular-nums">{timeString.ist}</span>
            <span className="text-slate-400 text-[10px]">({timeString.utc})</span>
          </div>

          {/* Operator Profile - ALWAYS FULLY VISIBLE INSIDE SCREEN */}
          <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-slate-200 shrink-0">
            <div className="text-right hidden sm:block">
              <span className="block text-xs font-semibold text-slate-800 leading-none whitespace-nowrap">
                Eng. Aris Thorne
              </span>
              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                Grid Ops Controller
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold ring-2 ring-emerald-500/30 shrink-0">
              AT
            </div>
          </div>

        </div>

      </div>
    </header>
  );
}
