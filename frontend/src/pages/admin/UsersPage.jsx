
import { useState, useEffect, Component } from 'react';
import { toast } from 'sonner';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { usersApi, geoApi, partiesApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

// ERROR BOUNDARY
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          color: 'red',
          background: '#ffeeee',
          minHeight: '100vh'
        }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>
            Page Crashed
          </h1>

          <p style={{ marginTop: '10px', fontFamily: 'monospace' }}>
            {this.state.error?.toString()}
          </p>

          <pre style={{
            marginTop: '20px',
            padding: '10px',
            background: 'white',
            fontSize: '12px',
            overflow: 'auto'
          }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

// ROLE PERMISSIONS
const CREATABLE_ROLES = {
  NATIONAL_SUPER_ADMIN: [
    'STATE_ADMIN',
    'PARTY_ADMIN',
    'LGA_ADMIN',
    'WARD_ADMIN',
    'POLLING_UNIT_AGENT'
  ],
  STATE_ADMIN: [
    'PARTY_ADMIN',
    'LGA_ADMIN',
    'WARD_ADMIN',
    'POLLING_UNIT_AGENT'
  ],
  PARTY_ADMIN: [
    'LGA_ADMIN',
    'WARD_ADMIN',
    'POLLING_UNIT_AGENT'
  ],
  LGA_ADMIN: [
    'WARD_ADMIN',
    'POLLING_UNIT_AGENT'
  ],
  WARD_ADMIN: [
    'POLLING_UNIT_AGENT'
  ]
};

const ROLE_LABELS = {
  STATE_ADMIN: 'State Admin',
  PARTY_ADMIN: 'Party Admin',
  LGA_ADMIN: 'LGA Admin',
  WARD_ADMIN: 'Ward Admin',
  POLLING_UNIT_AGENT: 'Polling Unit Agent'
};

const ROLE_NEEDS_PARTY = new Set([
  'PARTY_ADMIN',
  'LGA_ADMIN',
  'WARD_ADMIN',
  'POLLING_UNIT_AGENT'
]);

const STATE_ROLES = [
  'STATE_ADMIN',
  'PARTY_ADMIN',
  'LGA_ADMIN',
  'WARD_ADMIN',
  'POLLING_UNIT_AGENT'
];

const LGA_ROLES = [
  'LGA_ADMIN',
  'WARD_ADMIN',
  'POLLING_UNIT_AGENT'
];

const WARD_ROLES = [
  'WARD_ADMIN',
  'POLLING_UNIT_AGENT'
];

// NORMALIZE API RESPONSES
function getArray(data, keys = []) {
  if (Array.isArray(data)) return data;

  if (!data || typeof data !== 'object') return [];

  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }

  if (Array.isArray(data.data)) return data.data;

  return [];
}

// FORMAT BACKEND ERRORS
function getErrorMessage(err) {
  const response = err.response?.data;

  if (!response) {
    return err.message || 'Network error. Please try again.';
  }

  const details = response.details || response.errors;

  if (Array.isArray(details)) {
    return details.map(item =>
      typeof item === 'string'
        ? item
        : item.message || JSON.stringify(item)
    ).join(', ');
  }

  if (details && typeof details === 'object') {
    return Object.entries(details)
      .map(([field, message]) =>
        `${field}: ${
          typeof message === 'string'
            ? message
            : JSON.stringify(message)
        }`
      )
      .join(', ');
  }

  if (typeof response.message === 'string') {
    return response.message;
  }

  if (typeof response.error === 'string') {
    return response.error;
  }

  return JSON.stringify(response);
}

