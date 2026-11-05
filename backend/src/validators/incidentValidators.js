const { z } = require('zod');
const { INCIDENT_TYPES, SEVERITIES, INCIDENT_STATUSES } = require('../models/Incident');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ObjectId');

// Where the incident happened. At least one of the geo fields must be set;
// the controller enforces the "leaf" rule (state alone is fine, ward needs lga, etc.).
const locationScopeSchema = z.object({
  pollingUnit: objectId.optional(),
  ward: objectId.optional(),
  lga: objectId.optional(),
  state: objectId.optional(),
}).refine(
  (v) => v.pollingUnit || v.ward || v.lga || v.state,
  { message: 'At least one location field (pollingUnit/ward/lga/state) is required' }
);

const gpsSchema = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s) return undefined;
    try {
      const parsed = JSON.parse(s);
      if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') {
        throw new Error('lat and lng required');
      }
      return parsed;
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: `gps is invalid: ${e.message}` });
      return z.NEVER;
    }
  });

const submitIncidentSchema = z.object({
  type: z.enum(INCIDENT_TYPES),
  severity: z.enum(SEVERITIES).default('MEDIUM'),
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),

  election: objectId.optional(),

  // Location
  pollingUnit: objectId.optional(),
  ward: objectId.optional(),
  lga: objectId.optional(),
  state: objectId.optional(),

  occurredAt: z.string().datetime({ offset: true }),

  gps: gpsSchema,

  idempotencyKey: z.string().uuid('idempotencyKey must be a UUID v4'),
}).refine(
  (v) => v.pollingUnit || v.ward || v.lga || v.state,
  { message: 'At least one location field is required', path: ['state'] }
);

// Attaches to sub-schemas above; not used directly.
const _unused = locationScopeSchema;

const listIncidentsSchema = z.object({
  election: objectId.optional(),
  type: z.enum(INCIDENT_TYPES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  status: z.enum(INCIDENT_STATUSES).optional(),
  stateCode: z.string().max(10).optional(),
  lgaCode: z.string().max(30).optional(),
  wardCode: z.string().max(60).optional(),
  assignedTo: objectId.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const updateStatusSchema = z.object({
  status: z.enum(INCIDENT_STATUSES),
  notes: z.string().max(2000).optional(),
  assignedTo: objectId.optional(),
});

const assignSchema = z.object({
  assignedTo: objectId,
  notes: z.string().max(2000).optional(),
});

const resolveSchema = z.object({
  notes: z.string().min(5).max(2000),
});

module.exports = {
  submitIncidentSchema,
  listIncidentsSchema,
  updateStatusSchema,
  assignSchema,
  resolveSchema,
};
