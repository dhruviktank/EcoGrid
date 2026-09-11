import React from 'react';
import { Zap, Sun, Wind, Activity, Download, Layers, Clock, Globe } from 'lucide-react';

export default function Header({
  sites,
  selectedSiteId,
  onSelectSite,
  horizonHours,
  onChangeHorizon,
  activeModel,
  onChangeModel,
  onOpenExport,
  weatherSource
}) {
  const currentSite = sites.find(s => s.id === selectedSiteId) || sites[0];

  return (
    <header className="glass-panel" style={{ padding: '14px 24px', margin: '16px 20px', borderBottom: '1px solid rgba(148, 163, 184, 0.15)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        
        {/* Left: Brand & Live status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(6, 182, 212, 0.4)'
          }}>
            <Zap size={24} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.02em', background: 'linear-gradient(to right, #f8fafc, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                AETHERGRID AI
              </span>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: '700',
                padding: '2px 8px',
                borderRadius: '9999px',
                background: 'rgba(6, 182, 212, 0.15)',
                color: '#22d3ee',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                letterSpacing: '0.05em'
              }}>
                v2.4 PRO
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span className="live-indicator"></span>
              <span>GRID STABILITY MONITOR</span>
              <span>•</span>
              <span style={{ color: '#38bdf8' }}>{weatherSource || 'Ingesting Open-Meteo Satellite Feed'}</span>
            </div>
          </div>
        </div>

        {/* Center: Plant Selector & Horizon Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Facility Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(30, 41, 59, 0.6)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <Globe size={16} color="#94a3b8" />
            <select
              value={selectedSiteId}
              onChange={(e) => onSelectSite(e.target.value)}
              style={{
                background: 'transparent',
                color: '#f8fafc',
                border: 'none',
                outline: 'none',
                fontWeight: '600',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id} style={{ background: '#0f172a', color: '#f8fafc' }}>
                  {site.name} ({site.capacity_mw} MW {site.type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Horizon Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(30, 41, 59, 0.6)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            {[24, 48, 72].map((hours) => (
              <button
                key={hours}
                onClick={() => onChangeHorizon(hours)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  background: horizonHours === hours ? '#0284c7' : 'transparent',
                  color: horizonHours === hours ? '#ffffff' : '#94a3b8',
                  boxShadow: horizonHours === hours ? '0 0 10px rgba(2, 132, 199, 0.5)' : 'none'
                }}
              >
                {hours}H
              </button>
            ))}
          </div>

          {/* Model Layer Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(30, 41, 59, 0.6)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <Layers size={15} color="#94a3b8" />
            <select
              value={activeModel}
              onChange={(e) => onChangeModel(e.target.value)}
              style={{
                background: 'transparent',
                color: '#f8fafc',
                border: 'none',
                outline: 'none',
                fontWeight: '500',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              <option value="ensemble" style={{ background: '#0f172a' }}>Hybrid Ensemble (P10/P50/P90)</option>
              <option value="xgboost" style={{ background: '#0f172a' }}>XGBoost Gradient Boost</option>
              <option value="lstm" style={{ background: '#0f172a' }}>PyTorch LSTM Recurrent NN</option>
              <option value="physics" style={{ background: '#0f172a' }}>Physical Irradiance/Aerodynamic</option>
            </select>
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={onOpenExport}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              color: '#22d3ee',
              fontWeight: '600',
              fontSize: '0.8rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.borderColor = '#22d3ee'}
            onMouseOut={(e) => e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.4)'}
          >
            <Download size={15} />
            <span>Export SCADA</span>
          </button>
        </div>

      </div>
    </header>
  );
}