function UsersPageContent() {
  const { user } = useAuth();

  const allowedRoles = CREATABLE_ROLES[user?.role] || [];

  const [role, setRole] = useState(allowedRoles[0] || '');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [partyId, setPartyId] = useState('');

  const [stateCode, setStateCode] = useState('');
  const [lgaCode, setLgaCode] = useState('');
  const [wardCode, setWardCode] = useState('');
  const [puId, setPuId] = useState('');

  const [busy, setBusy] = useState(false);

  // LOAD PARTIES
  const partiesHook = useApi(
    () => partiesApi.list(),
    [],
    { initial: [] }
  );

  // ALWAYS RETURN AN ARRAY
  const safeParties = getArray(partiesHook.data, ['parties']);

  // LOAD GEOGRAPHICAL DATA
  const statesApi = useApi(
    () => geoApi.states(),
    [],
    { initial: [] }
  );

  const lgasApi = useApi(
    () => stateCode
      ? geoApi.lgas(stateCode)
      : Promise.resolve([]),
    [stateCode],
    { initial: [] }
  );

  const wardsApi = useApi(
    () => lgaCode
      ? geoApi.wards(lgaCode)
      : Promise.resolve([]),
    [lgaCode],
    { initial: [] }
  );

  const pusApi = useApi(
    () => wardCode
      ? geoApi.pollingUnits(wardCode)
      : Promise.resolve([]),
    [wardCode],
    { initial: [] }
  );

  // NORMALIZE GEOGRAPHICAL RESPONSES
  const safeStates = getArray(statesApi.data, ['states']);
  const safeLgas = getArray(lgasApi.data, ['lgas']);
  const safeWards = getArray(wardsApi.data, ['wards']);
  const safePus = getArray(pusApi.data, ['pollingUnits']);

  // SCOPE LOCKS
  const isPartyLocked =
    user?.role !== 'NATIONAL_SUPER_ADMIN' &&
    !!user?.scope?.party;

  const isStateLocked =
    user?.role !== 'NATIONAL_SUPER_ADMIN' &&
    !!user?.scope?.state;

  const isLgaLocked =
    user?.role === 'LGA_ADMIN' ||
    user?.role === 'WARD_ADMIN';

  // AUTO-SELECT PARTY
  useEffect(() => {
    if (isPartyLocked && user?.scope?.party) {
      const party = safeParties.find(
        p => p._id === user.scope.party
      );

      if (party) setPartyId(party._id);
    }
  }, [isPartyLocked, user?.scope?.party, safeParties]);

  // AUTO-SELECT STATE
  useEffect(() => {
    if (isStateLocked && user?.scope?.state) {
      const state = safeStates.find(
        s => s._id === user.scope.state
      );

      if (state) setStateCode(state.code);
    }
  }, [isStateLocked, user?.scope?.state, safeStates]);

  // AUTO-SELECT LGA
  useEffect(() => {
    if (isLgaLocked && user?.scope?.lga) {
      const lga = safeLgas.find(
        l => l._id === user.scope.lga
      );

      if (lga) setLgaCode(lga.code);
    }
  }, [isLgaLocked, user?.scope?.lga, safeLgas]);

  // RESET DEPENDENT SELECTIONS
  useEffect(() => {
    if (!isLgaLocked) {
      setLgaCode('');
      setWardCode('');
      setPuId('');
    }
  }, [stateCode, isLgaLocked]);

  useEffect(() => {
    setWardCode('');
    setPuId('');
  }, [lgaCode]);

  useEffect(() => {
    setPuId('');
  }, [wardCode]);

  // RESET PARTY WHEN NOT REQUIRED
  useEffect(() => {
    if (!ROLE_NEEDS_PARTY.has(role) && !isPartyLocked) {
      setPartyId('');
    }
  }, [role, isPartyLocked]);

  // CREATE USER
  async function handleCreate(e) {
    e.preventDefault();

    if (busy) return;

    setBusy(true);

    try {
      const stateId = isStateLocked
        ? user.scope.state
        : safeStates.find(
            s => s.code === stateCode
          )?._id;

      const lgaId = isLgaLocked
        ? user.scope.lga
        : safeLgas.find(
            l => l.code === lgaCode
          )?._id;

      const wardId = safeWards.find(
        w => w.code === wardCode
      )?._id;

      const resolvedPartyId = isPartyLocked
        ? user.scope.party
        : partyId;

      const scope = {};

      if (ROLE_NEEDS_PARTY.has(role)) {
        if (!resolvedPartyId) {
          toast.error('Please select a party');
          return;
        }

        scope.party = resolvedPartyId;
      }

      if (STATE_ROLES.includes(role)) {
        if (!stateId) {
          toast.error('Please select a valid state');
          return;
        }

        scope.state = stateId;
      }

      if (LGA_ROLES.includes(role)) {
        if (!lgaId) {
          toast.error('Please select a valid LGA');
          return;
        }

        scope.lga = lgaId;
      }

      if (WARD_ROLES.includes(role)) {
        if (!wardId) {
          toast.error('Please select a valid ward');
          return;
        }

        scope.ward = wardId;
      }

      if (role === 'POLLING_UNIT_AGENT') {
        if (!puId) {
          toast.error('Please select a polling unit');
          return;
        }

        scope.pollingUnit = puId;
      }

      // EXACT REGISTRATION PAYLOAD
      const payload = {
        email: email.trim().toLowerCase(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        scope
      };

      console.log('USER REGISTRATION PAYLOAD:', {
        ...payload,
        password: '[HIDDEN]'
      });

      await usersApi.register(payload);

      toast.success(
        `${ROLE_LABELS[role]} created successfully`
      );

      // RESET FORM
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');

      if (!isPartyLocked) {
        setPartyId('');
      }

      if (!isLgaLocked) {
        setLgaCode('');
      }

      setWardCode('');
      setPuId('');

    } catch (err) {
      // SHOW THE REAL BACKEND ERROR
      console.error(
        'USER CREATION FAILED:',
        err.response?.data || err
      );

      const message = getErrorMessage(err);

      toast.error(message, {
        duration: 8000
      });

    } finally {
      setBusy(false);
    }
  }

  // FORM REQUIREMENTS
  const needsParty = ROLE_NEEDS_PARTY.has(role);
  const needsState = STATE_ROLES.includes(role);
  const needsLga = LGA_ROLES.includes(role);
  const needsWard = WARD_ROLES.includes(role);
  const needsPu = role === 'POLLING_UNIT_AGENT';

  const canSubmit =
    !busy &&
    !!role &&
    !!email &&
    !!password &&
    !!firstName &&
    !!lastName &&
    (!needsParty || !!partyId || isPartyLocked) &&
    (!needsState || !!stateCode) &&
    (!needsLga || !!lgaCode) &&
    (!needsWard || !!wardCode) &&
    (!needsPu || !!puId);

  if (!user) {
    return <div className="p-6">Loading user...</div>;
  }

  if (allowedRoles.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-bold">
          User Management
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          You do not have permission to create users.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          User Management
        </h1>
      </div>

      {/* STATES ERROR */}
      {statesApi.error && (
        <div className="card border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />

            <div>
              <p className="text-sm font-medium text-red-800">
                Failed to load states
              </p>

              <p className="mt-1 text-xs text-red-600">
                {String(statesApi.error)}
              </p>

              <button
                type="button"
                onClick={() => statesApi.refetch()}
                className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-700"
              >
                <RefreshCw className="h-3 w-3" />
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PARTIES ERROR */}
      {partiesHook.error && (
        <div className="card border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />

            <div>
              <p className="text-sm font-medium text-red-800">
                Failed to load parties
              </p>

              <p className="mt-1 text-xs text-red-600">
                {String(partiesHook.error)}
              </p>

              <button
                type="button"
                onClick={() => partiesHook.refetch()}
                className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-700"
              >
                <RefreshCw className="h-3 w-3" />
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE USER FORM */}
      <form
        onSubmit={handleCreate}
        className="card space-y-4 p-5"
      >

        <div>
          <label className="label">Role</label>

          <select
            required
            className="input font-semibold"
            value={role}
            onChange={e => setRole(e.target.value)}
          >
            {allowedRoles.map(r => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        {/* USER INFORMATION */}
        <div className="grid grid-cols-2 gap-4">

          <div>
            <label className="label">First Name</label>
            <input
              required
              className="input"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Last Name</label>
            <input
              required
              className="input"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              type="password"
              required
              minLength={12}
              className="input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min 12 chars, 1 upper, 1 num"
            />
          </div>

        </div>

        {/* ASSIGN SCOPE */}
        <h2 className="mt-4 border-t border-slate-200 pt-2 font-semibold">
          Assign Scope
        </h2>

        <div className="grid grid-cols-2 gap-4">

          {/* PARTY */}
          {needsParty && (
            <div>
              <label className="label">Party</label>

              <select
                required
                className="input"
                value={partyId}
                onChange={e => setPartyId(e.target.value)}
                disabled={partiesHook.loading || isPartyLocked}
              >
                <option value="">
                  {partiesHook.loading
                    ? 'Loading parties...'
                    : safeParties.length === 0
                      ? 'No parties available'
                      : 'Select Party...'}
                </option>

                {safeParties.map(p => (
                  <option key={p._id} value={p._id}>
                    {p.abbreviation || p.code || ''}
                    {p.abbreviation || p.code ? ' — ' : ''}
                    {p.name}
                  </option>
                ))}
              </select>

              {isPartyLocked && (
                <p className="mt-1 text-xs text-slate-500">
                  Locked to your party
                </p>
              )}
            </div>
          )}

          {/* STATE */}
          {needsState && (
            <div>
              <label className="label">State</label>

              <select
                required
                className="input"
                value={stateCode}
                onChange={e => setStateCode(e.target.value)}
                disabled={statesApi.loading || isStateLocked}
              >
                <option value="">
                  {statesApi.loading
                    ? 'Loading states...'
                    : 'Select State...'}
                </option>

                {safeStates.map(s => (
                  <option key={s._id} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* LGA */}
          {needsLga && (
            <div>
              <label className="label">LGA</label>

              <select
                required
                className="input"
                value={lgaCode}
                onChange={e => setLgaCode(e.target.value)}
                disabled={!stateCode || isLgaLocked}
              >
                <option value="">Select LGA...</option>

                {safeLgas.map(l => (
                  <option key={l._id} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* WARD */}
          {needsWard && (
            <div>
              <label className="label">Ward</label>

              <select
                required
                className="input"
                value={wardCode}
                onChange={e => setWardCode(e.target.value)}
                disabled={!lgaCode}
              >
                <option value="">Select Ward...</option>

                {safeWards.map(w => (
                  <option key={w._id || w.code} value={w.code}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* POLLING UNIT */}
          {needsPu && (
            <div>
              <label className="label">Polling Unit</label>

              <select
                required
                className="input"
                value={puId}
                onChange={e => setPuId(e.target.value)}
                disabled={!wardCode}
              >
                <option value="">Select PU...</option>

                {safePus.map(p => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
          )}

        </div>

        {/* SUBMIT */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary mt-4"
        >
          {busy
            ? 'Creating...'
            : `Create ${ROLE_LABELS[role]}`}
        </button>

      </form>
    </div>
  );
}

// ERROR BOUNDARY WRAPPER
export default function UsersPage() {
  return (
    <ErrorBoundary>
      <UsersPageContent />
    </ErrorBoundary>
  );
}
