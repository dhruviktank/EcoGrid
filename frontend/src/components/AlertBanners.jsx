import React, { useState } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Zap, 
  Clock, 
  ArrowRight, 
  ChevronLeft, 
  ChevronRight, 
  Check,
  Power
} from 'lucide-react';

export default function AlertBanners({ alerts = [], onSelectHour }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [enactedAlerts, setEnactedAlerts] = useState({});

  if (!alerts || alerts.length === 0) {
    return (
      <div 
        className="glass-panel" 
        style={{
          margin: '0 20px 16px 20px',
          padding: '14px 20px',
          borderRadius: '10px',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <CheckCircle2 size={22} color="#10b981" />
          <div>
            <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f8fafc' }}>
              Grid Operating in Nominal Equilibrium
            </div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
              Forecast envelope [P10 – P90] satisfies regional demand safely within BESS operating parameters.
            </div>
          </div>
        </div>
        <div style={{ 
          fontSize: '0.72rem', 
          fontWeight: '700', 
          color: '#34d399', 
          background: 'rgba(16, 185, 129, 0.15)', 
          padding: '4px 10px', 
          borderRadius: '6px',
          border: '1px solid rgba(16, 185, 129, 0.25)' 
        }}>
          0 Active Alerts
        </div>
      </div>
    );
  }

  const activeAlert = alerts[currentIndex] || alerts[0];
  const isCritical = activeAlert.severity === 'CRITICAL';
  const isWarning = activeAlert.severity === 'WARNING';
  const isCurtailment = activeAlert.type?.includes('CURTAILMENT');
  const isBackup = activeAlert.type?.includes('BACKUP');
  const isEnacted = Boolean(enactedAlerts[activeAlert.id || currentIndex]);

  const borderColor = isCritical 
    ? 'rgba(239, 68, 68, 0.5)' 
    : isWarning 
    ? 'rgba(249, 115, 22, 0.5)' 
    : 'rgba(16, 185, 129, 0.4)';

  const bgGradient = isCritical 
    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)' 
    : isWarning 
    ? 'linear-gradient(135deg, rgba(249, 115, 22, 0.14) 0%, rgba(15, 23, 42, 0.85) 100%)' 
    : 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)';

  const badgeBg = isCritical ? '#ef4444' : isWarning ? '#f97316' : '#10b981';

  const handleEnact = (id) => {
    setEnactedAlerts(prev => ({ ...prev, [id]: true }));
  };

  const nextAlert = () => {
    setCurrentIndex((prev) => (prev + 1) % alerts.length);
  };

  const prevAlert = () => {
    setCurrentIndex((prev) => (prev - 1 + alerts.length) % alerts.length);
  };

  return (
    <div 
      className="glass-panel" 
      style={{
        margin: '0 20px 16px 20px',
        padding: '16px 22px',
        borderRadius: '12px',
        background: bgGradient,
        border: `1px solid ${borderColor}`,
        boxShadow: isCritical ? '0 8px 30px rgba(239, 68, 68, 0.15)' : '0 6px 24px rgba(0, 0, 0, 0.25)',
        transition: 'all 0.25s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        
        {/* Left Icon & Alert Details */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1, minWidth: '280px' }}>
          
          <div style={{
            marginTop: '2px',
            padding: '10px',
            borderRadius: '10px',
            background: isCritical ? 'rgba(239, 68, 68, 0.2)' : isWarning ? 'rgba(249, 115, 22, 0.2)' : 'rgba(16, 185, 129, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {isCurtailment ? (
              <AlertTriangle size={22} color={isCritical ? "#ef4444" : "#f97316"} />
            ) : isBackup ? (
              <Zap size={22} color={isCritical ? "#ef4444" : "#f97316"} />
            ) : (
              <ShieldAlert size={22} color="#10b981" />
            )}
          </div>

          <div style={{ flex: 1 }}>
            
            {/* Header badges */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '2px 8px',
                borderRadius: '4px',
                background: badgeBg,
                color: '#ffffff'
              }}>
                {activeAlert.severity} {activeAlert.type?.replace('_ALERT', '')}
              </span>

              {activeAlert.lead_time_hours > 0 && (
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: '700',
                  color: '#fbbf24',
                  background: 'rgba(251, 191, 36, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(251, 191, 36, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <Clock size={11} />
                  {activeAlert.lead_time_hours}h Lead Time Notice
                </span>
              )}

              {activeAlert.timestamp && (
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                  Target Window: <strong style={{ color: '#f8fafc' }}>{activeAlert.timestamp.replace('T', ' ').substring(5, 16)} UTC</strong>
                </span>
              )}
            </div>

            {/* Alert Title */}
            <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc', margin: '2px 0 4px 0' }}>
              {activeAlert.title}
            </h4>

            {/* Alert Description (Physical Rule Trigger) */}
            <p style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: '1.45', margin: '0 0 10px 0' }}>
              {activeAlert.description}
            </p>

            {/* Recommended Action Callout Pill */}
            {activeAlert.recommended_action && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                fontSize: '0.76rem'
              }}>
                <span style={{ color: '#38bdf8', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.04em' }}>
                  Recommended Action:
                </span>
                <span style={{ color: '#f1f5f9', fontWeight: '600' }}>
                  {activeAlert.recommended_action}
                </span>
              </div>
            )}

          </div>
        </div>

        {/* Right Action Controls & Pager */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: '10px' }}>
          
          {/* Enact Action Button */}
          <button
            onClick={() => handleEnact(activeAlert.id || currentIndex)}
            disabled={isEnacted}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: '700',
              border: isEnacted ? '1px solid rgba(52, 211, 153, 0.4)' : 'none',
              cursor: isEnacted ? 'default' : 'pointer',
              background: isEnacted 
                ? 'rgba(16, 185, 129, 0.25)' 
                : isCritical 
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: isEnacted ? '#34d399' : '#ffffff',
              boxShadow: isEnacted ? 'none' : '0 4px 14px rgba(0, 0, 0, 0.35)',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            {isEnacted ? (
              <>
                <Check size={14} />
                <span>Enacted to SCADA</span>
              </>
            ) : (
              <>
                <Power size={14} />
                <span>Enact Recommended Action</span>
              </>
            )}
          </button>

          {/* Alert Pager if multiple alerts */}
          {alerts.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: '#94a3b8' }}>
              <span>Alert {currentIndex + 1} of {alerts.length}</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={prevAlert}
                  style={{
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '4px',
                    padding: '3px 6px',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Previous Alert"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={nextAlert}
                  style={{
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '4px',
                    padding: '3px 6px',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Next Alert"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
