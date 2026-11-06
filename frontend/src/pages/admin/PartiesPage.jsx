import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/useApi';
import { partiesApi } from '@/services/api';

export default function PartiesPage() {
  const listApi = useApi(() => partiesApi.list().then(r => r.data.parties), [], { initial: [] });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await partiesApi.create({ code, name, abbreviation });
      toast.success('Party created');
      setShowForm(false);
      listApi.refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create');
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Political Parties</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? <><X className="h-4 w-4" /> Cancel</> : <><Plus className="h-4 w-4" /> Add Party</>}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-4 p-5">
          <h2 className="font-semibold">Add Party</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Code (e.g. APC)</label>
              <input required className="input" value={code} onChange={e => setCode(e.target.value)} />
            </div>
            <div>
              <label className="label">Abbreviation</label>
              <input required className="input" value={abbreviation} onChange={e => setAbbreviation(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Full Name</label>
              <input required className="input" value={name} onChange={e => setName(e.target.value)} />
            </div>
          </div>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : 'Save Party'}
          </button>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Code</th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {listApi.data.map((p) => (
              <tr key={p._id}>
                <td className="px-4 py-3 font-semibold text-slate-900">{p.code}</td>
                <td className="px-4 py-3 text-slate-600">{p.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
