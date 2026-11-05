const models = require('../models');
const ApiError = require('../utils/ApiError');
const { scopeFilter, assertCanAccess } = require('../middleware/scope');
const { ROLES } = require('../utils/roleScope');

// ---------------------------------------------------------------
// GET /api/collation/:election/national
// ---------------------------------------------------------------
async function getNational(req, res) {
  const { election } = req.params;

  const collation = await models.Collation.findOne({
    election,
    level: 'NATIONAL',
    isCurrent: true,
  }).lean();

  if (!collation) throw ApiError.notFound('No national collation yet for this election');

  // National view is unrestricted — everyone can see it (observer mode).
  res.json({ collation });
}

// ---------------------------------------------------------------
// GET /api/collation/:election/states
// One row per state — the national map view.
// ---------------------------------------------------------------
async function listStates(req, res) {
  const { election } = req.params;
  const filter = scopeFilter(req, { state: 'entity' }); // STATE collations keyed by entity=State._id

  const rows = await models.Collation.find({
    election,
    level: 'STATE',
    isCurrent: true,
    ...filter,
  })
    .sort({ stateCode: 1 })
    .lean();

  res.json({ states: rows });
}

// ---------------------------------------------------------------
// GET /api/collation/:election/state/:code
// One state + its LGA list (drill-down).
// ---------------------------------------------------------------
async function getState(req, res) {
  const { election, code } = req.params;
  const stateCode = code.toUpperCase();

  const state = await models.State.findOne({ code: stateCode }).lean();
  if (!state) throw ApiError.notFound('State not found');
  assertCanAccess(req, { state: state._id });

  const [stateDoc, lgas] = await Promise.all([
    models.Collation.findOne({
      election, level: 'STATE', entity: state._id, isCurrent: true,
    }).lean(),
    models.Collation.find({
      election, level: 'LGA', stateCode, isCurrent: true,
    })
      .sort({ lgaCode: 1 })
      .lean(),
  ]);

  if (!stateDoc) throw ApiError.notFound('No collation for this state yet');
  res.json({ state: stateDoc, lgas });
}

// ---------------------------------------------------------------
// GET /api/collation/:election/lga/:code
// One LGA + its ward list.
// ---------------------------------------------------------------
async function getLGA(req, res) {
  const { election, code } = req.params;

  const lga = await models.LGA.findOne({ code }).lean();
  if (!lga) throw ApiError.notFound('LGA not found');
  assertCanAccess(req, { state: lga.state, lga: lga._id });

  const [lgaDoc, wards] = await Promise.all([
    models.Collation.findOne({
      election, level: 'LGA', entity: lga._id, isCurrent: true,
    }).lean(),
    models.Collation.find({
      election, level: 'WARD', lgaCode: lga.code, isCurrent: true,
    })
      .sort({ wardCode: 1 })
      .lean(),
  ]);

  if (!lgaDoc) throw ApiError.notFound('No collation for this LGA yet');
  res.json({ lga: lgaDoc, wards });
}

// ---------------------------------------------------------------
// GET /api/collation/:election/ward/:code
// One ward + its PU-level raw results.
// ---------------------------------------------------------------
async function getWard(req, res) {
  const { election, code } = req.params;

  const ward = await models.Ward.findOne({ code }).lean();
  if (!ward) throw ApiError.notFound('Ward not found');
  assertCanAccess(req, { state: ward.state, lga: ward.lga, ward: ward._id });

  const [wardDoc, results] = await Promise.all([
    models.Collation.findOne({
      election, level: 'WARD', entity: ward._id, isCurrent: true,
    }).lean(),
    models.Result.find({
      election, ward: ward._id, isCurrent: true,
    })
      .populate('pollingUnit', 'code name')
      .select('pollingUnit puCode totalVotesCast totalValidVotes accreditedVoters status partyVotes submittedAt verifiedAt')
      .sort({ puCode: 1 })
      .lean(),
  ]);

  if (!wardDoc) throw ApiError.notFound('No collation for this ward yet');
  res.json({ ward: wardDoc, results });
}

// ---------------------------------------------------------------
// GET /api/collation/:election/pu/:code
// One PU's full result(s) — current only.
// ---------------------------------------------------------------
async function getPU(req, res) {
  const { election, code } = req.params;

  const pu = await models.PollingUnit.findOne({ code }).lean();
  if (!pu) throw ApiError.notFound('PollingUnit not found');
  assertCanAccess(req, {
    state: pu.ancestors.state,
    lga: pu.ancestors.lga,
    ward: pu.ancestors.ward,
    pollingUnit: pu._id,
  });

  const current = await models.Result.findOne({
    election, pollingUnit: pu._id, isCurrent: true,
  })
    .populate('submittedBy', 'firstName lastName role')
    .populate('verifiedBy', 'firstName lastName role')
    .lean();

  // History — every version, newest first (audit trail for this PU)
  const history = await models.Result.find({ election, pollingUnit: pu._id })
    .select('version hash previousHash status totalVotesCast totalValidVotes submittedAt verifiedAt supersededBy')
    .sort({ version: -1 })
    .lean();

  res.json({ pollingUnit: pu, current, history });
}

// ---------------------------------------------------------------
// GET /api/collation/:election/parties
// Ranking across the entire country (or the caller's scope).
// ---------------------------------------------------------------
async function partyRanking(req, res) {
  const { election } = req.params;
  const level = req.query.level || 'NATIONAL';

  const filter = { election, isCurrent: true, level };
  const s = req.scope;
  if (s.level !== 'NATIONAL') {
    if (s.state) filter.stateCode = (await models.State.findById(s.state).lean())?.code;
    if (s.lga) filter.lgaCode = (await models.LGA.findById(s.lga).lean())?.code;
  }

  const rows = await models.Collation.aggregate([
    { $match: filter },
    { $unwind: '$partyTotals' },
    {
      $group: {
        _id: '$partyTotals.party',
        partyCode: { $first: '$partyTotals.partyCode' },
        votes: { $sum: '$partyTotals.votes' },
      },
    },
    { $sort: { votes: -1 } },
    {
      $lookup: {
        from: 'parties',
        localField: '_id',
        foreignField: '_id',
        as: 'party',
      },
    },
    { $unwind: { path: '$party', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        partyId: '$_id',
        partyCode: 1,
        partyName: '$party.name',
        votes: 1,
      },
    },
  ]);

  res.json({ ranking: rows, level });
}

module.exports = {
  getNational,
  listStates,
  getState,
  getLGA,
  getWard,
  getPU,
  partyRanking,
};
