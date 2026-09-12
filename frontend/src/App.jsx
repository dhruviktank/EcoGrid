import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import PlantOverviewScreen from './components/PlantOverviewScreen';
import MultiSiteFleetScreen from './components/MultiSiteFleetScreen';
import GridAdvisorScreen from './components/GridAdvisorScreen';
import ModelSkillScreen from './components/ModelSkillScreen';
import HistoricalVsPredictedView from './components/HistoricalVsPredictedView';
import ScenarioSandbox from './components/ScenarioSandbox';
import SCADAExportModal from './components/SCADAExportModal';

const DEFAULT_SITES = [
  {
    id: "bhadla-solar",
    name: "Bhadla Solar Park",
    type: "solar",
    country: "India",
    region: "Rajasthan",
    latitude: 27.539,
    longitude: 71.915,
    capacity_mw: 2245.0,
    bess_capacity_mwh: 1200.0,
    bess_max_power_mw: 300.0
  },
  {
    id: "desert-sunlight",
    name: "Desert Sunlight Solar Farm",
    type: "solar",
    country: "USA",
    region: "California",
    latitude: 33.82,
    longitude: -115.39,
    capacity_mw: 550.0,
    bess_capacity_mwh: 400.0,
    bess_max_power_mw: 100.0
  },
  {
    id: "muppandal-wind",
    name: "Muppandal Wind Farm",
    type: "wind",
    country: "India",
    region: "Tamil Nadu",
    latitude: 8.261,
    longitude: 77.545,
    capacity_mw: 1500.0,
    bess_capacity_mwh: 600.0,
    bess_max_power_mw: 150.0
  },
  {
    id: "beatrice-wind",
    site_id: "beatrice-wind",
    name: "Beatrice Offshore Wind Farm",
    type: "wind",
    country: "UK",
    region: "Moray Firth, Scotland",
    latitude: 58.25,
    longitude: -2.9,
    capacity_mw: 588.0,
    bess_capacity_mwh: 200.0,
    bess_max_power_mw: 50.0
  },
  {
    id: "hybrid-gansu",
    name: "Jiuquan Hybrid Eco-Power Base",
    type: "hybrid",
    country: "China",
    region: "Gansu",
    latitude: 40.0,
    longitude: 96.0,
    capacity_mw: 3200.0,
    bess_capacity_mwh: 1800.0,
    bess_max_power_mw: 450.0
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [sites, setSites] = useState(DEFAULT_SITES);
  const [selectedSiteId, setSelectedSiteId] = useState('bhadla-solar');
  const [horizonHours, setHorizonHours] = useState(72);
  const [persona, setPersona] = useState('operator');
  const [scenarioShocks, setScenarioShocks] = useState({
    cloud_multiplier: 1.0,
    wind_multiplier: 1.0,
    temp_delta: 0.0
  });

  const [useLiveApi, setUseLiveApi] = useState(true);
  const [forecastData, setForecastData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSandboxOpen, setIsSandboxOpen] = useState(false);
  const [benchmarkData, setBenchmarkData] = useState(null);

  // Fetch sites list and benchmark on startup
  useEffect(() => {
    fetch('/api/sites')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.sites && data.sites.length > 0) {
          const visibleSites = data.sites.filter(s => s.enabled !== false && s.active !== false);
          setSites(visibleSites);
        }
      })
      .catch(() => {});

    fetch('/api/models/benchmark')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.models) {
          setBenchmarkData(data.models);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch forecast whenever site, horizon, or shocks change
  const fetchForecast = (shocksToUse = scenarioShocks, liveApiToUse = useLiveApi) => {
    setIsLoading(true);
    const days = horizonHours === 24 ? 1 : horizonHours === 48 ? 2 : 3;

    fetch('/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_id: selectedSiteId,
        forecast_days: days,
        scenario_shocks: shocksToUse,
        use_live_api: liveApiToUse
      })
    })
      .then(res => res.json())
      .then(data => {
        setForecastData(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch forecast from backend API:', err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchForecast(scenarioShocks, useLiveApi);
  }, [selectedSiteId, horizonHours, useLiveApi]);

  const handleApplyShocks = (newShocks) => {
    fetchForecast(newShocks, useLiveApi);
  };

  const handleToggleLiveApi = (val) => {
    setUseLiveApi(val);
    fetchForecast(scenarioShocks, val);
  };

  const handleResetShocks = () => {
    const defaultShocks = { cloud_multiplier: 1.0, wind_multiplier: 1.0, temp_delta: 0.0 };
    setScenarioShocks(defaultShocks);
    fetchForecast(defaultShocks);
  };

  const currentSite = sites.find(s => s.id === selectedSiteId) || sites[0];

  return (
    <div className="min-h-screen bg-slate-50 font-body-md text-on-surface antialiased flex">
      
      {/* 1. Left Fixed Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenSandbox={() => setIsSandboxOpen(true)}
      />

      {/* 2. Main Canvas Column */}
      <div className="pl-72 flex flex-col min-h-screen flex-1 w-full bg-slate-50/60">
        
        {/* Fixed Top Header */}
        <Header
          sites={sites}
          selectedSiteId={selectedSiteId}
          onSelectSite={setSelectedSiteId}
          horizonHours={horizonHours}
          onChangeHorizon={setHorizonHours}
          weatherSource={forecastData?.weather_source}
          persona={persona}
          onChangePersona={setPersona}
          useLiveApi={useLiveApi}
          onToggleLiveApi={handleToggleLiveApi}
        />

        {/* Dynamic Screen Viewport */}
        <main className="w-full pt-20 px-6 flex-1 max-w-[1680px] mx-auto">
          {activeTab === 'overview' && (
            <PlantOverviewScreen
              site={currentSite}
              sites={sites}
              forecastData={forecastData}
              horizonHours={horizonHours}
              onChangeHorizon={setHorizonHours}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'multi-site-fleet' && (
            <MultiSiteFleetScreen
              onSelectSite={(id) => {
                setSelectedSiteId(id);
                setActiveTab('overview');
              }}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'grid-advisor-dispatch' && (
            <GridAdvisorScreen
              forecastData={forecastData}
              site={currentSite}
            />
          )}

          {activeTab === 'model-skill-accuracy' && (
            <ModelSkillScreen
              benchmarkData={benchmarkData}
              sites={sites}
              selectedSiteId={selectedSiteId}
            />
          )}

          {activeTab === 'historical-replay' && (
            <div className="w-full pb-12 animate-in fade-in duration-200">
              <HistoricalVsPredictedView
                selectedSiteId={selectedSiteId}
                sites={sites}
                embedded={false}
              />
            </div>
          )}
        </main>

        {/* Global Footer */}
        <footer className="py-4 px-8 border-t border-slate-200 text-xs text-slate-500 flex flex-wrap justify-between items-center bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">EcoGrid Intelligence</span>
            <span>·</span>
            <span>Forecasting the grid's next 72 hours, before the weather decides for us</span>
            <span>·</span>
            <span className="text-emerald-600 font-semibold">Team Dev29</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-700">
            <span className="material-symbols-outlined text-sm">verified</span>
            <span>Production SCADA Engine Verified (Offline Resilient)</span>
          </div>
        </footer>

      </div>

      {/* SCADA Export Modal */}
      <SCADAExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        siteId={selectedSiteId}
        siteName={currentSite?.name}
        dispatchTimeline={forecastData?.dispatch_timeline}
      />

      {/* Scenario Stress-Testing Modal */}
      {isSandboxOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">tune</span>
                Scenario Stress-Testing Sandbox
              </h3>
              <button 
                onClick={() => setIsSandboxOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <ScenarioSandbox
              shocks={scenarioShocks}
              onChangeShocks={setScenarioShocks}
              onApplyShocks={(shocks) => {
                handleApplyShocks(shocks);
                setIsSandboxOpen(false);
              }}
              onResetShocks={() => {
                handleResetShocks();
                setIsSandboxOpen(false);
              }}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}

    </div>
  );
}
