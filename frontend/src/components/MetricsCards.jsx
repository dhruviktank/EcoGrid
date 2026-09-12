import React from 'react';
import { 
  Sun, Wind, BatteryCharging, AlertTriangle, Leaf, DollarSign, TrendingUp, 
  ShieldCheck, Award, Clock, Activity, Zap 
} from 'lucide-react';

export default function MetricsCards({ 
  summary, 
  site, 
  forecastTimeline, 
  horizonHours, 
  persona = 'operator',
  skillScorePct = 38.5
}) {
  if (!summary) return null;

  const horizonRecords = (forecastTimeline || []).slice(0, horizonHours);
  const peakGenMw = horizonRecords.reduce((max, r) => Math.max(max, r.generation?.total_p50_mw || 0), 0);
  const avgCapacityFactor = horizonRecords.length > 0 
    ? (horizonRecords.reduce((sum, r) => sum + (r.generation?.capacity_factor || 0), 0) / horizonRecords.length * 100).toFixed(1)
    : '0.0';

  const opMetrics = summary.operator || {};
  const plMetrics = summary.planner || {};
  const trMetrics = summary.trader || {};

  let cards = [];

  if (persona === 'operator') {
    cards = [
      {
        title: 'FORECAST SKILL SCORE',
        value: `+${skillScorePct.toFixed(1)}%`,
        sub: 'Outperforms Persistence Benchmark',
        icon: Award,
        accent: '#38bdf8',
        bgGlow: 'rgba(56, 189, 248, 0.12)'
      },
      {
        title: 'SCHEDULED GENERATION (P50)',
        value: `${horizonRecords[0]?.generation?.total_p50_mw?.toFixed(1) || peakGenMw.toFixed(1)} MW`,
        sub: `Capacity: ${site?.capacity_mw} MW • Peak: ${peakGenMw.toFixed(1)} MW`,
        icon: site?.type === 'wind' ? Wind : site?.type === 'solar' ? Sun : Zap,
        accent: site?.type === 'wind' ? '#06b6d4' : '#f59e0b',
        bgGlow: 'rgba(245, 158, 11, 0.1)'
      },
      {
        title: 'BESS BATTERY TELEMETRY',
        value: `${opMetrics.current_bess_soc_pct || 50}% SoC`,
        sub: `Capacity: ${site?.bess_capacity_mwh || 600} MWh • Max Inverter: ${site?.bess_max_power_mw || 150} MW`,
        icon: BatteryCharging,
        accent: '#10b981',
        bgGlow: 'rgba(16, 185, 129, 0.1)'
      },
      {
        title: 'IMMEDIATE GRID RISK',
        value: `${opMetrics.immediate_alert_count || 0} Action Order(s)`,
        sub: summary.total_curtailed_mwh > 0 ? `Curtailment: ${summary.total_curtailed_mwh.toFixed(1)} MWh flagged` : 'Grid balance nominal',
        icon: AlertTriangle,
        accent: (opMetrics.immediate_alert_count || 0) > 0 ? '#ef4444' : '#10b981',
        bgGlow: (opMetrics.immediate_alert_count || 0) > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.1)'
      },
      {
        title: 'PEAKER DISPATCH LEAD TIME',
        value: opMetrics.next_peaker_lead_time || 'Nominal',
        sub: `${summary.peaker_energy_mwh || 0} MWh backup deficit window`,
        icon: Clock,
        accent: summary.peaker_energy_mwh > 0 ? '#f97316' : '#10b981',
        bgGlow: summary.peaker_energy_mwh > 0 ? 'rgba(249, 115, 22, 0.12)' : 'rgba(16, 185, 129, 0.1)'
      }
    ];
  } else if (persona === 'planner') {
    cards = [
      {
        title: '72H TOTAL CLEAN OUTPUT',
        value: `${summary.total_clean_gen_mwh?.toLocaleString()} MWh`,
        sub: `Average Capacity Factor: ${avgCapacityFactor}%`,
        icon: site?.type === 'wind' ? Wind : Sun,
        accent: '#06b6d4',
        bgGlow: 'rgba(6, 182, 212, 0.12)'
      },
      {
        title: 'GRID RESOURCE ADEQUACY',
        value: `${plMetrics.reserve_margin_pct || 94.2}%`,
        sub: `Reliability Index: ${plMetrics.grid_reliability_index || '99.8%'}`,
        icon: ShieldCheck,
        accent: '#10b981',
        bgGlow: 'rgba(16, 185, 129, 0.12)'
      },
      {
        title: 'AVOIDED CURTAILMENT (BESS)',
        value: `${summary.avoided_curtailment_mwh || 0} MWh`,
        sub: `${plMetrics.curtailment_hours_avoided || 0} curtailment hours eliminated`,
        icon: BatteryCharging,
        accent: '#38bdf8',
        bgGlow: 'rgba(56, 189, 248, 0.12)'
      },
      {
        title: 'PEAKER ACTIVATION HOURS',
        value: `${plMetrics.peaker_activation_hours || 0} Hours`,
        sub: `${summary.peaker_energy_mwh || 0} MWh peaker energy dispatched`,
        icon: Clock,
        accent: (plMetrics.peaker_activation_hours || 0) > 0 ? '#f97316' : '#10b981',
        bgGlow: (plMetrics.peaker_activation_hours || 0) > 0 ? 'rgba(249, 115, 22, 0.12)' : 'rgba(16, 185, 129, 0.1)'
      },
      {
        title: 'EMISSIONS ABATED',
        value: `${summary.co2_avoided_tons?.toLocaleString()} t CO₂`,
        sub: 'Displacing combined-cycle gas turbine baseline',
        icon: Leaf,
        accent: '#10b981',
        bgGlow: 'rgba(16, 185, 129, 0.12)'
      }
    ];
  } else {
    // Trader Persona
    cards = [
      {
        title: 'VOLUME AT RISK (P90 - P10)',
        value: `${trMetrics.volume_at_risk_mwh?.toLocaleString()} MWh`,
        sub: 'Uncertainty band spread across horizon',
        icon: TrendingUp,
        accent: '#f59e0b',
        bgGlow: 'rgba(245, 158, 11, 0.12)'
      },
      {
        title: 'FIRM DAY-AHEAD VOLUME',
        value: `${trMetrics.firm_day_ahead_mwh?.toLocaleString()} MWh`,
        sub: 'P10 Lower Bound Guaranteed Schedule',
        icon: ShieldCheck,
        accent: '#10b981',
        bgGlow: 'rgba(16, 185, 129, 0.12)'
      },
      {
        title: 'INTRADAY UPSIDE HEADROOM',
        value: `${trMetrics.upside_potential_mwh?.toLocaleString()} MWh`,
        sub: 'P90 Spread available for imbalance markets',
        icon: Zap,
        accent: '#38bdf8',
        bgGlow: 'rgba(56, 189, 248, 0.12)'
      },
      {
        title: 'MODEL FORECAST EDGE',
        value: `+${skillScorePct.toFixed(1)}% Skill`,
        sub: 'Alpha over persistence market pricing',
        icon: Award,
        accent: '#8b5cf6',
        bgGlow: 'rgba(139, 92, 246, 0.12)'
      },
      {
        title: 'CURTAILMENT RISK EXPOSURE',
        value: `${trMetrics.market_curtailment_exposure_pct || 0}%`,
        sub: `${summary.total_curtailed_mwh || 0} MWh negative pricing risk`,
        icon: AlertTriangle,
        accent: (trMetrics.market_curtailment_exposure_pct || 0) > 5 ? '#ef4444' : '#10b981',
        bgGlow: (trMetrics.market_curtailment_exposure_pct || 0) > 5 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.1)'
      }
    ];
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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
              background: `linear-gradient(145deg, rgba(15, 23, 42, 0.85) 0%, ${card.bgGlow} 100%)`,
              border: '1px solid rgba(148, 163, 184, 0.12)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: '800', letterSpacing: '0.06em', color: '#94a3b8' }}>
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

            <div style={{ fontSize: '0.73rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {card.sub}
            </div>
          </div>
        );
      })}
    </div>
  );
}
