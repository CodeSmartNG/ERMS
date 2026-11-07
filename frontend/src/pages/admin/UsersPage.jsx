import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { usersApi, geoApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

// Define which roles each role is allowed to create
const CREATABLE_ROLES = {
  NATIONAL_SUPER_ADMIN: ['STATE_ADMIN', 'LGA_ADMIN', 'WARD_ADMIN', 'POLLING_UNIT_AGENT'],
  STATE_ADMIN: ['LGA_ADMIN', 'WARD_ADMIN', 'POLLING_UNIT_AGENT'],
  LGA_ADMIN: ['WARD_ADMIN', 'POLLING_UNIT_AGENT'],
  WARD_ADMIN: ['POLLING_UNIT_AGENT'],
};

const ROLE_LABELS = {
  STATE_ADMIN: 'State Admin',
  LGA_ADMIN: 'LGA Admin',
  WARD_ADMIN: 'Ward Admin',
  POLLING_UNIT_AGENT: 'Polling Unit Agent',
};

export default function UsersPage() {
  const { user } = useAuth();
  
  // Get the roles the current user is allowed to create
  const allowedRoles = CREATABLE_ROLES[user.role] || [];
  const [role, setRole] = useState(allowedRoles[0] || '');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  
  // Geo states
  const [stateCode, setStateCode] = useState(user.scope?.stateCode || ''); // Pre-fill if State/LGA Admin
  const [lgaCode, setLgaCode] = useState(user.scope?.lgaCode || '');
  const [wardCode, setWardCode] = useState('');
  const [puId, setPuId] = useState('');

  const [busy, setBusy] = useState(false);

  // Geo Data Fetching
  const statesApi = useApi(() => geoApi.states(), [], { initial: [] });
  const lgasApi = useApi(() => stateCode ? geoApi.lgas(stateCode) : Promise.resolve([]), [stateCode], { initial: [] });
  const wardsApi = useApi(() => lgaCode ? geoApi.wards(lgaCode) : Promise.resolve([]), [lgaCode], { initial: [] });
  const pusApi = useApi(() => wardCode ? geoApi.pollingUnits(wardCode) : Promise.resolve([]), [wardCode], { initial: [] });

  // Reset lower dropdowns when parent changes
  useEffect(() => { if (!user.scope?.lgaCode) setLgaCode(''); setWardCode(''); setPuId(''); }, [stateCode]);
  useEffect(() => { if (!user.scope?.wardCode) setWardCode(''); setPuId(''); }, [lgaCode]);
  useEffect(() => { setPuId(''); }, [wardCode]);

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const stateId = statesApi.data.find(s => s.code === stateCode)?._id;
      const lgaId = lgasApi.data.find(l => l.code === lgaCode)?._id;
      const wardId = wardsApi.data.find(w => w.code === wardCode)?._id;

      const scope = {};
      if (role === 'STATE_ADMIN') {
        scope.state = stateId;
      } else if (role === 'LGA_ADMIN') {
        scope.state = stateId;
        scope.lga = lgaId;
      } else if (role === 'WARD_ADMIN') {
        scope.state = stateId;
        scope.lga = lgaId;
        scope.ward = wardId;
      } else if (role === 'POLLING_UNIT_AGENT') {
        scope.state = stateId;
        scope.lga = lgaId;
        scope.ward = wardId;
        scope.pollingUnit = puId;
      }

      await usersApi.register({ email, password, firstName, lastName, role, scope });

      toast.success(`${ROLE_LABELS[role]} created successfully`);
      setEmail(''); setPassword(''); setFirstName(''); setLastName('');
      // Don't reset state/lga if they are locked to the admin's scope
      if (user.role === 'NATIONAL_SUPER_ADMIN') setStateCode('');
      setWardCode(''); setPuId('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create user');
    } finally { setBusy(false); }
  }

  const needsState = ['STATE_ADMIN', 'LGA_ADMIN', 'WARD_ADMIN', 'POLLING_UNIT_AGENT'].includes(role);
  const needsLga = ['LGA_ADMIN', 'WARD_ADMIN', 'POLLING_UNIT_AGENT'].includes(role);
  const needsWard = ['WARD_ADMIN', 'POLLING_UNIT_AGENT'].includes(role);
  const needsPu = role === 'POLLING_UNIT_AGENT';

  // Determine if the current user is locked to a specific state/lga
  const isStateLocked = user.role !== 'NATIONAL_SUPER_ADMIN' && user.scope?.state;
  const isLgaLocked = user.role !== 'NATIONAL_SUPER_ADMIN' && user.role !== 'STATE_ADMIN' && user.scope?.lga;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
      </div>

      {statesApi.error && (
        <div className="card border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-800">Failed to load states</p>
              <p className="text-xs text-red-600 mt-1">{statesApi.error}</p>
              <button onClick={() => statesApi.refetch()} className="mt-2 text-xs font-semibold text-red-700 flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Try again
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="card space-y-4 p-5">
        <div>
          <label className="label">Role</label>
          <select required className="input font-semibold" value={role} onChange={e => setRole(e.target.value)}>
            {allowedRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">First Name</label><input required className="input" value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
          <div><label className="label">Last Name</label><input required className="input" value={lastName} onChange={e => setLastName(e.target.value)} /></div>
          <div><label className="label">Email</label><input type="email" required className="input" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><label className="label">Password</label><input type="password" required minLength={12} className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 12 chars, 1 upper, 1 num" /></div>
        </div>

        <h2 className="font-semibold pt-2 border-t border-slate-200 mt-4">Assign Scope</h2>
        <div className="grid grid-cols-2 gap-4">
          
          {needsState && (
            <div>
              <label className="label">State</label>
              <select required className="input" value={stateCode} onChange={e => setStateCode(e.target.value)} disabled={statesApi.loading || isStateLocked}>
                <option value="">{statesApi.loading ? 'Loading states...' : 'Select State…'}</option>
                {statesApi.data.map(s => <option key={s._id} value={s.code}>{s.name}</option>)}
              </select>
            </div>
          )}

          {needsLga && (
            <div>
              <label className="label">LGA</label>
              <select required className="input" value={lgaCode} onChange={e => setLgaCode(e.target.value)} disabled={!stateCode || isLgaLocked}>
                <option value="">Select LGA…</option>
                {lgasApi.data.map(l => <option key={l._id} value={l.code}>{l.name}</option>)}
              </select>
            </div>
          )}

          {needsWard && (
            <div>
              <label className="label">Ward</label>
              <select required className="input" value={wardCode} onChange={e => setWardCode(e.target.value)} disabled={!lgaCode}>
                <option value="">Select Ward…</option>
                {wardsApi.data.map(w => <option key={w._id} value={w.code}>{w.name}</option>)}
              </select>
            </div>
          )}

          {needsPu && (
            <div>
              <label className="label">Polling Unit</label>
              <select required className="input" value={puId} onChange={e => setPuId(e.target.value)} disabled={!wardCode}>
                <option value="">Select PU…</option>
                {pusApi.data.map(p => <option key={p._id} value={p._id}>{p.name} ({p.code})</option>)}
              </select>
            </div>
          )}

        </div>

        <button type="submit" disabled={busy || !stateCode} className="btn-primary mt-4">
          {busy ? 'Creating…' : `Create ${ROLE_LABELS[role]}`}
        </button>
      </form>
    </div>
  );
}
