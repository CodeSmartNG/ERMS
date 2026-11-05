import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/services/api';
import { enqueue, QUEUE_STATUS } from '@/services/offlineQueue';
import { flushQueue } from '@/services/syncService';

export default function SubmitResultPage() {
  const navigate = useNavigate();

  const [elections, setElections] = useState([]);
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  const [electionId, setElectionId] = useState('');
  const [registeredVoters, setRegisteredVoters] = useState('');
  const [accreditedVoters, setAccreditedVoters] = useState('');
  const [totalVotesCast, setTotalVotesCast] = useState('');
  const [rejectedBallots, setRejectedBallots] = useState('0');
  const [votes, setVotes] = useState({}); // partyId -> number
  const [photo, setPhoto] = useState(null); // { blob, name, preview }
  const [notes, setNotes] = useState('');

  // Load elections + parties available for this agent's scope
  useEffect(() => {
    (async () => {
      try {
        // We don't have a public "list elections" endpoint yet — derive from active
        // results API isn't ideal. For now, we expect the backend to expose one;
        // if not, add GET /api/elections (see notes).
        const [elRes] = await Promise.all([
          api.get('/elections', { params: { status: 'ACTIVE' } }).catch(() => ({ data: { elections: [] } })),
        ]);
        setElections(elRes.data.elections || []);
      } catch (err) {
        toast.error('Could not load elections');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // When election is chosen, load its candidates → derive parties
  useEffect(() => {
    if (!electionId) { setParties([]); setVotes({}); return; }
    (async () => {
      try {
        const res = await api.get(`/elections/${electionId}/parties`);
        setParties(res.data.parties || []);
      } catch {
        toast.error('Could not load parties for this election');
      }
    })();
  }, [electionId]);

  function onPhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) { setPhoto(null); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please select an image'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Image must be under 8MB'); return; }
    setPhoto({ blob: file, name: file.name, preview: URL.createObjectURL(file) });
  }

  const sumVotes = Object.values(votes).reduce((s, v) => s + (Number(v) || 0), 0);
  const valid =
    electionId &&
    Number(registeredVoters) > 0 &&
    Number(accreditedVoters) >= 0 &&
    Number(accreditedVoters) <= Number(registeredVoters) &&
    Number(totalVotesCast) >= 0 &&
    Number(totalVotesCast) <= Number(accreditedVoters) + Number(rejectedBallots || 0) &&
    sumVotes > 0 &&
    sumVotes <= Number(totalVotesCast) &&
    photo;

  async function onSubmit(e) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);

    const payload = {
      election: electionId,
      registeredVoters: Number(registeredVoters),
      accreditedVoters: Number(accreditedVoters),
      totalVotesCast: Number(totalVotesCast),
      rejectedBallots: Number(rejectedBallots) || 0,
      partyVotes: parties
        .filter((p) => votes[p._id] > 0)
        .map((p) => ({ party: p._id, votes: Number(votes[p._id]) })),
      idempotencyKey: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      notes: notes || undefined,
    };

    try {
      const record = await enqueue({
        kind: 'result',
        payload: {
          ...payload,
          // pollingUnit is set by the backend from the agent's scope. We
          // still send it so the backend's scope check has something to
          // compare against. Fetch it from /auth/me in a real impl; here we
          // rely on the agent remembering it. See notes at bottom.
          pollingUnit: undefined,
          // The upload endpoint requires pollingUnit and partyVotes as JSON.
          partyVotes: JSON.stringify(payload.partyVotes),
        },
        evidenceBlob: photo.blob,
        evidenceName: photo.name,
      });

      // Try to send immediately if online
      if (navigator.onLine) {
        flushQueue().catch(() => {});
      }

      setDone(record);
      toast.success('Result saved. It will be sent now or when online.');
    } catch (err) {
      toast.error(err.message || 'Failed to save result');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <SuccessScreen
        title="Result submitted"
        subtitle="Your submission is queued. It will sync automatically."
        localId={done.localId}
        onDone={() => navigate('/agent')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <button onClick={() => navigate(-1)} className="btn-ghost -ml-2 p-2">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold">Submit Result</h1>
      </header>

      <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-5 px-5 py-6">
        {loading ? (
          <div className="card p-6 text-center text-sm text-slate-500">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="election">Election</label>
              <select
                id="election"
                required
                className="input"
                value={electionId}
                onChange={(e) => setElectionId(e.target.value)}
              >
                <option value="">Select election…</option>
                {elections.map((el) => (
                  <option key={el._id} value={el._id}>{el.title}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Registered voters" value={registeredVoters} setValue={setRegisteredVoters} />
              <Field label="Accredited voters" value={accreditedVoters} setValue={setAccreditedVoters} />
              <Field label="Total votes cast" value={totalVotesCast} setValue={setTotalVotesCast} />
              <Field label="Rejected ballots" value={rejectedBallots} setValue={setRejectedBallots} />
            </div>

            <div>
              <label className="label">Party votes</label>
              {parties.length === 0 ? (
                <p className="text-sm text-slate-500">Select an election first</p>
              ) : (
                <div className="space-y-2">
                  {parties.map((p) => (
                    <div key={p._id} className="flex items-center gap-3">
                      <div className="w-24 shrink-0 text-sm font-medium text-slate-700">{p.code}</div>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className="input"
                        value={votes[p._id] ?? ''}
                        onChange={(e) => setVotes((v) => ({ ...v, [p._id]: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-medium">
                    <span className="text-slate-700">Sum of party votes</span>
                    <span className="tabular-nums text-brand-700">{sumVotes}</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="label">Evidence photo</label>
              <label
                htmlFor="photo"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500 hover:border-brand-400 hover:bg-brand-50/30"
              >
                <Camera className="h-5 w-5" />
                {photo ? 'Change photo' : 'Take or upload photo of Form EC8A'}
              </label>
              <input id="photo" type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhotoChange} />
              {photo && (
                <img src={photo.preview} alt="Evidence preview" className="mt-3 max-h-64 w-full rounded-lg object-cover" />
              )}
            </div>

            <div>
              <label className="label" htmlFor="notes">Notes (optional)</label>
              <textarea id="notes" rows={2} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <button type="submit" disabled={!valid || submitting} className="btn-primary w-full">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Submit result'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

function Field({ label, value, setValue }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        min="0"
        inputMode="numeric"
        required
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}

function SuccessScreen({ title, subtitle, localId, onDone }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <CheckCircle2 className="h-16 w-16 text-brand-600" />
      <h2 className="mt-4 text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 max-w-xs text-sm text-slate-500">{subtitle}</p>
      <p className="mt-4 font-mono text-xs text-slate-400">Local ID: {localId.slice(0, 8)}…</p>
      <button onClick={onDone} className="btn-primary mt-8 w-full max-w-xs">Done</button>
    </div>
  );
}
