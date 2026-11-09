import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { enqueue } from '@/services/offlineQueue';
import { flushQueue } from '@/services/syncService';

const TYPES = [
  ['VIOLENCE', 'Violence'],
  ['BALLOT_SNATCHING', 'Ballot snatching'],
  ['VOTE_BUYING', 'Vote buying'],
  ['INTIMIDATION', 'Intimidation'],
  ['BVAS_MALFUNCTION', 'BVAS malfunction'],
  ['LATE_OPENING', 'Late opening'],
  ['MATERIAL_SHORTAGE', 'Material shortage'],
  ['RESULT_TAMPERING', 'Result tampering'],
  ['OTHER', 'Other'],
];

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function SubmitIncidentPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  const [type, setType] = useState('BALLOT_SNATCHING');
  const [severity, setSeverity] = useState('MEDIUM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date(Date.now() - 15 * 60 * 1000).toISOString().slice(0, 16));
  const [photos, setPhotos] = useState([]);

  // Append new photos to existing ones (up to 5 total)
  function onPhotosChange(e) {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) => f.type.startsWith('image/') && f.size <= 8 * 1024 * 1024);
    
    const newPhotos = valid.map((f) => ({ 
      blob: f, 
      name: f.name, 
      preview: URL.createObjectURL(f) 
    }));
    
    setPhotos((prev) => [...prev, ...newPhotos].slice(0, 5));
    
    // Reset the input so you can select the same file again if needed
    e.target.value = '';
  }

  function removePhoto(index) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  const valid = title.trim().length >= 5 && description.trim().length >= 10 && type;

  async function onSubmit(e) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);

    try {
      const record = await enqueue({
        kind: 'incident',
        payload: {
          type,
          severity,
          title: title.trim(),
          description: description.trim(),
          occurredAt: new Date(occurredAt).toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
        evidenceFiles: photos.map(p => ({ blob: p.blob, name: p.name })),
      });

      // Always flush - sync service handles offline gracefully
      flushQueue().catch(() => {});
      setDone(record);
    } catch (err) {
      toast.error(err.message || 'Failed to save incident');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <h2 className="text-xl font-semibold text-slate-900">Incident saved</h2>
        <p className="mt-2 max-w-xs text-sm text-slate-500">
          It will be sent to supervisors now or when you're back online.
        </p>
        <button onClick={() => navigate('/agent')} className="btn-primary mt-8 w-full max-w-xs">Done</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <button onClick={() => navigate(-1)} className="btn-ghost -ml-2 p-2">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold">Report Incident</h1>
      </header>

      <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-5 px-5 py-6">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Severity</label>
            <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="title">Title</label>
          <input 
            id="title" 
            className="input" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            placeholder="Short summary" 
          />
        </div>

        <div>
          <label className="label" htmlFor="description">Description</label>
          <textarea 
            id="description" 
            rows={4} 
            className="input" 
            value={description} 
            onChange={(e) => setDescription(e.target.value)} 
            placeholder="What happened? Who was involved? Any witnesses?" 
          />
        </div>

        <div>
          <label className="label" htmlFor="when">When did it happen?</label>
          <input 
            id="when" 
            type="datetime-local" 
            className="input" 
            value={occurredAt} 
            onChange={(e) => setOccurredAt(e.target.value)} 
          />
        </div>

        <div>
          <label className="label">Photos ({photos.length}/5)</label>
          
          {photos.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  <img 
                    src={p.preview} 
                    alt="" 
                    className="aspect-square w-full rounded-lg object-cover" 
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute right-1 top-1 rounded-full bg-red-600 p-1 text-white shadow-lg hover:bg-red-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {photos.length < 5 && (
            <>
              <label 
                htmlFor="photos" 
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500 hover:border-brand-400 hover:bg-brand-50/30"
              >
                <Camera className="h-5 w-5" />
                {photos.length === 0 ? 'Add photos' : 'Add more'}
              </label>
              <input 
                id="photos" 
                type="file" 
                accept="image/*" 
                capture="environment" 
                multiple 
                className="hidden" 
                onChange={onPhotosChange} 
              />
            </>
          )}
        </div>

        <button type="submit" disabled={!valid || submitting} className="btn-primary w-full">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Report incident'}
        </button>
      </form>
    </div>
  );
}
