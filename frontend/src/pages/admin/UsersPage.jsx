import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/useApi';
import { usersApi, geoApi } from '@/services/api';

export default function UsersPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  
  const [stateCode, setStateCode] = useState('');
  const [lgaCode, setLgaCode] = useState('');
  const [wardCode, setWardCode] = useState('');
  const [puId, setPuId] = useState('');

  const [busy, setBusy] = useState(false);

  // Geo Data
  const statesApi = useApi(() => geoApi.states().then(r => r.data.states), [], { initial: [] });
  const lgasApi = useApi(() => stateCode ? geoApi.lgas(stateCode).then(r => r.data.lgas) : Promise.resolve([]), [stateCode], { initial: [] });
  const wardsApi = useApi(() => lgaCode ? geoApi.wards(lgaCode).then(r => r.data.wards) : Promise.resolve([]), [lgaCode], { initial: [] });
  const pusApi = useApi(() => wardCode ? geoApi.pollingUnits(wardCode).then(r => r.data.pollingUnits) : Promise.resolve([]), [wardCode], { initial: [] });

  // Reset lower dropdowns when parent changes
  useEffect(() => { setLgaCode(''); setWardCode(''); setPuId(''); }, [stateCode]);
  useEffect(() => { setWardCode(''); setPuId(''); }, [lgaCode]);
  useEffect(() => { setPuId(''); }, [wardCode]);

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    try {
      // We need the actual ObjectIds to send to the backend
      const stateId = statesApi.data.find(s => s.code === stateCode)?._id;
      const lgaId = lgasApi.data.find(l => l.code === lgaCode)?._id;
      const wardId = wardsApi.data.find(w => w.code === wardCode)?._id;

      await usersApi.register({
        email, password, firstName, lastName,
        role: 'POLLING_UNIT_AGENT',
        scope: { state: stateId, lga: lgaId, ward: wardId, pollingUnit: puId }
      });

      toast.success('Agent created successfully');
      setEmail(''); setPassword(''); setFirstName(''); setLastName('');
      setStateCode(''); setLgaCode(''); setWardCode(''); setPuId('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create agent');
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900">Create PU Agent</h1>

      <form onSubmit={handleCreate} className="card space-y-4 p-5">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">First Name</label><input required className="input" value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
          <div><label className="label">Last Name</label><input required className="input" value={lastName} onChange={e => setLastName(e.target.value)} /></div>
          <div><label className="label">Email</label><input type="email" required className="input" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><label className="label">Password</label><input type="password" required minLength={12} className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 12 chars, 1 upper, 1 num" /></div>
        </div>

        <h2 className="font-semibold pt-2 border-t border-slate-200 mt-4">Assign Scope</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">State</label>
            <select required className="input" value={stateCode} onChange={e => setStateCode(e.target.value)}>
              <option value="">Select State…</option>
              {statesApi.data.map(s => <option key={s._id} value={s.code}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">LGA</label>
            <select required className="input" value={lgaCode} onChange={e => setLgaCode(e.target.value)} disabled={!stateCode}>
              <option value="">Select LGA…</option>
              {lgasApi.data.map(l => <option key={l._id} value={l.code}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Ward</label>
            <select required className="input" value={wardCode} onChange={e => setWardCode(e.target.value)} disabled={!lgaCode}>
              <option value="">Select Ward…</option>
              {wardsApi.data.map(w => <option key={w._id} value={w.code}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Polling Unit</label>
            <select required className="input" value={puId} onChange={e => setPuId(e.target.value)} disabled={!wardCode}>
              <option value="">Select PU…</option>
              {pusApi.data.map(p => <option key={p._id} value={p._id}>{p.name} ({p.code})</option>)}
            </select>
          </div>
        </div>

        <button type="submit" disabled={busy || !puId} className="btn-primary mt-4">
          {busy ? 'Creating…' : 'Create Agent'}
        </button>
      </form>
    </div>
  );
}
