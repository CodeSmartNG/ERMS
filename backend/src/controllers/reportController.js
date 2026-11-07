const models = require('../models');
const ApiError = require('../utils/ApiError');
const { scopeFilter, assertCanAccess } = require('../middleware/scope');

// =================================================================
// EXPORT RESULTS AS CSV
// GET /api/reports/:electionId/results.csv
// =================================================================
async function exportResultsCSV(req, res) {
  const { electionId } = req.params;

  const election = await models.Election.findById(electionId).lean();
  if (!election) throw ApiError.notFound('Election not found');

  // Find all verified results, scoped to the user
  const filter = {
    election: electionId,
    isCurrent: true,
    status: 'VERIFIED',
    ...scopeFilter(req),
  };

  const results = await models.Result.find(filter)
    .sort({ stateCode: 1, lgaCode: 1, wardCode: 1, puCode: 1 })
    .populate('pollingUnit', 'name')
    .lean();

  if (results.length === 0) {
    throw ApiError.badRequest('No verified results to export for this election');
  }

  // Collect all unique party codes across all results
  const partyCodes = new Set();
  for (const r of results) {
    for (const pv of r.partyVotes || []) {
      partyCodes.add(pv.partyCode);
    }
  }
  const sortedParties = [...partyCodes].sort();

  // Build CSV
  const headers = [
    'State Code', 'LGA Code', 'Ward Code',
    'PU Code', 'PU Name',
    'Registered Voters', 'Accredited Voters',
    'Total Votes Cast', 'Valid Votes', 'Rejected Ballots',
    ...sortedParties,
    'Submitted At', 'Verified At',
  ];

  const rows = results.map((r) => {
    // Map party votes to a lookup for fast column access
    const voteMap = new Map();
    for (const pv of r.partyVotes || []) {
      voteMap.set(pv.partyCode, pv.votes);
    }

    const row = [
      r.stateCode,
      r.lgaCode,
      r.wardCode,
      r.puCode,
      r.pollingUnit?.name || '',
      r.registeredVoters,
      r.accreditedVoters,
      r.totalVotesCast,
      r.totalValidVotes,
      r.rejectedBallots,
      ...sortedParties.map((code) => voteMap.get(code) || 0),
      r.submittedAt ? new Date(r.submittedAt).toISOString() : '',
      r.verifiedAt ? new Date(r.verifiedAt).toISOString() : '',
    ];

    return row.map(escapeCSV).join(',');
  });

  const csv = [headers.map(escapeCSV).join(','), ...rows].join('\n');

  // Send the CSV as a file download
  const filename = `ERMS-${election.code}-results-${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// =================================================================
// EXPORT COLLATION SUMMARY AS CSV
// GET /api/reports/:electionId/collation.csv
// Returns the LGA-level collation summary (one row per LGA)
// =================================================================
async function exportCollationCSV(req, res) {
  const { electionId } = req.params;

  const election = await models.Election.findById(electionId).lean();
  if (!election) throw ApiError.notFound('Election not found');

  const filter = {
    election: electionId,
    level: 'LGA',
    isCurrent: true,
    ...(req.user.scope?.state ? { stateCode: req.user.scope.state } : {}),
  };

  const collations = await models.Collation.find(filter)
    .sort({ stateCode: 1, lgaCode: 1 })
    .lean();

  if (collations.length === 0) {
    throw ApiError.badRequest('No LGA collations available yet. Verify some results first.');
  }

  const partyCodes = new Set();
  for (const c of collations) {
    for (const p of c.partyTotals || []) {
      partyCodes.add(p.partyCode);
    }
  }
  const sortedParties = [...partyCodes].sort();

  const headers = [
    'State Code', 'State Name', 'LGA Code', 'LGA Name',
    'PUs Total', 'PUs Reported', 'PUs Verified', 'Reporting %',
    'Registered Voters', 'Accredited Voters',
    'Total Votes Cast', 'Valid Votes', 'Rejected Ballots',
    ...sortedParties,
    'Leading Party', 'Leading Votes',
  ];

  const rows = collations.map((c) => {
    const voteMap = new Map();
    for (const p of c.partyTotals || []) {
      voteMap.set(p.partyCode, p.votes);
    }

    return [
      c.stateCode,
      c.stateName || '',
      c.lgaCode,
      c.lgaName || '',
      c.pollingUnitsTotal,
      c.pollingUnitsReported,
      c.pollingUnitsVerified,
      c.reportingPercentage?.toFixed(2) || '0.00',
      c.registeredVoters,
      c.accreditedVoters,
      c.totalVotesCast,
      c.totalValidVotes,
      c.rejectedBallots,
      ...sortedParties.map((code) => voteMap.get(code) || 0),
      c.leadingParty?.partyCode || '—',
      c.leadingParty?.votes ?? 0,
    ].map(escapeCSV).join(',');
  });

  const csv = [headers.map(escapeCSV).join(','), ...rows].join('\n');
  const filename = `ERMS-${election.code}-collation-${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// Helper — escape strings that may contain commas or quotes
function escapeCSV(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

module.exports = { exportResultsCSV, exportCollationCSV };
