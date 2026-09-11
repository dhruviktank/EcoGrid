import React from 'react';
import { BatteryCharging, Battery, Zap, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export default function BatteryStorageWidget({ site, dispatchTimeline, horizonHours }) {
  const records = (dispatchTimeline || []).slice(0, horizonHours);
  const latest = records[0] || {};
  const currentSocPct = latest.bess_soc_pct || 50;
  const currentSocMwh = latest.bess_soc_mwh || ((site?.bess_capacity_mwh || 500) * 0.5);
  const maxCapMwh = site?.bess_capacity_mwh || 500;
  const maxPowerMw = site?.bess_max_power_mw || 150;

  // Compute total throughput in horizon
  const totalCharged = records.reduce((sum, r) => sum + (r.bess_flow_mw < 0 ? Math.abs(r.bess_flow_mw) : 0), 0);
  const totalDischarged = records.reduce((sum, r) => sum + (r.bess_flow_mw > 0 ? r.bess_flow_mw : 0), 0);

  // Sparkline coordinates for SoC % trajectory
  const sparkWidth = 260;
  const sparkHeight = 50;
  const sparkPoints = records.map((r, i) => {
    const x = (i / Math.max(1, records.length - 1)) * sparkWidth;
    const y = sparkHeight - (r.bess_soc_pct / 100) * sparkHeight;
    return `${x},${y}`;
  });
  const sparkPath = `M ${sparkPoints.join(' L ')}`;

  // Battery color state
  const socColor = currentSocPct > 60 ? '#10b981' : currentSocPct > 25 ? '#38bdf8' : '#ef4444';

  return (
    <div className="glass-panel" style={{ padding: '20px 24px', flex: 1, minWidth: '300px' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BatteryCharging size={18} color="#38bdf8" />
          <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc' }}>
            BESS Storage Telemetry
          </h3>
        </div>
        <span style={{ fontSize: '0.7rem', color: '#38bdf8', background: 'rgba(6, 182, 212, 0.15)', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
          {maxCapMwh} MWh Capacity
        </span>
      </div>

      {/* Main SoC display */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '18px' }}>
        {/* Visual battery bar container */}
        <div style={{
          width: '54px',
          height: '90px',
          borderRadius: '8px',
          border: '2px solid rgba(148, 163, 184, 0.3)',
          padding: '4px',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column-reverse',
          background: 'rgba(15, 23, 42, 0.8)'
        }}>
          {/* Top battery cap */}
          <div style={{
            position: 'absolute',
            top: '-7px',
            left: '18px',
            width: '14px',
            height: '5px',
            background: 'rgba(148, 163, 184, 0.4)',
            borderRadius: '2px 2px 0 0'
          }}></div>
          
          {/* Fill level */}
          <div style={{
            width: '100%',
            height: `${Math.min(100, Math.max(5, currentSocPct))}%`,
            background: `linear-gradient(to top, ${socColor}, #38bdf8)`,
            borderRadius: '4px',
            boxShadow: `0 0 12px ${socColor}`,
            transition: 'height 0.4s ease'
          }}></div>
        </div>

        {/* Stats */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span className="mono-num" style={{ fontSize: '2.1rem', fontWeight: '800', color: '#f8fafc' }}>
              {currentSocPct}%
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>State of Charge</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <div>Stored Energy: <strong style={{ color: '#f8fafc' }}>{Math.round(currentSocMwh)} MWh</strong></div>
            <div>Max Inverter Rate: <strong style={{ color: '#f8fafc' }}>±{maxPowerMw} MW</strong></div>
            <div>Round-Trip Efficiency: <strong style={{ color: '#10b981' }}>90%</strong></div>
          </div>
        </div>
      </div>

      {/* SoC Horizon Sparkline */}
      <div style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
          <span>{horizonHours}H SoC Trajectory</span>
          <span style={{ color: '#38bdf8' }}>{records[records.length - 1]?.bess_soc_pct || 50}% Final</span>
        </div>
        <svg viewBox={`0 0 ${sparkWidth} ${sparkHeight}`} style={{ width: '100%', height: '40px', overflow: 'visible' }}>
          <path
            d={sparkPath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
          />
        </svg>
      </div>

      {/* Charge vs Discharge Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
        <div style={{ background: 'rgba(6, 182, 212, 0.08)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#38bdf8', marginBottom: '2px' }}>
            <ArrowDownLeft size={14} />
            <span>Total Absorbed</span>
          </div>
          <div className="mono-num" style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc' }}>
            {Math.round(totalCharged)} MWh
          </div>
        </div>

        <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#34d399', marginBottom: '2px' }}>
            <ArrowUpRight size={14} />
            <span>Total Dispatched</span>
          </div>
          <div className="mono-num" style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc' }}>
            {Math.round(totalDischarged)} MWh
          </div>
        </div>
      </div>

    </div>
  );
}
