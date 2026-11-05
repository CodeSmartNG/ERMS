const PARTY_COLORS = {
  APC: 'bg-blue-500',
  PDP: 'bg-red-500',
  LP:  'bg-purple-500',
  NNPP: 'bg-amber-500',
  ADC: 'bg-green-500',
};

export default function PartyBar({ partyCode, votes, totalVotes, color }) {
  const pct = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
  const barColor = color || PARTY_COLORS[partyCode] || 'bg-slate-400';

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-slate-700">{partyCode}</span>
        <span className="tabular-nums text-slate-600">
          {votes.toLocaleString()}{' '}
          <span className="text-slate-400">({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
