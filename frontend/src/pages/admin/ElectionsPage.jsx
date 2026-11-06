import { useState } from 'react';
import { Plus, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/useApi';
import { electionsApi } from '@/services/api';

const STATUS_BADGE = {
  DRAFT: 'badge-neutral',
  ACTIVE: 'badge-success',
  COLLATING: 'badge-warning',
  PUBLISHED: 'badge-info',
};

export default function ElectionsPage() {
  const listApi = useApi(() => electionsApi.list().then(r => r.data.elections), [], { initial: [] });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form state
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState('PRESIDENTIAL');
  const [date, setDate] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await electionsApi.create({
        code, title, type, 
        electionDate: new Date(date).toISOString()
      });
      toast.success('Election created');
      setShowForm(false);
      listApi.refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create');
    } finally { setBusy(false); }
  }

  async function handleStatus(id, status) {
    if (!confirm(`Change status to ${status}?`)) return;
    try {
      await electionsApi.updateStatus(id, status);
      toast.success(`Election is now ${status}`);
      listApi.refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Elections</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? <><X className="h-4 w-4" /> Cancel</> : <><Plus className="h-4 w-4" /> New Election</>}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-4 p-5">
          <h2 className="font-semibold">Create Election</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Code (e.g. PRES-2026)</label>
              <input required className="input" value={code} onChange={e => setCode(e.target.value)} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={type} onChange={e => setType(e.target.value)}>
                <option value="PRESIDENTIAL">Presidential</option>
                <option value="GUBERNATORIAL">Gubernatorial</option>
                <option value="SENATORIAL">Senatorial</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Title</label>
              <input required className="input" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Election Date</label>
              <input type="date" required className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Creating…' : 'Create Election'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {listApi.data.map((el) => (
          <div key={el._id} className="card flex items-center justify-between p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">{el.title}</span>
                <span className={STATUS_BADGE[el.status]}>{el.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{el.code} · {new Date(el.electionDate).toDateString()}</p>
            </div>
            <div className="flex gap-2">
              {el.status === 'DRAFT' && (
                <button onClick={() => handleStatus(el._id, 'ACTIVE')} className="btn-secondary text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Activate
                </button>
              )}
              {el.status === 'ACTIVE' && (
                <button onClick={() => handleStatus(el._id, 'COLLATING')} className="btn-secondary text-xs">
                  Start Collation
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
