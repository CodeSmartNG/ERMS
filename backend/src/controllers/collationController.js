
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

  if (!collation) {
    throw ApiError.notFound(
      'No national collation yet for this election'
    );
  }

  res.json({ collation });
}

// ---------------------------------------------------------------
// GET /api/collation/:election/states
// ---------------------------------------------------------------
async function listStates(req, res) {
  const { election } = req.params;

  const filter = scopeFilter(req, {
    state: 'entity',
  });

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
// ---------------------------------------------------------------
async function getState(req, res) {
  const { election, code } = req.params;
  const stateCode = code.toUpperCase();

  const state = await models.State.findOne({
    code: stateCode,
  }).lean();

  if (!state) {
    throw ApiError.notFound('State not found');
  }

  assertCanAccess(req, {
    state: state._id,
  });

  const [stateDoc, lgas] = await Promise.all([
    models.Collation.findOne({
      election,
      level: 'STATE',
      entity: state._id,
      isCurrent: true,
    }).lean(),

    models.Collation.find({
      election,
      level: 'LGA',
      stateCode,
      isCurrent: true,
    })
      .sort({ lgaCode: 1 })
      .lean(),
  ]);

  if (!stateDoc) {
    throw ApiError.notFound(
      'No collation for this state yet'
    );
  }

  res.json({
    state: stateDoc,
    lgas,
  });
}

// ---------------------------------------------------------------
// GET /api/collation/:election/lga/:code
// ---------------------------------------------------------------
async function getLGA(req, res) {
  const { election, code } = req.params;

  const lga = await models.LGA.findOne({
    code,
  }).lean();

  if (!lga) {
    throw ApiError.notFound('LGA not found');
  }

  assertCanAccess(req, {
    state: lga.state,
    lga: lga._id,
  });

  const [lgaDoc, wards] = await Promise.all([
    models.Collation.findOne({
      election,
      level: 'LGA',
      entity: lga._id,
      isCurrent: true,
    }).lean(),

    models.Collation.find({
      election,
      level: 'WARD',
      lgaCode: lga.code,
      isCurrent: true,
    })
      .sort({ wardCode: 1 })
      .lean(),
  ]);

  if (!lgaDoc) {
    throw ApiError.notFound(
      'No collation for this LGA yet'
    );
  }

  res.json({
    lga: lgaDoc,
    wards,
  });
}

// ---------------------------------------------------------------
// GET /api/collation/:election/ward/:code
// ---------------------------------------------------------------
async function getWard(req, res) {
  const { election, code } = req.params;

  const ward = await models.Ward.findOne({
    code,
  }).lean();

  if (!ward) {
    throw ApiError.notFound('Ward not found');
  }

  assertCanAccess(req, {
    state: ward.state,
    lga: ward.lga,
    ward: ward._id,
  });

  const [wardDoc, results] = await Promise.all([
    models.Collation.findOne({
      election,
      level: 'WARD',
      entity: ward._id,
      isCurrent: true,
    }).lean(),

    models.Result.find({
      election,
      ward: ward._id,
      isCurrent: true,
    })
      .populate('pollingUnit', 'code name')
      .select(
        'pollingUnit puCode totalVotesCast totalValidVotes accreditedVoters status partyVotes submittedAt verifiedAt'
      )
      .sort({ puCode: 1 })
      .lean(),
  ]);

  if (!wardDoc) {
    throw ApiError.notFound(
      'No collation for this ward yet'
    );
  }

  res.json({
    ward: wardDoc,
    results,
  });
}

// ---------------------------------------------------------------
// GET /api/collation/:election/pu/:code
// ---------------------------------------------------------------
async function getPU(req, res) {
  const { election, code } = req.params;

  const pu = await models.PollingUnit.findOne({
    code,
  }).lean();

  if (!pu) {
    throw ApiError.notFound('PollingUnit not found');
  }

  assertCanAccess(req, {
    state: pu.ancestors.state,
    lga: pu.ancestors.lga,
    ward: pu.ancestors.ward,
    pollingUnit: pu._id,
  });

  const current = await models.Result.findOne({
    election,
    pollingUnit: pu._id,
    isCurrent: true,
  })
    .populate('submittedBy', 'firstName lastName role')
    .populate('verifiedBy', 'firstName lastName role')
    .lean();

  const history = await models.Result.find({
    election,
    pollingUnit: pu._id,
  })
    .select(
      'version hash previousHash status totalVotesCast totalValidVotes submittedAt verifiedAt supersededBy'
    )
    .sort({ version: -1 })
    .lean();

  res.json({
    pollingUnit: pu,
    current,
    history,
  });
}

// ---------------------------------------------------------------
// GET /api/collation/:election/parties
//
// National Super Admin:
//   National party ranking.
//
// Party Admin:
//   Only their assigned party, within their assigned state.
//
// Other scoped administrators:
//   Ranking within their geographic scope.
// ---------------------------------------------------------------
async function partyRanking(req, res) {
  const { election } = req.params;
  const s = req.scope;

  // Party Admin must have both party and state.
  if (req.user.role === ROLES.PARTY_ADMIN) {
    if (!s?.party || !s?.state) {
      throw ApiError.forbidden(
        'Party Admin must have an assigned party and state'
      );
    }
  }

  // Choose a safe default level.
  let defaultLevel = 'NATIONAL';

  if (s?.level === 'STATE' || s?.level === 'PARTY') {
    defaultLevel = 'STATE';
  } else if (s?.level === 'LGA') {
    defaultLevel = 'LGA';
  } else if (s?.level === 'WARD') {
    defaultLevel = 'WARD';
  }

  const level = String(
    req.query.level || defaultLevel
  ).toUpperCase();

  const allowedLevels = [
    'NATIONAL',
    'STATE',
    'LGA',
    'WARD',
  ];

  if (!allowedLevels.includes(level)) {
    throw ApiError.badRequest(
      'Invalid collation level'
    );
  }

  // Party Admin can only request state-level ranking.
  if (
    req.user.role === ROLES.PARTY_ADMIN &&
    level !== 'STATE'
  ) {
    throw ApiError.forbidden(
      'Party Admin can only view party rankings within their assigned state'
    );
  }

  const filter = {
    election,
    isCurrent: true,
    level,
  };

  // Restrict geographic scope.
  if (s?.level !== 'NATIONAL') {
    if (s?.state) {
      const state = await models.State.findById(
        s.state
      ).select('code').lean();

      if (!state) {
        throw ApiError.forbidden(
          'Assigned state could not be found'
        );
      }

      filter.stateCode = state.code;
    }

    if (s?.lga) {
      const lga = await models.LGA.findById(
        s.lga
      ).select('code').lean();

      if (!lga) {
        throw ApiError.forbidden(
          'Assigned LGA could not be found'
        );
      }

      filter.lgaCode = lga.code;
    }

    if (s?.ward) {
      const ward = await models.Ward.findById(
        s.ward
      ).select('code').lean();

      if (!ward) {
        throw ApiError.forbidden(
          'Assigned ward could not be found'
        );
      }

      filter.wardCode = ward.code;
    }
  }

  // Aggregate only the party totals that match the scope.
  const pipeline = [
    {
      $match: filter,
    },
    {
      $unwind: '$partyTotals',
    },
  ];

  // CRITICAL SECURITY FILTER:
  // Party Admin only receives their assigned party.
  if (req.user.role === ROLES.PARTY_ADMIN) {
    pipeline.push({
      $match: {
        'partyTotals.party': s.party,
      },
    });
  }

  pipeline.push(
    {
      $group: {
        _id: '$partyTotals.party',
        partyCode: {
          $first: '$partyTotals.partyCode',
        },
        votes: {
          $sum: '$partyTotals.votes',
        },
      },
    },
    {
      $sort: {
        votes: -1,
      },
    },
    {
      $lookup: {
        from: 'parties',
        localField: '_id',
        foreignField: '_id',
        as: 'party',
      },
    },
    {
      $unwind: {
        path: '$party',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 0,
        partyId: '$_id',
        partyCode: 1,
        partyName: '$party.name',
        votes: 1,
      },
    }
  );

  const rows = await models.Collation.aggregate(
    pipeline
  );

  res.json({
    ranking: rows,
    level,
    scope: {
      state: s?.state || null,
      party:
        req.user.role === ROLES.PARTY_ADMIN
          ? s.party
          : null,
    },
  });
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
