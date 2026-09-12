import React from 'react';

export default function Sidebar({
  activeTab,
  onSelectTab,
  onOpenExport,
  onOpenSandbox
}) {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'multi-site-fleet', label: 'Multi-Site Fleet', icon: 'grid_view' },
    { id: 'grid-advisor-dispatch', label: 'Grid Advisor & Dispatch', icon: 'bolt' },
    { id: 'model-skill-accuracy', label: 'Model Skill & Accuracy', icon: 'query_stats' },
    { id: 'historical-replay', label: 'Historical vs Predicted', icon: 'history' },
  ];

  return (
    <aside 
      className="fixed left-0 top-0 h-full w-72 z-50 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
      style={{ backgroundColor: 'rgb(10, 24, 33)', borderRight: '1px solid rgba(255, 255, 255, 0.06)' }}
    >
      <div className="flex flex-col">
        {/* Brand Header */}
        <div className="p-space-xl flex items-start gap-space-md">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <span className="material-symbols-outlined text-xl">electric_bolt</span>
          </div>
          <div className="flex flex-col">
            <span className="font-headline-sm text-headline-sm text-inverse-on-surface tracking-tight leading-none text-white font-bold">
              EcoGrid Intelligence
            </span>
            <span className="font-label-sm text-label-sm text-outline-variant mt-space-2xs uppercase tracking-wider text-slate-400 text-[10px]">
              Renewable Generation Intelligence
            </span>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="px-space-md mt-space-xs">
          <span className="px-space-md font-label-sm text-label-sm text-outline-variant uppercase tracking-wider block mb-space-xs text-slate-500 text-[11px] font-semibold">
            Operations & Telemetry
          </span>
          <nav className="flex flex-col gap-space-2xs">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`flex items-center gap-space-md px-space-md py-space-sm rounded-lg transition-all text-left text-sm ${
                    isActive
                      ? 'font-semibold'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                  }`}
                  style={
                    isActive
                      ? {
                          background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.22) 0%, rgba(16, 185, 129, 0.08) 100%)',
                          color: 'rgb(52, 211, 153)',
                          borderLeft: '3px solid rgb(16, 185, 129)',
                          fontWeight: '600'
                        }
                      : {}
                  }
                >
                  <span 
                    className="material-symbols-outlined text-lg shrink-0"
                    style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            <div className="my-2 border-t border-slate-800/80 mx-2" />

            <span className="px-space-md font-label-sm text-label-sm text-outline-variant uppercase tracking-wider block mb-space-xs text-slate-500 text-[11px] font-semibold">
              Utility Tools
            </span>

            <button
              onClick={onOpenExport}
              className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-slate-400 hover:bg-slate-800/60 hover:text-white transition-colors text-left text-sm"
            >
              <span className="material-symbols-outlined text-lg">assessment</span>
              <span>SCADA Export Schedule</span>
            </button>

            <button
              onClick={onOpenSandbox}
              className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-slate-400 hover:bg-slate-800/60 hover:text-white transition-colors text-left text-sm"
            >
              <span className="material-symbols-outlined text-lg">tune</span>
              <span>Scenario Stress Sandbox</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Bottom Eco Status Badge */}
      <div 
        className="p-space-lg mx-space-md mb-space-lg rounded-lg flex items-center gap-space-md"
        style={{
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)'
        }}
      >
        <div className="w-8 h-8 rounded-full bg-emerald-800 flex items-center justify-center text-emerald-200">
          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
        </div>
        <div className="flex flex-col">
          <span className="font-label-sm text-label-sm text-emerald-400 font-semibold leading-tight text-xs">
            Clean Energy
          </span>
          <span className="font-body-sm text-body-sm text-slate-400 text-[11px]">
            A Smarter Grid.
          </span>
        </div>
      </div>
    </aside>
  );
}
