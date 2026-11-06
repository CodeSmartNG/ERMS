import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/useApi';
import { electionsApi, partiesApi, candidatesApi } from '@/services/api';

export default function CandidatesPage() {
  const electionsApiRes = useApi(() => electionsApi.list().then(r => r.data.elections), [], { initial: [] });
  const partiesApiRes = useApi(() => partiesApi.list().then(r => r.data.parties), [], { initial: [] });
  
  const [electionId, setElectionId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);

  const candidatesApiRes = useApi(
    () => electionId ? candidatesApi.list(electionId).then(r => r.data.candidates) : Promise.resolve([]),
    [electionId],
    { initial: [] }
  );

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await candidatesApi.create({ election: electionId, party: partyId, firstName, lastName });
      toast.success('Candidate added');
      setFirstName(''); setLastName('');
      candidatesApiRes.refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add candidate');
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900">Candidates</h1>
      
      <div className="card p-4">
        <label className="label">Select Election to view/add candidates</label>
        <select className="input max-w-md" value={electionId} onChange={e => setElectionId(e.target.value)}>
          <option value="">Select election…</option>
          {electionsApiRes.data.map(el => <option key={el._id} value={el._id}>{el.title}</option>)}
        </select>
      </div>

      {electionId && (
        <>
          <form onSubmit={handleCreate} className="card space-y-4 p-5">
            <h2 className="font-semibold">Add Candidate</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Party</label>
                <select required className="input" value={partyId} onChange={e => setPartyId(e.target.value)}>
                  <option value="">Select party…</option>
                  {partiesApiRes.data.map(p => <option key={p._id} value={p._id}>{p.code} - {p.name}</option>)}
                </select>
              </div>
              <div />
              <div>
                <label className="label">First Name</label>
                <input required className="input" value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div>
                <label className="label">Last Name</label>
                <input required className="input" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>
            <button type="submit" disabled={busy || !partyId} className="btn-primary">
              {busy ? 'Saving…' : 'Save Candidate'}
            </button>
          </form>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Candidate</th>
                  <th className="px-4 py-3 text-left font-medium">Party</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidatesApiRes.data.map(c => (
                  <tr key={c._id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{c.firstName} {c.lastName}</td>
                    <td className="px-4 py-3 text-slate-600">{c.party.code} ({c.party.name})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
