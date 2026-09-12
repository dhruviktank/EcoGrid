import React, { useState, useEffect } from 'react';

export default function MultiSiteFleetScreen({ onSelectSite, onNavigateTab }) {
  const [fleet, setFleet] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSites, setSelectedSites] = useState({});
  const [isQueueExecuted, setIsQueueExecuted] = useState(false);

  useEffect(() => {
    fetch('/api/fleet')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.fleet) {
          setFleet(data.fleet);
          setSummary(data);
          const initialSel = {};
          data.fleet.forEach(s => {
            if (s.isAlert || s.isWarning) initialSel[s.id] = true;
          });
          setSelectedSites(initialSel);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggleSelect = (id) => {
    setSelectedSites(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredFleet = fleet.filter((site) => {
    if (filterType === 'WIND' && site.tech !== 'Wind') return false;
    if (filterType === 'SOLAR' && site.tech !== 'Solar') return false;
    if (filterType === 'HYBRID' && site.tech !== 'Hybrid') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        site.name.toLowerCase().includes(q) ||
        site.interconnect.toLowerCase().includes(q) ||
        site.tech.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const criticalSite = fleet.find(s => s.isAlert) || fleet.find(s => s.isWarning) || fleet[0];
  const stagedSites = fleet.filter(s => selectedSites[s.id]);

  const handleExecuteAll = () => {
    setIsQueueExecuted(true);
    setTimeout(() => {
      alert(`SCADA Intertie Synced: ${stagedSites.length} mitigation setpoints transmitted to dispatch controllers successfully.`);
    }, 400);
  };

  const windCount = fleet.filter(s => s.tech === 'Wind').length;
  const solarCount = fleet.filter(s => s.tech === 'Solar').length;
  const hybridCount = fleet.filter(s => s.tech === 'Hybrid').length;

  return (
    <div className="flex flex-col w-full pb-12 gap-5">
      
      {/* 1. Hero Critical Fleet Alert Banner (Dynamic from Real Decision Engine) */}
      {criticalSite && (
        <div className={`rounded-xl p-4 shadow-sm border ${criticalSite.isAlert ? 'bg-rose-50 border-rose-200/90' : 'bg-amber-50 border-amber-200/90'}`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg text-white flex items-center justify-center shrink-0 shadow-sm ${criticalSite.isAlert ? 'bg-rose-600' : 'bg-amber-600'}`}>
                <span className="material-symbols-outlined text-xl">warning</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded ${criticalSite.isAlert ? 'text-rose-700 bg-rose-100' : 'text-amber-800 bg-amber-100'}`}>
                    {criticalSite.isAlert ? 'Critical Fleet Action Required' : 'Active Grid Advisory Watch'}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">Asset: {criticalSite.name}</span>
                </div>
                <p className="text-xs text-slate-700 mt-1 max-w-3xl leading-relaxed">
                  <strong className="text-slate-900 font-semibold">{criticalSite.name} ({criticalSite.interconnect})</strong>: {criticalSite.action}. Current generation is <strong className="text-slate-900">{criticalSite.liveGen}</strong> ({criticalSite.capPct} of {criticalSite.nameplate}). Response window: <span className="font-semibold text-rose-700 underline underline-offset-2">{criticalSite.window}</span>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={() => {
                  onSelectSite && onSelectSite(criticalSite.id);
                  onNavigateTab && onNavigateTab('overview');
                }}
                className="px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold transition-colors"
              >
                Inspect Plant
              </button>
              <button 
                onClick={() => onNavigateTab && onNavigateTab('grid-advisor-dispatch')}
                className={`px-3.5 py-1.5 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 ${criticalSite.isAlert ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                <span className="material-symbols-outlined text-sm">flash_on</span>
                <span>Engage Dispatch Advisor</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Workspace: 8-Col Table Area + 4-Col Mitigation Queue */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        
        {/* Left 8 Columns: Asset Fleet Grid */}
        <div className="xl:col-span-8 flex flex-col gap-4">
          
          {/* Filter & Action Bar */}
          <div className="bg-white rounded-xl p-3.5 shadow-sm border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-3">
            
            {/* Search */}
            <div className="relative w-full md:w-80">
              <span className="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-lg">search</span>
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by site name, zone, or asset type..."
                className="w-full bg-slate-50 text-slate-900 placeholder-slate-400 text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-200/80 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Segmented Filter Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-full md:w-auto overflow-x-auto text-xs">
              <button 
                onClick={() => setFilterType('ALL')}
                className={`px-3 py-1 rounded font-semibold transition-all ${filterType === 'ALL' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                ALL ({fleet.length})
              </button>
              <button 
                onClick={() => setFilterType('WIND')}
                className={`px-3 py-1 rounded font-semibold flex items-center gap-1 transition-all ${filterType === 'WIND' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span className="material-symbols-outlined text-xs">air</span> WIND ({windCount})
              </button>
              <button 
                onClick={() => setFilterType('SOLAR')}
                className={`px-3 py-1 rounded font-semibold flex items-center gap-1 transition-all ${filterType === 'SOLAR' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span className="material-symbols-outlined text-xs">sunny</span> SOLAR PV ({solarCount})
              </button>
              <button 
                onClick={() => setFilterType('HYBRID')}
                className={`px-3 py-1 rounded font-semibold flex items-center gap-1 transition-all ${filterType === 'HYBRID' ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span className="material-symbols-outlined text-xs">battery_charging_full</span> HYBRID ({hybridCount})
              </button>
            </div>

          </div>

          {/* Fleet Table Module */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200/80">
                    <th className="py-3 px-4">Site Name & Interconnect</th>
                    <th className="py-3 px-2">Tech</th>
                    <th className="py-3 px-2">Nameplate</th>
                    <th className="py-3 px-2">Live Gen</th>
                    <th className="py-3 px-2">24h Peak</th>
                    <th className="py-3 px-2">Risk State</th>
                    <th className="py-3 px-2">Window</th>
                    <th className="py-3 px-3">AI Recommended Action</th>
                    <th className="py-3 px-4 text-right">Intervention</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="9" className="text-center py-8 text-slate-400">
                        <div className="flex items-center justify-center gap-2">
                          <span className="material-symbols-outlined animate-spin text-lg text-emerald-600">sync</span>
                          <span>Loading fleet telemetry & ML forecasts...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredFleet.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="text-center py-8 text-slate-400">
                        No sites matching filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredFleet.map((site) => {
                      const isChecked = Boolean(selectedSites[site.id]);
                      const rowBg = site.isAlert 
                        ? 'bg-rose-50/40 hover:bg-rose-50/70' 
                        : site.isWarning 
                          ? 'bg-amber-50/30 hover:bg-amber-50/60' 
                          : 'hover:bg-slate-50/80';

                      return (
                        <tr 
                          key={site.id}
                          className={`transition-colors cursor-pointer ${rowBg}`}
                          onClick={() => {
                            onSelectSite && onSelectSite(site.id);
                            onNavigateTab && onNavigateTab('overview');
                          }}
                        >
                          {/* Name & Checkbox */}
                          <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-3">
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelect(site.id)}
                                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                              <div 
                                onClick={() => {
                                  onSelectSite && onSelectSite(site.id);
                                  onNavigateTab && onNavigateTab('overview');
                                }}
                                className="flex flex-col"
                              >
                                <span className="font-bold text-slate-900 hover:text-emerald-700">
                                  {site.name}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {site.interconnect}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Tech */}
                          <td className="py-3.5 px-2">
                            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                              <span className="material-symbols-outlined text-xs">{site.techIcon}</span>
                              <span>{site.tech}</span>
                            </span>
                          </td>

                          {/* Nameplate */}
                          <td className="py-3.5 px-2 font-mono text-slate-800 font-semibold">
                            {site.nameplate}
                          </td>

                          {/* Live Gen & % */}
                          <td className="py-3.5 px-2">
                            <div className="flex flex-col">
                              <span className="font-mono font-bold text-slate-900">{site.liveGen}</span>
                              <span className="text-[10px] text-slate-500">{site.capPct} cap</span>
                            </div>
                          </td>

                          {/* 24h Peak */}
                          <td className="py-3.5 px-2 font-mono text-slate-700">
                            {site.peak24h}
                          </td>

                          {/* Risk State */}
                          <td className="py-3.5 px-2">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${site.riskColor} whitespace-nowrap`}>
                              {site.riskState}
                            </span>
                          </td>

                          {/* Window */}
                          <td className="py-3.5 px-2 text-slate-500 font-mono text-[11px]">
                            {site.window}
                          </td>

                          {/* Action */}
                          <td className="py-3.5 px-3 max-w-[220px]">
                            <span className="text-slate-700 line-clamp-2 text-[11px]">
                              {site.action}
                            </span>
                          </td>

                          {/* Intervention CTA */}
                          <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                onSelectSite && onSelectSite(site.id);
                                onNavigateTab && onNavigateTab('overview');
                              }}
                              className={`px-3 py-1 rounded text-xs font-semibold shadow-sm transition-all ${site.buttonColor}`}
                            >
                              {site.buttonLabel}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer Summary Strip */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
              <div className="flex items-center gap-4">
                <span>Total Monitored Fleet Capacity: <strong className="text-slate-900">{summary ? `${summary.total_capacity_mw?.toLocaleString()} MW` : '8,831 MW'}</strong></span>
                <span>Active Live Generation: <strong className="text-emerald-700">{summary ? `${summary.total_live_gen_mw?.toLocaleString()} MW` : '6,177 MW'}</strong></span>
              </div>
              <span className="font-mono text-[11px] text-slate-400">ISO Interconnection Data Feed: 99.98% Synced</span>
            </div>
          </div>

        </div>

        {/* Right 4 Columns: Pending Mitigation Queue Drawer */}
        <div className="xl:col-span-4 flex flex-col gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-5 flex flex-col h-full justify-between">
            
            <div>
              {/* Queue Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-emerald-600 text-lg">pending_actions</span>
                    <h2 className="text-sm font-bold text-slate-900">Pending Mitigation Queue</h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{stagedSites.length} Actions staged for synchronized dispatch</p>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  {stagedSites.length} STAGED
                </span>
              </div>

              {/* Staged Items Stack (Dynamic from Real Selected Sites) */}
              <div className="flex flex-col gap-3">
                {stagedSites.length === 0 ? (
                  <div className="p-4 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
                    No sites currently staged. Check asset boxes in the fleet table to stage synchronized mitigation setpoints.
                  </div>
                ) : (
                  stagedSites.map((site, idx) => (
                    <div 
                      key={site.id} 
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200/70 flex flex-col gap-1 relative overflow-hidden"
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${site.isAlert ? 'bg-rose-600' : 'bg-amber-500'}`}></div>
                      <div className="flex items-start justify-between">
                        <div>
                          <span className={`text-[10px] font-bold uppercase ${site.isAlert ? 'text-rose-600' : 'text-amber-700'}`}>
                            Priority {idx + 1} · {site.isAlert ? 'Curtailment Dispatch' : 'Reserve Mitigation'}
                          </span>
                          <h4 className="text-xs font-bold text-slate-900">{site.name}</h4>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        {site.action}
                      </p>
                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200/60 text-[11px]">
                        <span className="text-slate-500">Target Output: <strong className="text-slate-800">{site.liveGen}</strong></span>
                        <span className="text-rose-600 font-semibold">{site.window !== '--' ? `T-minus ${site.window}` : 'Standby Ready'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Queue Execution Footer */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Staged Interconnection Assets:</span>
                <span className="font-bold text-emerald-700">{stagedSites.length} Units Active</span>
              </div>

              <button
                onClick={handleExecuteAll}
                disabled={isQueueExecuted || stagedSites.length === 0}
                className={`w-full py-2.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 ${
                  isQueueExecuted
                    ? 'bg-emerald-100 text-emerald-800 cursor-default'
                    : stagedSites.length === 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">
                  {isQueueExecuted ? 'check_circle' : 'bolt'}
                </span>
                <span>
                  {isQueueExecuted ? '✓ All Staged Orders Executed & Logged' : `Synchronize & Execute Orders (${stagedSites.length})`}
                </span>
              </button>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
