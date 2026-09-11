import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MetricsCards from './components/MetricsCards';
import InteractiveChart from './components/InteractiveChart';
import GridActionsPanel from './components/GridActionsPanel';
import BatteryStorageWidget from './components/BatteryStorageWidget';
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
    id: "hornsea-wind",
    name: "Hornsea 2 Offshore Wind",
    type: "wind",
    country: "UK",
    region: "North Sea",
    latitude: 53.9,
    longitude: 1.75,
    capacity_mw: 1386.0,
    bess_capacity_mwh: 500.0,
    bess_max_power_mw: 125.0
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
  const [sites, setSites] = useState(DEFAULT_SITES);
  const [selectedSiteId, setSelectedSiteId] = useState('bhadla-solar');
  const [horizonHours, setHorizonHours] = useState(72);
  const [activeModel, setActiveModel] = useState('ensemble');
  const [scenarioShocks, setScenarioShocks] = useState({
    cloud_multiplier: 1.0,
    wind_multiplier: 1.0,
    temp_delta: 0.0
  });

  const [forecastData, setForecastData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Fetch sites list on startup
  useEffect(() => {
    fetch('/api/sites')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.sites && data.sites.length > 0) {
          setSites(data.sites);
        }
      })
      .catch(() => {
        // graceful fallback to DEFAULT_SITES
      });
  }, []);

  // Fetch forecast whenever site, horizon, or shocks change
  const fetchForecast = (shocksToUse = scenarioShocks) => {
    setIsLoading(true);
    const days = horizonHours === 24 ? 1 : horizonHours === 48 ? 2 : 3;

    fetch('/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_id: selectedSiteId,
        forecast_days: days,
        scenario_shocks: shocksToUse
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
    fetchForecast(scenarioShocks);
  }, [selectedSiteId, horizonHours]);

  const handleApplyShocks = (newShocks) => {
    fetchForecast(newShocks);
  };

  const handleResetShocks = () => {
    const defaultShocks = { cloud_multiplier: 1.0, wind_multiplier: 1.0, temp_delta: 0.0 };
    setScenarioShocks(defaultShocks);
    fetchForecast(defaultShocks);
  };

  const currentSite = sites.find(s => s.id === selectedSiteId) || sites[0];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Navigation Header */}
      <Header
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSelectSite={setSelectedSiteId}
        horizonHours={horizonHours}
        onChangeHorizon={setHorizonHours}
        activeModel={activeModel}
        onChangeModel={setActiveModel}
        onOpenExport={() => setIsExportOpen(true)}
        weatherSource={forecastData?.weather_source}
      />

      {/* Main Content Area */}
      <main style={{ flex: 1, paddingBottom: '30px' }}>
        
        {/* Executive Metrics Cards */}
        <MetricsCards
          summary={forecastData?.grid_summary}
          site={currentSite}
          forecastTimeline={forecastData?.forecast_timeline}
          horizonHours={horizonHours}
        />

        {/* Primary Interactive Visualization */}
        <InteractiveChart
          forecastTimeline={forecastData?.forecast_timeline}
          dispatchTimeline={forecastData?.dispatch_timeline}
          site={currentSite}
          horizonHours={horizonHours}
          activeModel={activeModel}
        />

        {/* Operational Control Deck */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '16px',
          margin: '0 20px'
        }}>
          {/* Grid Actions & Dispatch Feed */}
          <GridActionsPanel
            criticalActions={forecastData?.critical_actions}
            dispatchTimeline={forecastData?.dispatch_timeline}
            horizonHours={horizonHours}
          />

          {/* BESS Battery Storage Telemetry */}
          <BatteryStorageWidget
            site={currentSite}
            dispatchTimeline={forecastData?.dispatch_timeline}
            horizonHours={horizonHours}
          />

          {/* Scenario Stress-Testing Sandbox */}
          <ScenarioSandbox
            shocks={scenarioShocks}
            onChangeShocks={setScenarioShocks}
            onApplyShocks={handleApplyShocks}
            onResetShocks={handleResetShocks}
            isLoading={isLoading}
          />
        </div>

      </main>

      {/* Footer */}
      <footer style={{
        padding: '16px 24px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.75rem',
        color: 'var(--text-dim)',
        margin: '0 20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>AetherGrid AI Intelligence Platform</span>
          <span>•</span>
          <span>Open-Meteo Satellite Reanalysis & High-Resolution Forecast Engine</span>
        </div>
        <div>
          <span>Multi-Asset Grid Synchronization Active (50/60 Hz nominal)</span>
        </div>
      </footer>

      {/* SCADA Export Modal */}
      <SCADAExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        siteId={selectedSiteId}
        siteName={currentSite?.name}
        dispatchTimeline={forecastData?.dispatch_timeline}
      />

    </div>
  );
}
