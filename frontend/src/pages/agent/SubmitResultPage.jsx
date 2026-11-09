import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ArrowLeft, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/services/api';
import { enqueue } from '@/services/offlineQueue';
import { flushQueue } from '@/services/syncService';
import { useAuth } from '@/context/AuthContext';

export default function SubmitResultPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [elections, setElections] = useState([]);
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  const [electionId, setElectionId] = useState('');
  const [registeredVoters, setRegisteredVoters] = useState('');
  const [accreditedVoters, setAccreditedVoters] = useState('');
  const [totalVotesCast, setTotalVotesCast] = useState('');
  const [rejectedBallots, setRejectedBallots] = useState('0');
  const [votes, setVotes] = useState({});
  const [photo, setPhoto] = useState(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/elections', { params: { status: 'ACTIVE' } });
        setElections(res.data.elections || []);
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to load elections');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!electionId) { setParties([]); setVotes({}); return; }
    (async () => {
      try {
        const res = await api.get(`/elections/${electionId}/parties`);
        setParties(res.data.parties || []);
      } catch (err) {
        toast.error(err.response?.data?.error || 'Could not load parties');
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
  const valid = electionId && Number(registeredVoters) > 0 && Number(accreditedVoters) >= 0 && Number(accreditedVoters) <= Number(registeredVoters) && Number(totalVotesCast) >= 0 && Number(totalVotesCast) <= Number(accreditedVoters) + Number(rejectedBallots || 0) && sumVotes > 0 && sumVotes <= Number(totalVotesCast) && photo;

  async function onSubmit(e) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);

    const payload = {
      election: electionId,
      pollingUnit: user?.scope?.pollingUnit,
      registeredVoters: Number(registeredVoters),
      accreditedVoters: Number(accreditedVoters),
      totalVotesCast: Number(totalVotesCast),
      rejectedBallots: Number(rejectedBallots) || 0,
      partyVotes: parties.filter((p) => votes[p._id] > 0).map((p) => ({ party: p._id, votes: Number(votes[p._id]) })),
      idempotencyKey: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      notes: notes || undefined,
    };

    try {
      const record = await enqueue({
        kind: 'result',
        payload: { ...payload, partyVotes: JSON.stringify(payload.partyVotes) },
        evidenceFiles: [{ blob: photo.blob, name: photo.name }], // <-- CHANGED to array
      });
      
      // Always flush - the sync service will handle offline gracefully
      flushQueue().catch(() => {});
      
      setDone(record);
      toast.success('Result saved.');
    } catch (err) {
      toast.error(err.message || 'Failed to save result');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <CheckCircle2 className="h-16 w-16 text-brand-600" />
        <h2 className="mt-4 text-xl font-semibold text-slate-900">Result submitted</h2>
        <p className="mt-2 max-w-xs text-sm text-slate-500">It will be sent to the server now or when you're back online.</p>
        <button onClick={() => navigate('/agent')} className="btn-primary mt-8 w-full max-w-xs">Done</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <button onClick={() => navigate(-1)} className="btn-ghost -ml-2 p-2"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-base font-semibold">Submit Result</h1>
      </header>

      <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-5 px-5 py-6">
        {loading ? (
          <div className="card p-6 text-center text-sm text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : error ? (
          <div className="card border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-800">Failed to load elections</p>
                <p className="text-xs text-red-600 mt-1">{error}</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="election">Election</label>
              <select id="election" required className="input" value={electionId} onChange={(e) => setElectionId(e.target.value)}>
                <option value="">Select election…</option>
                {elections.map((el) => <option key={el._id} value={el._id}>{el.title}</option>)}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Registered voters</label><input type="number" min="0" required className="input" value={registeredVoters} onChange={(e) => setRegisteredVoters(e.target.value)} /></div>
              <div><label className="label">Accredited voters</label><input type="number" min="0" required className="input" value={accreditedVoters} onChange={(e) => setAccreditedVoters(e.target.value)} /></div>
              <div><label className="label">Total votes cast</label><input type="number" min="0" required className="input" value={totalVotesCast} onChange={(e) => setTotalVotesCast(e.target.value)} /></div>
              <div><label className="label">Rejected ballots</label><input type="number" min="0" required className="input" value={rejectedBallots} onChange={(e) => setRejectedBallots(e.target.value)} /></div>
            </div>

            <div>
              <label className="label">Party votes</label>
              {parties.length === 0 ? <p className="text-sm text-slate-500">Select an election first</p> : (
                <div className="space-y-2">
                  {parties.map((p) => (
                    <div key={p._id} className="flex items-center gap-3">
                      <div className="w-24 shrink-0 text-sm font-medium text-slate-700">{p.code}</div>
                      <input type="number" min="0" className="input" value={votes[p._id] ?? ''} onChange={(e) => setVotes((v) => ({ ...v, [p._id]: e.target.value }))} placeholder="0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label">Evidence photo</label>
              <label htmlFor="photo" className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500 hover:border-brand-400">
                <Camera className="h-5 w-5" />{photo ? 'Change photo' : 'Take or upload photo'}
              </label>
              <input id="photo" type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhotoChange} />
              {photo && <img src={photo.preview} alt="Evidence" className="mt-3 max-h-64 w-full rounded-lg object-cover" />}
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
