import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/useApi';
import { electionsApi, geoApi } from '@/services/api';

const STATUS_BADGE = {
  DRAFT: 'badge-neutral',
  ACTIVE: 'badge-success',
  COLLATING: 'badge-warning',
  PUBLISHED: 'badge-info',
};

// Map Levels to their specific Election Types
const ELECTION_TYPES = {
  FEDERAL: ['PRESIDENT', 'SENATOR', 'HOUSE_OF_REPS'],
  STATE: ['GOVERNOR', 'STATE_ASSEMBLY'],
  LOCAL_GOVERNMENT: ['LGA_CHAIRMAN'],
  WARD: ['COUNCILLOR'],
};

export default function ElectionsPage() {
  const listApi = useApi(() => electionsApi.list().then(r => r.data.elections), [], { initial: [] });
  const statesApi = useApi(() => geoApi.states(), [], { initial: [] });

  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form State
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState('FEDERAL');
  const [type, setType] = useState('PRESIDENT');
  const [date, setDate] = useState('');
  
  // Geographic State
  const [stateCode, setStateCode] = useState('');
  const [lgaCode, setLgaCode] = useState('');
  const [wardCode, setWardCode] = useState('');

  // Geo Fetching
  const lgasApi = useApi(() => stateCode ? geoApi.lgas(stateCode) : Promise.resolve([]), [stateCode], { initial: [] });
  const wardsApi = useApi(() => lgaCode ? geoApi.wards(lgaCode) : Promise.resolve([]), [lgaCode], { initial: [] });

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const stateId = stateCode ? statesApi.data.find(s => s.code === stateCode)?._id : null;
      const lgaId = lgaCode ? lgasApi.data.find(l => l.code === lgaCode)?._id : null;
      const wardId = wardCode ? wardsApi.data.find(w => w.code === wardCode)?._id : null;

      await electionsApi.create({
        code, 
        title, 
        level,
        type, 
        electionDate: new Date(date).toISOString(),
        state: stateId,
        lga: lgaId,
        ward: wardId,
      });
      
      toast.success('Election created');
      setShowForm(false);
      setCode(''); setTitle(''); setDate(''); 
      setStateCode(''); setLgaCode(''); setWardCode('');
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
              <label className="label">Code (e.g. GOV-KT-2027)</label>
              <input required className="input" value={code} onChange={e => setCode(e.target.value)} />
            </div>

            <div>
              <label className="label">Level</label>
              <select className="input" value={level} onChange={e => {
                const newLevel = e.target.value;
                setLevel(newLevel);
                setType(ELECTION_TYPES[newLevel][0]); // Reset type to first option
              }}>
                <option value="FEDERAL">Federal</option>
                <option value="STATE">State</option>
                <option value="LOCAL_GOVERNMENT">Local Government</option>
                <option value="WARD">Ward</option>
              </select>
            </div>

            <div>
              <label className="label">Type</label>
              <select className="input" value={type} onChange={e => setType(e.target.value)}>
                {ELECTION_TYPES[level].map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Election Date</label>
              <input type="date" required className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>

            <div className="col-span-2">
              <label className="label">Title</label>
              <input required className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Katsina State Gubernatorial 2027" />
            </div>

            {/* Dynamic Geographic Selectors based on Level/Type */}
            {level !== 'FEDERAL' || type === 'SENATOR' ? (
              <div>
                <label className="label">State</label>
                <select required className="input" value={stateCode} onChange={e => setStateCode(e.target.value)}>
                  <option value="">Select State…</option>
                  {statesApi.data.map(s => <option key={s._id} value={s.code}>{s.name}</option>)}
                </select>
              </div>
            ) : null}

            {(level === 'LOCAL_GOVERNMENT' || level === 'WARD' || type === 'HOUSE_OF_REPS') && (
              <div>
                <label className="label">LGA</label>
                <select required className="input" value={lgaCode} onChange={e => setLgaCode(e.target.value)} disabled={!stateCode}>
                  <option value="">Select LGA…</option>
                  {lgasApi.data.map(l => <option key={l._id} value={l.code}>{l.name}</option>)}
                </select>
              </div>
            )}

            {level === 'WARD' && (
              <div>
                <label className="label">Ward</label>
                <select required className="input" value={wardCode} onChange={e => setWardCode(e.target.value)} disabled={!lgaCode}>
                  <option value="">Select Ward…</option>
                  {wardsApi.data.map(w => <option key={w._id} value={w.code}>{w.name}</option>)}
                </select>
              </div>
            )}

          </div>
          
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Creating…' : 'Create Election'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {listApi.data.map((el) => (
          <div key={el._id} className="card flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{el.title}</span>
                <span className={`badge ${STATUS_BADGE[el.status] || 'badge-neutral'}`}>{el.status}</span>
                <span className="badge-info">{el.type.replace(/_/g, ' ')}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{el.code} · {new Date(el.electionDate).toDateString()}</p>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500">Status:</label>
              <select 
                className="input py-1.5 text-sm max-w-[150px]"
                value={el.status}
                onChange={(e) => handleStatus(el._id, e.target.value)}
              >
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="COLLATING">COLLATING</option>
                <option value="PUBLISHED">PUBLISHED</option>
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}