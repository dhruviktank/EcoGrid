import React, { useState } from 'react';
import { X, Download, FileText, Check } from 'lucide-react';

export default function SCADAExportModal({ isOpen, onClose, siteId, siteName, dispatchTimeline }) {
  const [format, setFormat] = useState('csv');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const rows = (dispatchTimeline || []).map((d) => ({
    timestamp: d.timestamp,
    demand_mw: d.demand_mw,
    scheduled_renewable_p50_mw: d.renewable_gen_mw,
    bess_dispatch_mw: d.bess_flow_mw,
    curtailment_mw: d.curtailment_mw,
    peaker_backup_mw: d.peaker_backup_mw,
    bess_soc_pct: d.bess_soc_pct,
    grid_status: d.status
  }));

  const generateCSV = () => {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]).join(',');
    const body = rows.map(r => Object.values(r).join(',')).join('\n');
    return `${headers}\n${body}`;
  };

  const handleDownload = () => {
    let content = '';
    let mime = '';
    let ext = '';

    if (format === 'csv') {
      content = generateCSV();
      mime = 'text/csv';
      ext = 'csv';
    } else {
      content = JSON.stringify({ site: siteName, site_id: siteId, export_timestamp: new Date().toISOString(), schedule: rows }, null, 2);
      mime = 'application/json';
      ext = 'json';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SCADA_Dispatch_Schedule_${siteId}_72H.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    const text = format === 'csv' ? generateCSV() : JSON.stringify(rows.slice(0, 10), null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(3, 7, 18, 0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100
    }}>
      <div className="glass-panel glow-cyan" style={{
        width: '90%',
        maxWidth: '640px',
        padding: '24px 28px',
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid rgba(6, 182, 212, 0.3)',
        borderRadius: '16px'
      }}>
        
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid rgba(148, 163, 184, 0.15)', paddingBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#f8fafc' }}>
              Export SCADA Dispatch Order Schedule
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Compliant with IEC 60870-5 and IEEE 1815 grid control standards.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Format Switcher */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          {['csv', 'json'].map((fmt) => (
            <button
              key={fmt}
              onClick={() => setFormat(fmt)}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: `1px solid ${format === fmt ? '#06b6d4' : 'var(--border-subtle)'}`,
                background: format === fmt ? 'rgba(6, 182, 212, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                color: format === fmt ? '#22d3ee' : '#94a3b8',
                fontWeight: '700',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              {fmt.toUpperCase()} Schedule Format
            </button>
          ))}
        </div>

        {/* Schedule preview table */}
        <div style={{
          maxHeight: '220px',
          overflowY: 'auto',
          background: 'rgba(3, 7, 18, 0.6)',
          borderRadius: '8px',
          padding: '12px',
          border: '1px solid var(--border-subtle)',
          marginBottom: '20px'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
            <thead>
              <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(148, 163, 184, 0.15)', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>Timestamp</th>
                <th style={{ padding: '6px 8px' }}>Renewable MW</th>
                <th style={{ padding: '6px 8px' }}>Demand MW</th>
                <th style={{ padding: '6px 8px' }}>BESS MW</th>
                <th style={{ padding: '6px 8px' }}>Curtail MW</th>
                <th style={{ padding: '6px 8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 6).map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.08)', color: '#f8fafc' }} className="mono-num">
                  <td style={{ padding: '6px 8px' }}>{r.timestamp.substring(11, 16)} UTC</td>
                  <td style={{ padding: '6px 8px', color: '#22d3ee' }}>{r.scheduled_renewable_p50_mw}</td>
                  <td style={{ padding: '6px 8px', color: '#c084fc' }}>{r.demand_mw}</td>
                  <td style={{ padding: '6px 8px', color: '#38bdf8' }}>{r.bess_dispatch_mw}</td>
                  <td style={{ padding: '6px 8px', color: r.curtailment_mw > 0 ? '#ef4444' : '#10b981' }}>{r.curtailment_mw}</td>
                  <td style={{ padding: '6px 8px' }}>{r.grid_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.65rem', marginTop: '8px' }}>
            + {rows.length - 6} more hourly dispatch records
          </div>
        </div>

        {/* Modal Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={handleCopy}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid var(--border-subtle)',
              color: '#f8fafc',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {copied ? <Check size={14} color="#10b981" /> : <FileText size={14} />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy Sample'}</span>
          </button>

          <button
            onClick={handleDownload}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
              border: 'none',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 0 15px rgba(6, 182, 212, 0.4)'
            }}
          >
            <Download size={14} />
            <span>Download {format.toUpperCase()}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
