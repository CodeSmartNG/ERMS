const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ObjectId');

const partyVoteSchema = z.object({
  party: objectId,
  votes: z.number().int().min(0).max(100000),
});

const gpsSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracyM: z.number().min(0).max(10000).optional(),
}).optional();

// Body arrives as multipart/form-data, so all fields are strings.
// We use z.coerce to convert them cleanly.
const submitResultSchema = z.object({
  election: objectId,
  pollingUnit: objectId,

  registeredVoters: z.coerce.number().int().min(0).max(100000),
  accreditedVoters: z.coerce.number().int().min(0).max(100000),
  totalVotesCast:   z.coerce.number().int().min(0).max(100000),
  rejectedBallots:  z.coerce.number().int().min(0).max(100000).default(0),

  partyVotes: z
    .string()
    .transform((s, ctx) => {
      try {
        const parsed = JSON.parse(s);
        if (!Array.isArray(parsed)) throw new Error('must be an array');
        return parsed;
      } catch (e) {
        ctx.addIssue({ code: 'custom', message: `partyVotes is not valid JSON: ${e.message}` });
        return z.NEVER;
      }
    })
    .pipe(z.array(partyVoteSchema).min(1).max(30)),

  idempotencyKey: z.string().uuid('idempotencyKey must be a UUID v4'),

  capturedAt: z.string().datetime({ offset: true }).optional(),
  deviceId:   z.string().max(200).optional(),
  gps: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s) return undefined;
      try { return JSON.parse(s); } catch {
        ctx.addIssue({ code: 'custom', message: 'gps is not valid JSON' });
        return z.NEVER;
      }
    })
    .pipe(gpsSchema),

  notes: z.string().max(2000).optional(),
});

const listResultsSchema = z.object({
  election: objectId.optional(),
  pollingUnit: objectId.optional(),
  stateCode: z.string().max(10).optional(),
  lgaCode: z.string().max(30).optional(),
  wardCode: z.string().max(50).optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'VERIFIED', 'FLAGGED', 'REJECTED', 'SUPERSEDED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const verifyResultSchema = z.object({
  notes: z.string().max(2000).optional(),
});

const flagResultSchema = z.object({
  reason: z.string().min(5).max(1000),
});

const rejectResultSchema = z.object({
  reason: z.string().min(5).max(1000),
});

module.exports = {
  submitResultSchema,
  listResultsSchema,
  verifyResultSchema,
  flagResultSchema,
  rejectResultSchema,
};
