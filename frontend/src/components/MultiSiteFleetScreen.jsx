import React, { useState } from 'react';

const INITIAL_FLEET = [
  {
    id: 'columbia-gorge',
    name: 'Columbia Gorge Ph 1 & 2',
    interconnect: 'OR-BPA-048 · Zone-4',
    tech: 'Wind',
    techIcon: 'air',
    nameplate: '480 MW',
    liveGen: '462 MW',
    capPct: '96%',
    peak24h: '475 MW',
    riskState: 'Alert: Over-Gen +18%',
    riskColor: 'text-rose-600 bg-rose-50 border-rose-200',
    window: '28 min',
    action: 'Curtail 22% & dispatch BESS-A (80 MW)',
    buttonLabel: 'Dispatch',
    buttonColor: 'bg-rose-600 hover:bg-rose-700 text-white',
    isAlert: true
  },
  {
    id: 'desert-sky',
    name: 'Desert Sky Solar & BESS',
    interconnect: 'NV-CAISO-109 · Zone-7',
    tech: 'Hybrid',
    techIcon: 'battery_charging_full',
    nameplate: '600 MW',
    liveGen: '510 MW',
    capPct: '85%',
    peak24h: '560 MW',
    riskState: 'Thermal Inverter Limit',
    riskColor: 'text-amber-700 bg-amber-50 border-amber-200',
    window: '42 min',
    action: 'Activate auxiliary cooling stage 2',
    buttonLabel: 'Mitigate',
    buttonColor: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    isWarning: true
  },
  {
    id: 'bhadla-solar',
    name: 'Bhadla Solar Park',
    interconnect: 'IN-RAJ-001 · Zone-9',
    tech: 'Solar',
    techIcon: 'sunny',
    nameplate: '2,245 MW',
    liveGen: '1,820 MW',
    capPct: '81%',
    peak24h: '2,180 MW',
    riskState: 'Healthy Nominal',
    riskColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    window: '--',
    action: 'Standard AGC tracking active',
    buttonLabel: 'Inspect',
    buttonColor: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
    isNominal: true
  },
  {
    id: 'cascade-solar',
    name: 'Cascade Solar Park',
    interconnect: 'WA-PAC-012 · Zone-2',
    tech: 'Solar',
    techIcon: 'sunny',
    nameplate: '320 MW',
    liveGen: '298 MW',
    capPct: '93%',
    peak24h: '315 MW',
    riskState: 'Watch: Cloud Ramp ±14%',
    riskColor: 'text-amber-700 bg-amber-50 border-amber-200',
    window: '1h 15m',
    action: 'Prime fast-response inverter spin',
    buttonLabel: 'Review',
    buttonColor: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700',
    isWarning: true
  },
  {
    id: 'tri-cities',
    name: 'Tri-Cities Solar Array',
    interconnect: 'WA-MIDC-084 · Zone-3',
    tech: 'Solar',
    techIcon: 'sunny',
    nameplate: '220 MW',
    liveGen: '185 MW',
    capPct: '84%',
    peak24h: '210 MW',
    riskState: 'Watch: Grid Freq Drift',
    riskColor: 'text-cyan-700 bg-cyan-50 border-cyan-200',
    window: '54 min',
    action: 'Adjust droop curve slope +0.8%',
    buttonLabel: 'Review',
    buttonColor: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700',
    isWarning: true
  },
  {
    id: 'silver-lake',
    name: 'Silver Lake Wind Facility',
    interconnect: 'OR-PGE-023 · Zone-1',
    tech: 'Wind',
    techIcon: 'air',
    nameplate: '240 MW',
    liveGen: '188 MW',
    capPct: '78%',
    peak24h: '220 MW',
    riskState: 'Healthy Nominal',
    riskColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    window: '--',
    action: 'Standard AGC tracking active',
    buttonLabel: 'Inspect',
    buttonColor: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
    isNominal: true
  },
  {
    id: 'blue-mountain',
    name: 'Blue Mountain Wind Field',
    interconnect: 'UT-PAC-077 · Zone-5',
    tech: 'Wind',
    techIcon: 'air',
    nameplate: '380 MW',
    liveGen: '272 MW',
    capPct: '71%',
    peak24h: '340 MW',
    riskState: 'Healthy Nominal',
    riskColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    window: '--',
    action: 'Continuous rotor yaw optimization',
    buttonLabel: 'Inspect',
    buttonColor: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
    isNominal: true
  },
  {
    id: 'willamette-microgrid',
    name: 'Willamette Valley Microgrid',
    interconnect: 'OR-PGE-105 · Zone-8',
    tech: 'Hybrid',
    techIcon: 'grid_view',
    nameplate: '100 MW',
    liveGen: '88 MW',
    capPct: '88%',
    peak24h: '95 MW',
    riskState: 'Healthy Nominal',
    riskColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    window: '--',
    action: 'Peak shaving standby ready',
    buttonLabel: 'Inspect',
    buttonColor: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
    isNominal: true
  }
];

