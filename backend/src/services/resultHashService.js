const crypto = require('crypto');

/**
 * Builds the canonical JSON string used for hashing.
 * Rules:
 *  - Only fields that are part of the "vote record" are included
 *  - Keys sorted alphabetically
 *  - partyVotes sorted by partyCode
 *  - Numbers coerced via Number() so "10" and 10 hash the same
 *  - ISO string timestamps
 */
function canonicalPayload(result) {
  const partyVotes = [...result.partyVotes]
    .map((p) => ({ partyCode: String(p.partyCode), votes: Number(p.votes) }))
    .sort((a, b) => a.partyCode.localeCompare(b.partyCode));

  const payload = {
    accreditedVoters: Number(result.accreditedVoters),
    election: result.election.toString(),
    evidenceHash: result.evidence.photoHash,
    lgaCode: result.lgaCode,
    partyVotes,
    pollingUnit: result.pollingUnit.toString(),
    puCode: result.puCode,
    rejectedBallots: Number(result.rejectedBallots),
    registeredVoters: Number(result.registeredVoters),
    stateCode: result.stateCode,
    totalValidVotes: Number(result.totalValidVotes),
    totalVotesCast: Number(result.totalVotesCast),
    wardCode: result.wardCode,
  };

  return JSON.stringify(payload, Object.keys(payload).sort());
}

/**
 * SHA-256 over `previousHash || canonicalPayload`.
 * previousHash is "" for the first version.
 */
function computeHash(result, previousHash) {
  const canonical = canonicalPayload(result);
  const material = `${previousHash || ''}${canonical}`;
  return crypto.createHash('sha256').update(material).digest('hex');
}

/** Recompute and compare — used by verification and audits. */
function verifyHash(result) {
  const expected = computeHash(result, result.previousHash);
  return expected === result.hash;
}

module.exports = { canonicalPayload, computeHash, verifyHash };
