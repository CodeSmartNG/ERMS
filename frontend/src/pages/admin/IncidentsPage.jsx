import { useMemo, useState } from 'react';
import { RefreshCw, AlertTriangle, X, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/useApi';
import { incidentsApi } from '@/services/api';

const SEVERITY_BADGE = {
  LOW: 'badge-info',
  MEDIUM: 'badge-warning',
  HIGH: 'badge-danger',
  CRITICAL: 'badge-danger',
};

const STATUS_BADGE = {
  OPEN: 'badge-warning',
  ACKNOWLEDGED: 'badge-info',
  INVESTIGATING: 'badge-info',
  RESOLVED: 'badge-success',
  DISMISSED: 'badge-neutral',
};

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { key: 'INVESTIGATING', label: 'Investigating' },
  { key: 'RESOLVED', label: 'Resolved' },
];

export default function IncidentsPage() {
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);

  const listApi = useApi(
    () => incidentsApi.list({ status: status || undefined, limit: 100 }).then((r) => r.data),
    [status],
    { pollMs: 20000, initial: { incidents: [] } }
  );

  const items = listApi.data?.incidents || [];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Incidents</h1>
          <p className="mt-1 text-sm text-slate-500">{items.length} incidents</p>
        </div>
        <button onClick={() => listApi.refetch()} className="btn-secondary p-2.5" aria-label="Refresh">
          <RefreshCw className={`h-4 w-4 ${listApi.loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              status === f.key
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="card p-12 text-center text-sm text-slate-500">
          {listApi.loading ? 'Loading…' : 'No incidents'}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((inc) => (
            <button
              key={inc._id}
              onClick={() => setSelected(inc)}
              className="card w-full p-4 text-left hover:border-brand-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={SEVERITY_BADGE[inc.severity] || 'badge-neutral'}>{inc.severity}</span>
                    <span className={STATUS_BADGE[inc.status] || 'badge-neutral'}>{inc.status}</span>
                    <span className="text-xs text-slate-500">{inc.type.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="mt-2 font-medium text-slate-900">{inc.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{inc.description}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {new Date(inc.occurredAt).toLocaleString()}
                    {inc.path?.length > 0 && ` · ${inc.path.join(' / ')}`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <IncidentDrawer
          incident={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => { setSelected(null); listApi.refetch(); }}
        />
      )}
    </div>
  );
}

function IncidentDrawer({ incident, onClose, onUpdated }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function transition(nextStatus) {
    if (!['RESOLVED', 'DISMISSED'].includes(nextStatus) || notes.trim()) {
      if (!notes.trim()) { toast.error('Notes are required for this transition'); return; }
    }
    setBusy(true);
    try {
      await incidentsApi.updateStatus(incident._id, nextStatus, notes.trim() || undefined);
      toast.success(`Incident ${nextStatus.toLowerCase()}`);
      onUpdated();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally { setBusy(false); }
  }

  const allowedNext = {
    OPEN: ['ACKNOWLEDGED', 'INVESTIGATING'],
    ACKNOWLEDGED: ['INVESTIGATING', 'RESOLVED', 'DISMISSED'],
    INVESTIGATING: ['RESOLVED', 'DISMISSED'],
    RESOLVED: [],
    DISMISSED: [],
  }[incident.status] || [];

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs text-slate-500">{incident.type.replace(/_/g, ' ')}</p>
            <h2 className="text-base font-semibold">{incident.title}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost -mr-2 p-2" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <span className={SEVERITY_BADGE[incident.severity]}>{incident.severity}</span>
            <span className={STATUS_BADGE[incident.status]}>{incident.status}</span>
          </div>

          <p className="whitespace-pre-wrap text-sm text-slate-700">{incident.description}</p>

          <div className="text-xs text-slate-500">
            <p>Reported: {new Date(incident.occurredAt).toLocaleString()}</p>
            <p>By: {incident.reporter?.firstName} {incident.reporter?.lastName} ({incident.reporterRole})</p>
            {incident.path?.length > 0 && <p>Location: {incident.path.join(' / ')}</p>}
          </div>

          {incident.evidence?.photos?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">Evidence ({incident.evidence.photos.length} photo{incident.evidence.photos.length !== 1 ? 's' : ''})</p>
              <div className="grid grid-cols-2 gap-2">
                {incident.evidence.photos.map((p, i) => (
                  <a key={i} href={p.url} target="_blank" rel="noreferrer" className="block">
                    <img src={p.url} alt="" className="aspect-square w-full rounded-lg object-cover hover:opacity-90" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {allowedNext.length > 0 && (
            <div className="space-y-3 border-t border-slate-200 pt-4">
              <div>
                <label className="label">Notes</label>
                <textarea
                  rows={3}
                  className="input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this transition"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {allowedNext.map((s) => (
                  <button
                    key={s}
                    onClick={() => transition(s)}
                    disabled={busy}
                    className={s === 'DISMISSED' ? 'btn-secondary' : 'btn-primary'}
                  >
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