export default function MultiSiteFleetScreen({ onSelectSite, onNavigateTab }) {
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSites, setSelectedSites] = useState({
    'columbia-gorge': true,
    'desert-sky': true,
    'bhadla-solar': false,
    'cascade-solar': true
  });
  const [isQueueExecuted, setIsQueueExecuted] = useState(false);

  const toggleSelect = (id) => {
    setSelectedSites(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredFleet = INITIAL_FLEET.filter((site) => {
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

  const handleExecuteAll = () => {
    setIsQueueExecuted(true);
    setTimeout(() => {
      alert('SCADA Intertie Synced: 3 mitigation setpoints transmitted to dispatch controllers successfully.');
    }, 400);
  };

  return (
    <div className="flex flex-col w-full pb-12 gap-5">
      
      {/* 1. Hero Critical Fleet Alert Banner */}
      <div className="bg-rose-50 border border-rose-200/90 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-xl">warning</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                  Critical Fleet Action Required
                </span>
                <span className="text-xs text-slate-500 font-mono">Trigger: 14:28:10 IST</span>
              </div>
              <p className="text-xs text-slate-700 mt-1 max-w-3xl leading-relaxed">
                Zone-4 Columbia Gorge Phase 1 & 2 is exceeding regional thermal ramp envelope by <strong className="text-rose-700 font-semibold">+18% (128 MW surplus)</strong>. Automated fast-curtailment dispatch instruction required within <span className="font-semibold text-rose-700 underline underline-offset-2">28 minutes</span> to avoid severe imbalance surcharges.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={() => onNavigateTab('grid-advisor-dispatch')}
              className="px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold transition-colors"
            >
              Simulate Impact
            </button>
            <button 
              onClick={() => onNavigateTab('grid-advisor-dispatch')}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">flash_on</span>
              <span>Engage Zone Curtailment</span>
            </button>
          </div>
        </div>
      </div>

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
                ALL (8)
              </button>
              <button 
                onClick={() => setFilterType('WIND')}
                className={`px-3 py-1 rounded font-semibold flex items-center gap-1 transition-all ${filterType === 'WIND' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span className="material-symbols-outlined text-xs">air</span> WIND (3)
              </button>
              <button 
                onClick={() => setFilterType('SOLAR')}
                className={`px-3 py-1 rounded font-semibold flex items-center gap-1 transition-all ${filterType === 'SOLAR' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span className="material-symbols-outlined text-xs">sunny</span> SOLAR PV (3)
              </button>
              <button 
                onClick={() => setFilterType('HYBRID')}
                className={`px-3 py-1 rounded font-semibold flex items-center gap-1 transition-all ${filterType === 'HYBRID' ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span className="material-symbols-outlined text-xs">battery_charging_full</span> HYBRID (2)
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
                  {filteredFleet.map((site) => {
                    const isChecked = Boolean(selectedSites[site.id]);
                    const rowBg = site.isAlert 
                      ? 'bg-rose-50/40 hover:bg-rose-50/70' 
                      : site.isWarning 
                      ? 'bg-amber-50/30 hover:bg-amber-50/60' 
                      : 'hover:bg-slate-50/70';

                    return (
                      <tr key={site.id} className={`transition-colors ${rowBg}`}>
                        
                        {/* Site Name & Checkbox */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelect(site.id)}
                              className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer"
                            />
                            <div>
                              <span 
                                onClick={() => {
                                  if (onSelectSite) onSelectSite(site.id);
                                  onNavigateTab('overview');
                                }}
                                className="font-semibold text-slate-900 block leading-tight hover:text-emerald-600 cursor-pointer"
                              >
                                {site.name}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">{site.interconnect}</span>
                            </div>
                          </div>
                        </td>

                        {/* Tech */}
                        <td className="py-3 px-2">
                          <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                            site.tech === 'Wind' ? 'bg-cyan-50 text-cyan-700' : site.tech === 'Solar' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            <span className="material-symbols-outlined text-xs">{site.techIcon}</span>
                            {site.tech}
                          </span>
                        </td>

                        {/* Nameplate */}
                        <td className="py-3 px-2 font-semibold text-slate-700 tabular-nums">
                          {site.nameplate}
                        </td>

                        {/* Live Gen */}
                        <td className="py-3 px-2">
                          <span className={`font-bold tabular-nums ${site.isAlert ? 'text-rose-600' : 'text-slate-900'}`}>
                            {site.liveGen}
                          </span>
                          <span className={`block text-[10px] ${site.isAlert ? 'text-rose-500' : 'text-slate-400'}`}>
                            ({site.capPct} cap)
                          </span>
                        </td>

                        {/* 24h Peak */}
                        <td className="py-3 px-2 text-slate-600 font-mono">
                          {site.peak24h}
                        </td>

                        {/* Risk State Badge */}
                        <td className="py-3 px-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${site.riskColor}`}>
                            {site.isAlert && <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping" />}
                            {site.riskState}
                          </span>
                        </td>

                        {/* Window */}
                        <td className={`py-3 px-2 font-semibold tabular-nums text-xs ${site.isAlert ? 'text-rose-600' : 'text-slate-500'}`}>
                          {site.window}
                        </td>

                        {/* Action */}
                        <td className="py-3 px-3">
                          <span className="text-slate-700 text-xs block max-w-xs">{site.action}</span>
                        </td>

                        {/* Intervention Button */}
                        <td className="py-3 px-4 text-right">
                          <button 
                            onClick={() => onNavigateTab('grid-advisor-dispatch')}
                            className={`px-2.5 py-1 rounded text-xs font-semibold shadow-sm transition-all ${site.buttonColor}`}
                          >
                            {site.buttonLabel}
                          </button>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="px-4 py-2.5 bg-slate-50/80 flex items-center justify-between text-xs text-slate-500 border-t border-slate-200/70">
              <span>Displaying 8 of 8 production sites · 4 sub-zones active</span>
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
                  <p className="text-xs text-slate-400 mt-0.5">3 Actions staged for synchronized dispatch</p>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  3 STAGED
                </span>
              </div>

              {/* Staged Items Stack */}
              <div className="flex flex-col gap-3">
                
                {/* Staged 1 */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70 flex flex-col gap-1 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-600"></div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-rose-600 uppercase">Priority 1 · Fast Ramp Down</span>
                      <h4 className="text-xs font-bold text-slate-900">Columbia Gorge Ph 1 & 2</h4>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Apply dynamic setpoint cap to 360 MW (-22% derate). Command battery bank Alpha to absorb 80 MW surge.
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200/60 text-[11px]">
                    <span className="text-slate-500">Avoided Cost: <strong className="text-emerald-700">+$34,200/hr</strong></span>
                    <span className="text-rose-600 font-semibold">T-minus 28m</span>
                  </div>
                </div>

                {/* Staged 2 */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70 flex flex-col gap-1 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-blue-600 uppercase">Priority 2 · Inverter Chiller Step</span>
                      <h4 className="text-xs font-bold text-slate-900">Desert Sky Solar & BESS</h4>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Step-up auxiliary cooling chiller bank. Thermal derate mitigated by +45 MW headroom recovery.
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200/60 text-[11px]">
                    <span className="text-slate-500">Avoided Cost: <strong className="text-emerald-700">+$18,400/hr</strong></span>
                    <span className="text-amber-600 font-semibold">T-minus 42m</span>
                  </div>
                </div>

                {/* Staged 3 */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70 flex flex-col gap-1 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-600"></div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-700 uppercase">Priority 3 · Peaker Standby</span>
                      <h4 className="text-xs font-bold text-slate-900">Bhadla Solar Intertie</h4>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Pre-warm peaker units with 2h lead time to supply evening demand ramp shortfall.
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200/60 text-[11px]">
                    <span className="text-slate-500">Avoided Cost: <strong className="text-emerald-700">+$12,000/hr</strong></span>
                    <span className="text-emerald-700 font-semibold">Staged</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Queue Execution Footer */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Aggregate Avoided Risk:</span>
                <span className="font-bold text-emerald-700">+$64,600 / hr</span>
              </div>

              <button
                onClick={handleExecuteAll}
                disabled={isQueueExecuted}
                className={`w-full py-2.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 ${
                  isQueueExecuted
                    ? 'bg-emerald-100 text-emerald-800 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">
                  {isQueueExecuted ? 'check_circle' : 'bolt'}
                </span>
                <span>
                  {isQueueExecuted ? '✓ All Staged Orders Executed & Logged' : 'Synchronize & Execute All Orders (3)'}
                </span>
              </button>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
