import React from 'react';
import { Sliders, RefreshCw, Zap, CloudLightning, Wind, Flame } from 'lucide-react';

export default function ScenarioSandbox({
  shocks,
  onChangeShocks,
  onApplyShocks,
  onResetShocks,
  isLoading
}) {
  const presets = [
    {
      name: 'Baseline Weather',
      icon: Zap,
      values: { cloud_multiplier: 1.0, wind_multiplier: 1.0, temp_delta: 0.0 }
    },
    {
      name: 'Sudden Cloud Front',
      icon: CloudLightning,
      values: { cloud_multiplier: 2.2, wind_multiplier: 1.2, temp_delta: -3.0 }
    },
    {
      name: 'Wind Stagnation (Dunkelflaute)',
      icon: Wind,
      values: { cloud_multiplier: 1.8, wind_multiplier: 0.35, temp_delta: -1.0 }
    },
    {
      name: 'Extreme Heatwave',
      icon: Flame,
      values: { cloud_multiplier: 0.5, wind_multiplier: 0.8, temp_delta: 12.0 }
    }
  ];

  return (
    <div className="glass-panel" style={{ padding: '20px 24px', flex: 1, minWidth: '320px' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sliders size={18} color="#f59e0b" />
          <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc' }}>
            Grid Stress-Testing & Shock Simulator
          </h3>
        </div>
        <button
          onClick={onResetShocks}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '0.75rem',
            cursor: 'pointer'
          }}
          onMouseOver={(e) => e.currentTarget.style.color = '#f8fafc'}
          onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          <RefreshCw size={12} />
          <span>Reset Shocks</span>
        </button>
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Inject weather anomalies to test grid resiliency, verify curtailment mitigation, and evaluate BESS buffer capacity.
      </p>

      {/* Preset Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '18px' }}>
        {presets.map((p, idx) => {
          const Icon = p.icon;
          const isActive = 
            shocks.cloud_multiplier === p.values.cloud_multiplier &&
            shocks.wind_multiplier === p.values.wind_multiplier &&
            shocks.temp_delta === p.values.temp_delta;

          return (
            <button
              key={idx}
              onClick={() => {
                onChangeShocks(p.values);
                onApplyShocks(p.values);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '8px',
                border: `1px solid ${isActive ? 'rgba(245, 158, 11, 0.5)' : 'var(--border-subtle)'}`,
                background: isActive ? 'rgba(245, 158, 11, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                color: isActive ? '#fbbf24' : '#cbd5e1',
                fontSize: '0.72rem',
                fontWeight: '600',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={14} color={isActive ? '#fbbf24' : '#94a3b8'} />
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>

      {/* Interactive Sliders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
        
        {/* Cloud Multiplier */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Cloud Cover Shock:</span>
            <span className="mono-num" style={{ color: '#38bdf8', fontWeight: '700' }}>{shocks.cloud_multiplier.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="2.5"
            step="0.1"
            value={shocks.cloud_multiplier}
            onChange={(e) => onChangeShocks({ ...shocks, cloud_multiplier: parseFloat(e.target.value) })}
          />
        </div>

        {/* Wind Multiplier */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Wind Speed Factor:</span>
            <span className="mono-num" style={{ color: '#06b6d4', fontWeight: '700' }}>{shocks.wind_multiplier.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="2.0"
            step="0.1"
            value={shocks.wind_multiplier}
            onChange={(e) => onChangeShocks({ ...shocks, wind_multiplier: parseFloat(e.target.value) })}
          />
        </div>

        {/* Temp Delta */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Ambient Temperature Delta:</span>
            <span className="mono-num" style={{ color: shocks.temp_delta > 0 ? '#f97316' : '#38bdf8', fontWeight: '700' }}>
              {shocks.temp_delta > 0 ? `+${shocks.temp_delta}°C` : `${shocks.temp_delta}°C`}
            </span>
          </div>
          <input
            type="range"
            min="-10"
            max="15"
            step="1"
            value={shocks.temp_delta}
            onChange={(e) => onChangeShocks({ ...shocks, temp_delta: parseFloat(e.target.value) })}
          />
        </div>

      </div>

      {/* Execute simulation button */}
      <button
        onClick={() => onApplyShocks(shocks)}
        disabled={isLoading}
        style={{
          width: '100%',
          padding: '10px',
          borderRadius: '8px',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(234, 88, 12, 0.25) 100%)',
          color: '#fbbf24',
          fontWeight: '700',
          fontSize: '0.8rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => e.currentTarget.style.borderColor = '#fbbf24'}
        onMouseOut={(e) => e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.4)'}
      >
        <Zap size={16} />
        <span>{isLoading ? 'Recalculating Physics & Dispatch...' : 'Run Scenario Shock Simulation'}</span>
      </button>

    </div>
  );
}
