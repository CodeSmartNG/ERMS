import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, RefreshCw, Trash2, CheckCircle2, 
  AlertCircle, Clock, Image as ImageIcon 
} from 'lucide-react';
import { listQueue, removeFromQueue, QUEUE_STATUS } from '@/services/offlineQueue';
import { flushQueue } from '@/services/syncService';

export default function OfflineQueuePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const all = await listQueue();
    setItems(all.sort((a, b) => b.createdAt - a.createdAt));
  }, []);

  // Initial load + auto-refresh every 3 seconds
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  async function onFlush() {
    setRefreshing(true);
    try { 
      await flushQueue(); 
    } finally { 
      await refresh(); 
      setRefreshing(false); 
    }
  }

  async function onDelete(localId) {
    if (!confirm('Delete this queued submission? It will not be sent.')) return;
    await removeFromQueue(localId);
    refresh();
  }

  const pendingCount = items.filter(i => i.status === QUEUE_STATUS.PENDING).length;
  const failedCount = items.filter(i => i.status === QUEUE_STATUS.FAILED).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <button onClick={() => navigate(-1)} className="btn-ghost -ml-2 p-2">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold">Submission queue</h1>
          <p className="text-xs text-slate-500">
            {pendingCount} pending · {failedCount} failed
          </p>
        </div>
        <button 
          onClick={onFlush} 
          disabled={refreshing} 
          className="btn-ghost p-2" 
          aria-label="Retry all"
        >
          <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <main className="mx-auto max-w-xl space-y-3 px-5 py-6">
        {items.length === 0 ? (
          <div className="card p-8 text-center text-sm text-slate-500">
            Queue is empty. All submissions have been sent.
          </div>
        ) : (
          items.map((r) => <QueueCard key={r.localId} record={r} onDelete={onDelete} />)
        )}
      </main>
    </div>
  );
}

function QueueCard({ record, onDelete }) {
  const cfg = {
    [QUEUE_STATUS.PENDING]:  { icon: Clock,          tone: 'text-amber-600',  bg: 'bg-amber-50',   label: 'Pending' },
    [QUEUE_STATUS.SENDING]:  { icon: RefreshCw,      tone: 'text-blue-600',   bg: 'bg-blue-50',    label: 'Sending' },
    [QUEUE_STATUS.SENT]:     { icon: CheckCircle2,   tone: 'text-green-600',  bg: 'bg-green-50',   label: 'Sent' },
    [QUEUE_STATUS.FAILED]:   { icon: AlertCircle,    tone: 'text-red-600',    bg: 'bg-red-50',     label: 'Failed' },
  }[record.status] || { icon: Clock, tone: 'text-slate-500', bg: 'bg-slate-50', label: record.status };

  const Icon = cfg.icon;
  const kindLabel = record.kind === 'result' ? 'Result' : 'Incident';
  
  // Count evidence files
  const fileCount = record.evidenceFiles?.length || (record.evidenceBlob ? 1 : 0);
  
  // Get server ID (for results it's response.result._id, for incidents it's response.incident._id)
  const serverId = record.serverResponse?.result?._id || record.serverResponse?.incident?._id;

  return (
    <div className={`card p-4 ${record.status === QUEUE_STATUS.SENDING ? 'border-blue-200' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${cfg.bg}`}>
          <Icon className={`h-5 w-5 ${cfg.tone} ${record.status === QUEUE_STATUS.SENDING ? 'animate-spin' : ''}`} />
        </div>
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">{kindLabel}</p>
            <span className={`text-xs font-medium ${cfg.tone}`}>{cfg.label}</span>
          </div>
          
          <p className="mt-1 text-xs text-slate-500">
            {new Date(record.createdAt).toLocaleString()}
            {record.attempts > 0 && ` · ${record.attempts} attempt${record.attempts !== 1 ? 's' : ''}`}
          </p>
          
          {fileCount > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <ImageIcon className="h-3 w-3" />
              {fileCount} photo{fileCount !== 1 ? 's' : ''}
            </p>
          )}
          
          {record.lastError && (
            <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
              {record.lastError}
            </p>
          )}
          
          {serverId && (
            <p className="mt-2 font-mono text-xs text-slate-400">
              Server ID: {serverId}
            </p>
          )}
        </div>
        
        {record.status !== QUEUE_STATUS.SENT && record.status !== QUEUE_STATUS.SENDING && (
          <button 
            onClick={() => onDelete(record.localId)} 
            className="btn-ghost -mr-2 p-2 text-slate-400 hover:text-red-600" 
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
