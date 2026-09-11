import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, BatteryCharging, Power, TrendingUp, AlertTriangle, ShieldAlert } from 'lucide-react';

export default function GridActionsPanel({ criticalActions, dispatchTimeline, horizonHours }) {
  const [filter, setFilter] = useState('ALL');
  const [enactedActions, setEnactedActions] = useState({});

  // Filter dispatch timeline records with active actions
  const records = (dispatchTimeline || []).slice(0, horizonHours);
  
  // Extract all recommendations
  let allEvents = [];
  records.forEach((rec) => {
    if (rec.recommendations && rec.recommendations.length > 0) {
      rec.recommendations.forEach((r, idx) => {
        allEvents.push({
          id: `${rec.timestamp}_${idx}`,
          timestamp: rec.timestamp,
          status: rec.status,
          severity: rec.severity,
          type: r.type,
          title: r.title,
          description: r.description,
          net_load: rec.net_load_mw,
          gen_mw: rec.renewable_gen_mw,
          demand_mw: rec.demand_mw
        });
      });
    }
  });

  // Filter based on selected tab
  const filteredEvents = allEvents.filter((ev) => {
    if (filter === 'ALL') return true;
    if (filter === 'CURTAILMENT') return ev.type.includes('CURTAILMENT');
    if (filter === 'STORAGE') return ev.type.includes('STORAGE');
    if (filter === 'BACKUP') return ev.type.includes('BACKUP');
    return true;
  });

  const handleEnact = (id) => {
    setEnactedActions(prev => ({ ...prev, [id]: true }));
  };

  const getTypeIcon = (type) => {
    if (type.includes('CURTAILMENT')) return <AlertTriangle size={18} color="#ef4444" />;
    if (type.includes('BACKUP')) return <ShieldAlert size={18} color="#f97316" />;
    if (type.includes('STORAGE')) return <BatteryCharging size={18} color="#38bdf8" />;
    return <TrendingUp size={18} color="#10b981" />;
  };

  return (
    <div className="glass-panel" style={{ padding: '20px 24px', flex: 1, minWidth: '320px' }}>
      
      {/* Header & Filter Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Power size={18} color="#38bdf8" />
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc' }}>
              Grid Intelligence & Dispatch Recommendations
            </h3>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Automated grid stability alerts, BESS scheduling, and curtailment mitigation.
          </p>
        </div>

        {/* Filter Buttons */}
        <div style={{ display: 'flex', gap: '6px', background: 'rgba(30, 41, 59, 0.6)', padding: '4px', borderRadius: '8px' }}>
          {['ALL', 'STORAGE', 'CURTAILMENT', 'BACKUP'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.7rem',
                fontWeight: '700',
                cursor: 'pointer',
                background: filter === cat ? '#0284c7' : 'transparent',
                color: filter === cat ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s ease'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Action cards feed */}
      <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
        {filteredEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '0.85rem' }}>
            <CheckCircle2 size={32} color="#10b981" style={{ margin: '0 auto 8px auto', display: 'block' }} />
            No critical grid dispatch alerts for the current horizon. Grid frequency within nominal tolerances.
          </div>
        ) : (
          filteredEvents.map((ev) => {
            const isEnacted = enactedActions[ev.id];
            const isCritical = ev.severity === 'CRITICAL';
            const isWarning = ev.severity === 'WARNING';
            
            const borderColor = isCritical ? 'rgba(239, 68, 68, 0.4)' : isWarning ? 'rgba(249, 115, 22, 0.3)' : 'rgba(148, 163, 184, 0.15)';
            const bgGrad = isCritical ? 'rgba(239, 68, 68, 0.08)' : isWarning ? 'rgba(249, 115, 22, 0.06)' : 'rgba(30, 41, 59, 0.4)';

            return (
              <div
                key={ev.id}
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: bgGrad,
                  border: `1px solid ${borderColor}`,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ marginTop: '2px' }}>
                    {getTypeIcon(ev.type)}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f8fafc' }}>
                        {ev.title}
                      </span>
                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: '700',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: isCritical ? '#ef4444' : isWarning ? '#f97316' : '#38bdf8',
                        color: '#ffffff'
                      }}>
                        {ev.severity}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.75rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                      {ev.description}
                    </p>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      <span>Window: <strong style={{ color: '#f8fafc' }}>{ev.timestamp.replace('T', ' ').substring(5, 16)} UTC</strong></span>
                      <span>Gen: <strong style={{ color: '#f8fafc' }}>{ev.gen_mw} MW</strong></span>
                      <span>Demand: <strong style={{ color: '#f8fafc' }}>{ev.demand_mw} MW</strong></span>
                    </div>
                  </div>
                </div>

                {/* Enact Action Button */}
                <button
                  onClick={() => handleEnact(ev.id)}
                  disabled={isEnacted}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    border: 'none',
                    cursor: isEnacted ? 'default' : 'pointer',
                    background: isEnacted ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                    color: isEnacted ? '#34d399' : '#f8fafc',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isEnacted ? '✓ Enacted' : 'Enact Order'}
                </button>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
