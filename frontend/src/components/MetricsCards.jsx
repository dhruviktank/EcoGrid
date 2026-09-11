import React from 'react';
import { Sun, Wind, BatteryCharging, AlertTriangle, Leaf, DollarSign, TrendingUp, ShieldCheck } from 'lucide-react';

export default function MetricsCards({ summary, site, forecastTimeline, horizonHours }) {
  if (!summary) return null;

  // Compute peak generation in horizon
  const horizonRecords = (forecastTimeline || []).slice(0, horizonHours);
  const peakGenMw = horizonRecords.reduce((max, r) => Math.max(max, r.generation?.total_p50_mw || 0), 0);
  const avgCapacityFactor = horizonRecords.length > 0 
    ? (horizonRecords.reduce((sum, r) => sum + (r.generation?.capacity_factor || 0), 0) / horizonRecords.length * 100).toFixed(1)
    : '0.0';

  const cards = [
    {
      title: 'TOTAL PROJECTED OUTPUT',
      value: `${summary.total_clean_gen_mwh?.toLocaleString()} MWh`,
      sub: `Peak: ${peakGenMw.toFixed(1)} MW • Avg CF: ${avgCapacityFactor}%`,
      icon: site?.type === 'wind' ? Wind : site?.type === 'solar' ? Sun : TrendingUp,
      accent: site?.type === 'wind' ? '#06b6d4' : site?.type === 'solar' ? '#f59e0b' : '#10b981',
      bgGlow: site?.type === 'wind' ? 'rgba(6, 182, 212, 0.1)' : 'rgba(245, 158, 11, 0.1)'
    },
    {
      title: 'BESS STORAGE DISPATCH',
      value: `${summary.bess_discharged_mwh?.toLocaleString()} MWh`,
      sub: `Capacity: ${site?.bess_capacity_mwh || 500} MWh • Max Rate: ${site?.bess_max_power_mw || 150} MW`,
      icon: BatteryCharging,
      accent: '#38bdf8',
      bgGlow: 'rgba(56, 189, 248, 0.1)'
    },
    {
      title: 'CURTAILMENT RISK',
      value: `${summary.total_curtailed_mwh?.toFixed(1)} MWh`,
      sub: `${summary.curtailment_rate_pct}% of total gen • ${summary.curtailment_incidents_count} event(s) flagged`,
      icon: AlertTriangle,
      accent: summary.total_curtailed_mwh > 0 ? '#ef4444' : '#10b981',
      bgGlow: summary.total_curtailed_mwh > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)'
    },
    {
      title: 'BACKUP PEAKER REQUIRED',
      value: `${summary.peaker_backup_required_mwh?.toFixed(1)} MWh`,
      sub: `${summary.peaker_alerts_count} deficit window(s) flagged`,
      icon: ShieldCheck,
      accent: summary.peaker_backup_required_mwh > 0 ? '#f97316' : '#10b981',
      bgGlow: summary.peaker_backup_required_mwh > 0 ? 'rgba(249, 115, 22, 0.1)' : 'rgba(16, 185, 129, 0.1)'
    },
    {
      title: 'CARBON AVOIDANCE & VALUE',
      value: `${summary.co2_avoided_tons?.toLocaleString()} t CO₂`,
      sub: `+$${summary.estimated_value_unlocked_usd?.toLocaleString()} unlocked grid value`,
      icon: Leaf,
      accent: '#10b981',
      bgGlow: 'rgba(16, 185, 129, 0.1)'
    }
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
      gap: '16px',
      margin: '0 20px 20px 20px'
    }}>
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="glass-panel"
            style={{
              padding: '18px 20px',
              position: 'relative',
              overflow: 'hidden',
              background: `linear-gradient(145deg, rgba(15, 23, 42, 0.8) 0%, ${card.bgGlow} 100%)`
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                {card.title}
              </span>
              <div style={{
                padding: '6px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                color: card.accent
              }}>
                <Icon size={18} />
              </div>
            </div>
            
            <div className="mono-num" style={{ fontSize: '1.45rem', fontWeight: '800', color: '#f8fafc', marginBottom: '4px' }}>
              {card.value}
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {card.sub}
            </div>
          </div>
        );
      })}
    </div>
  );
}
