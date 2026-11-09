import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/useApi';
import { electionsApi, partiesApi, candidatesApi } from '@/services/api';

export default function CandidatesPage() {
  // Safely access data with a fallback to empty arrays
  const electionsApiRes = useApi(() => electionsApi.list().then(r => r.data.elections || []), [], { initial: [] });
  const partiesApiRes = useApi(() => partiesApi.list().then(r => r.data.parties || []), [], { initial: [] });
  
  const [electionId, setElectionId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);

  const candidatesApiRes = useApi(
    () => electionId ? candidatesApi.list(electionId).then(r => r.data.candidates || []) : Promise.resolve([]),
    [electionId],
    { initial: [] }
  );

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await candidatesApi.create({ election: electionId, party: partyId, firstName, lastName });
      toast.success('Candidate added successfully');
      setFirstName(''); 
      setLastName('');
      setPartyId('');
      candidatesApiRes.refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add candidate');
    } finally { 
      setBusy(false); 
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900">Candidates</h1>
      
      <div className="card p-4">
        <label className="label">Select Election to view/add candidates</label>
        <select className="input max-w-md" value={electionId} onChange={e => setElectionId(e.target.value)}>
          <option value="">Select election…</option>
          {electionsApiRes.data.map(el => (
            <option key={el._id} value={el._id}>{el.title}</option>
          ))}
        </select>
      </div>

      {electionId && (
        <>
          <form onSubmit={handleCreate} className="card space-y-4 p-5">
            <h2 className="font-semibold">Add New Candidate</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Political Party</label>
                <select required className="input" value={partyId} onChange={e => setPartyId(e.target.value)}>
                  <option value="">Select party…</option>
                  {partiesApiRes.data.map(p => (
                    <option key={p._id} value={p._id}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>
              <div className="hidden sm:block"></div>
              <div>
                <label className="label">First Name</label>
                <input required className="input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="e.g. Bola" />
              </div>
              <div>
                <label className="label">Last Name</label>
                <input required className="input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="e.g. Tinubu" />
              </div>
            </div>
            <button type="submit" disabled={busy || !partyId} className="btn-primary">
              {busy ? 'Saving…' : 'Save Candidate'}
            </button>
          </form>

          <div className="card overflow-hidden">
            <div className="card-header">
              <h2 className="text-base font-semibold">Registered Candidates</h2>
              <span className="text-xs text-slate-500">{candidatesApiRes.data.length} candidates</span>
            </div>
            {candidatesApiRes.data.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No candidates yet. Add one above.</div>
            ) : (
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
                      <td className="px-4 py-3 font-medium text-slate-900 flex items-center gap-2">
                        <Users className="h-4 w-4 text-slate-400" />
                        {c.firstName} {c.lastName}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <span className="font-semibold">{c.party?.code || 'N/A'}</span> ({c.party?.name || 'Unknown'})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}