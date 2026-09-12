import React, { useState, useEffect, useRef } from 'react';
import GridSelectorModal from './GridSelectorModal';
import DataProvenanceBadge from './DataProvenanceBadge';

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
  const [isGridSelectorOpen, setIsGridSelectorOpen] = useState(false);
  const [timeString, setTimeString] = useState({ ist: '14:32 IST', utc: '09:02 UTC' });

  const currentSite = sites.find(s => s.id === selectedSiteId || s.site_id === selectedSiteId) || sites[0] || {
    name: 'Bhadla Solar Park',
    region: 'Rajasthan',
    capacity_mw: 2245,
    type: 'solar'
  };

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
    if (type === 'hybrid') return 'bolt';
    return 'wb_sunny';
  };

  return (
    <header className="fixed top-0 left-72 right-0 h-16 bg-white/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-slate-200/80 z-50">
      <div className="h-16 w-full px-4 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 relative">
        
        {/* Left: Interactive Grid Selector Button & Live API Toggle */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
          {/* Grid Selector Trigger Button with Provenance info */}
          <div className="relative shrink-0 flex items-center gap-1.5">
            <button
              onClick={() => setIsGridSelectorOpen(true)}
              className="group flex items-center gap-2 px-3 py-1.5 bg-slate-100/90 hover:bg-slate-200/80 rounded-xl text-slate-800 transition-all cursor-pointer border border-slate-200/90 text-xs sm:text-sm shadow-xs hover:shadow-sm"
              title="Click to open Interactive World Map & Multi-Way Grid Selector"
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                currentSite.type === 'wind' 
                  ? 'bg-cyan-100 text-cyan-700' 
                  : currentSite.type === 'hybrid'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                <span className="material-symbols-outlined text-sm">
                  {getSiteIcon(currentSite.type)}
                </span>
              </div>

              <div className="flex flex-col text-left min-w-0">
                <span className="font-bold text-slate-900 truncate max-w-[120px] sm:max-w-[170px] md:max-w-[210px] leading-tight">
                  {currentSite.name}
                </span>
                <span className="text-[10px] text-slate-500 truncate leading-none mt-0.5">
                  {currentSite.region} · {currentSite.capacity_mw} MW
                </span>
              </div>

              <span className="bg-cyan-100/80 text-cyan-800 font-bold text-[10px] px-1.5 py-0.5 rounded-md border border-cyan-200 hidden xl:flex items-center gap-1 shrink-0">
                <span className="material-symbols-outlined text-xs">public</span>
                <span>{sites.length || 35} Grids</span>
              </span>

              <span className="material-symbols-outlined text-slate-400 group-hover:text-slate-700 text-base shrink-0 transition-transform group-hover:translate-y-0.5">
                map
              </span>
            </button>

            {/* Grid Specs Provenance Badge */}
            <DataProvenanceBadge type="real-specs" compact={true} align="left" />

            {/* Redesigned World Map & Multi-Way Search Modal */}
            <GridSelectorModal
              isOpen={isGridSelectorOpen}
              onClose={() => setIsGridSelectorOpen(false)}
              sites={sites}
              selectedSiteId={selectedSiteId}
              onSelectSite={(id) => {
                onSelectSite(id);
                setIsGridSelectorOpen(false);
              }}
            />
          </div>

          {/* Live Data Mode Toggle - with Provenance Info */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onToggleLiveApi && onToggleLiveApi(!useLiveApi)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                useLiveApi 
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-500/20 shadow-sm hover:bg-emerald-100/70' 
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/80'
              }`}
              title={useLiveApi ? "Currently querying Open-Meteo Live API. Click to use offline SCADA." : "Currently using local SCADA holdout telemetry. Click to enable Open-Meteo Live API."}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${useLiveApi ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="whitespace-nowrap font-medium">
                {useLiveApi ? 'Live API' : 'Local SCADA'}
              </span>
              <span className="hidden 2xl:inline text-[10px] text-slate-400 font-normal">
                {useLiveApi ? '(Open-Meteo)' : '(Holdout)'}
              </span>
            </button>
            <DataProvenanceBadge type={useLiveApi ? 'real-weather' : 'real-scada'} compact={true} align="left" />
          </div>

          {/* Live Weather Badge */}
          <div className="hidden 2xl:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-slate-700 border border-slate-200/60 text-xs font-medium shrink-0">
            <span className="material-symbols-outlined text-emerald-600 text-base">thermostat</span>
            <span>{useLiveApi ? 'Live Forecast' : '34°C Clear Sky'}</span>
            <span className="text-slate-400 text-[10px] ml-1">{useLiveApi ? 'Real-Time' : 'GHI: 842 W/m²'}</span>
          </div>
        </div>

        {/* Right: Horizon Switcher (24h/48h/72h), Persona, Time, & Profile */}
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

          {/* Persona Switcher - progressively shown on wide screens */}
          <div className="hidden 2xl:flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200/60 text-xs shrink-0">
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

          {/* Operator Profile - Clean and responsive, avatar always shown, text on wide screens */}
          <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-slate-200 shrink-0">
            <div className="text-right hidden 2xl:block">
              <span className="block text-xs font-semibold text-slate-800 leading-none whitespace-nowrap">
                Eng. Aris Thorne
              </span>
              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                Grid Ops Controller
              </span>
            </div>
            <div 
              className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold ring-2 ring-emerald-500/30 shrink-0 cursor-default"
              title="Eng. Aris Thorne (Grid Ops Controller)"
            >
              AT
            </div>
          </div>

        </div>

      </div>
    </header>
  );
}
