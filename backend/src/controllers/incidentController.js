const mongoose = require('mongoose');
const models = require('../models');
const ApiError = require('../utils/ApiError');
const audit = require('../services/auditService');
const { scopeFilter, assertCanAccess } = require('../middleware/scope');
const {
  uploadIncidentPhotos,
  uploadIncidentVideos,
} = require('../services/incidentEvidenceService');
const { ROLES } = require('../utils/roleScope');

async function resolveIncidentGeo({ pollingUnit, ward, lga, state }) {
  if (pollingUnit) {
    const pu = await models.PollingUnit.findById(pollingUnit).lean();
    if (!pu || !pu.isActive) throw ApiError.badRequest('PollingUnit not found or inactive');
    return {
      pollingUnit: pu._id,
      ward: pu.ancestors.ward,
      lga: pu.ancestors.lga,
      state: pu.ancestors.state,
      path: pu.path,
    };
  }
  if (ward) {
    const w = await models.Ward.findById(ward).lean();
    if (!w || !w.isActive) throw ApiError.badRequest('Ward not found or inactive');
    return {
      pollingUnit: null,
      ward: w._id,
      lga: w.lga,
      state: w.state,
      path: [w.stateCode, w.lgaCode, w.code],
    };
  }
  if (lga) {
    const l = await models.LGA.findById(lga).lean();
    if (!l || !l.isActive) throw ApiError.badRequest('LGA not found or inactive');
    return {
      pollingUnit: null,
      ward: null,
      lga: l._id,
      state: l.state,
      path: [l.stateCode, l.code],
    };
  }
  if (state) {
    const s = await models.State.findById(state).lean();
    if (!s || !s.isActive) throw ApiError.badRequest('State not found or inactive');
    return {
      pollingUnit: null,
      ward: null,
      lga: null,
      state: s._id,
      path: [s.code],
    };
  }
  throw ApiError.badRequest('At least one location field is required');
}

// =================================================================
// SUBMIT
// =================================================================
async function submit(req, res) {
  const body = req.body;
  const { user } = req;

  const existing = await models.Incident.findOne({
    reporter: user._id,
    idempotencyKey: body.idempotencyKey,
  });
  if (existing) {
    return res.status(200).json({ incident: existing.toJSON(), idempotentReplay: true });
  }

  const geo = await resolveIncidentGeo(body);
  assertCanAccess(req, geo);

  if (body.election) {
    const election = await models.Election.findById(body.election).lean();
    if (!election) throw ApiError.badRequest('Election not found');
  }

  const photos = req.files?.photos || [];
  const videos = req.files?.videos || [];

  const uploadedPhotos = await uploadIncidentPhotos({
    files: photos,
    idempotencyKey: body.idempotencyKey,
  });
  const uploadedVideos = await uploadIncidentVideos({
    files: videos,
    idempotencyKey: body.idempotencyKey,
  });

  const incident = await models.Incident.create({
    reporter: user._id,
    reporterRole: user.role,

    pollingUnit: geo.pollingUnit,
    ward: geo.ward,
    lga: geo.lga,
    state: geo.state,
    path: geo.path,

    election: body.election || null,

    type: body.type,
    severity: body.severity,
    title: body.title,
    description: body.description,

    occurredAt: new Date(body.occurredAt),
    location: body.gps || undefined,

    evidence: {
      photos: uploadedPhotos,
      videos: uploadedVideos,
    },

    status: 'OPEN',
    idempotencyKey: body.idempotencyKey,
  });

  await audit.log({
    actor: user._id,
    actorRole: user.role,
    action: 'INCIDENT_REPORTED',
    entity: 'Incident',
    entityId: incident._id,
    metadata: {
      type: body.type,
      severity: body.severity,
      path: geo.path,
      photos: uploadedPhotos.length,
      videos: uploadedVideos.length,
    },
    req,
    severity: body.severity === 'CRITICAL' ? 'critical' : 'warning',
  });

  await notifySupervisors(geo, incident);
  res.status(201).json({ incident: incident.toJSON() });
}

async function notifySupervisors(geo, incident) {
  let recipientRole;
  let scopeField;
  let scopeId;

  if (geo.pollingUnit) {
    recipientRole = ROLES.WARD_ADMIN;
    scopeField = 'scope.ward';
    scopeId = geo.ward;
  } else if (geo.ward) {
    recipientRole = ROLES.LGA_ADMIN;
    scopeField = 'scope.lga';
    scopeId = geo.lga;
  } else if (geo.lga) {
    recipientRole = ROLES.STATE_ADMIN;
    scopeField = 'scope.state';
    scopeId = geo.state;
  } else {
    recipientRole = ROLES.NATIONAL_SUPER_ADMIN;
    scopeField = null;
  }

  const filter = { role: recipientRole, isActive: true };
  if (scopeField) filter[scopeField] = scopeId;

  const recipients = await models.User.find(filter).select('_id').lean();
  if (!recipients.length) return;

  await models.Notification.insertMany(
    recipients.map((r) => ({
      recipient: r._id,
      type: 'INCIDENT_REPORTED',
      title: `${incident.severity} incident reported: ${incident.type}`,
      body: incident.title,
      link: `/incidents/${incident._id}`,
      refModel: 'Incident',
      refId: incident._id,
      severity: incident.severity === 'CRITICAL' ? 'critical' : 'warning',
    }))
  );
}

// =================================================================
// LIST (scoped, with filters)
// =================================================================
async function list(req, res) {
  const q = req.query;
  const filter = { ...scopeFilter(req) };

  if (q.election) filter.election = q.election;
  if (q.type) filter.type = q.type;
  if (q.severity) filter.severity = q.severity;
  if (q.status) filter.status = q.status;
  if (q.assignedTo) filter.assignedTo = q.assignedTo;
  if (q.stateCode) filter['path.0'] = q.stateCode.toUpperCase();
  if (q.lgaCode) filter['path.1'] = q.lgaCode;
  if (q.wardCode) filter['path.2'] = q.wardCode;
  if (q.from || q.to) {
    filter.occurredAt = {};
    if (q.from) filter.occurredAt.$gte = new Date(q.from);
    if (q.to) filter.occurredAt.$lte = new Date(q.to);
  }

  const page = parseInt(q.page, 10) || 1;
  const limit = parseInt(q.limit, 10) || 50;

  const [items, total] = await Promise.all([
    models.Incident.find(filter)
      .sort({ occurredAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('reporter', 'firstName lastName role')
      .populate('election', 'code title')
      .populate('assignedTo', 'firstName lastName role')
      .lean(),
    models.Incident.countDocuments(filter),
  ]);

  res.json({
    incidents: items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

// =================================================================
// GET ONE
// =================================================================
async function getOne(req, res) {
  const incident = await models.Incident.findById(req.params.id)
    .populate('reporter', 'firstName lastName role scope')
    .populate('election', 'code title type')
    .populate('assignedTo', 'firstName lastName role')
    .populate('resolution.resolvedBy', 'firstName lastName role')
    .populate('pollingUnit', 'code name')
    .populate('ward', 'name code')
    .populate('lga', 'name code')
    .populate('state', 'name code');

  if (!incident) throw ApiError.notFound('Incident not found');
  assertCanAccess(req, incident);

  res.json({ incident: incident.toJSON() });
}

// =================================================================
// ASSIGN (ward admin and above — to a subordinate)
// =================================================================
async function assign(req, res) {
  const { assignedTo } = req.body;
  const incident = await models.Incident.findById(req.params.id);
  if (!incident) throw ApiError.notFound('Incident not found');
  assertCanAccess(req, incident);

  const assignee = await models.User.findById(assignedTo).lean();
  if (!assignee || !assignee.isActive) throw ApiError.badRequest('Assignee not found or inactive');

  const assigneeScope = assignee.scope || {};
  if (assigneeScope.state && !assigneeScope.state.equals(incident.state)) {
    throw ApiError.forbidden('Assignee is outside the incident state');
  }
  if (assigneeScope.lga && incident.lga && !assigneeScope.lga.equals(incident.lga)) {
    throw ApiError.forbidden('Assignee is outside the incident LGA');
  }
  if (assigneeScope.ward && incident.ward && !assigneeScope.ward.equals(incident.ward)) {
    throw ApiError.forbidden('Assignee is outside the incident ward');
  }

  incident.assignedTo = assignee._id;
  if (incident.status === 'OPEN') incident.status = 'ACKNOWLEDGED';
  await incident.save();

  await audit.log({
    actor: req.user._id, actorRole: req.user.role,
    action: 'INCIDENT_ASSIGNED',
    entity: 'Incident', entityId: incident._id,
    metadata: { assignedTo: assignee._id },
    req,
  });

  await models.Notification.create({
    recipient: assignee._id,
    type: 'INCIDENT_ASSIGNED',
    title: 'Incident assigned to you',
    body: incident.title,
    link: `/incidents/${incident._id}`,
    refModel: 'Incident', refId: incident._id,
  });

  res.json({ incident: incident.toJSON() });
}

// =================================================================
// UPDATE STATUS (assignee, supervisor, or admin)
// =================================================================
async function updateStatus(req, res) {
  const { status, notes } = req.body;
  const incident = await models.Incident.findById(req.params.id);
  if (!incident) throw ApiError.notFound('Incident not found');
  assertCanAccess(req, incident);

  const isAssignee = incident.assignedTo && incident.assignedTo.equals(req.user._id);
  const isAdminAbove = [ROLES.WARD_ADMIN, ROLES.LGA_ADMIN, ROLES.STATE_ADMIN, ROLES.NATIONAL_SUPER_ADMIN].includes(req.user.role);
  if (!isAssignee && !isAdminAbove) throw ApiError.forbidden('Only the assignee or an admin can change status');

  const TRANSITIONS = {
    OPEN: ['ACKNOWLEDGED', 'INVESTIGATING', 'DISMISSED'],
    ACKNOWLEDGED: ['INVESTIGATING', 'RESOLVED', 'DISMISSED'],
    INVESTIGATING: ['RESOLVED', 'DISMISSED'],
    RESOLVED: ['DISMISSED'],
    DISMISSED: [],
  };
  const allowed = TRANSITIONS[incident.status] || [];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(`Cannot transition from ${incident.status} to ${status}`);
  }

  incident.status = status;
  if (status === 'RESOLVED') {
    incident.resolution = {
      resolvedBy: req.user._id,
      resolvedAt: new Date(),
      notes: notes || null,
    };
  }
  await incident.save();

  await audit.log({
    actor: req.user._id, actorRole: req.user.role,
    action: 'INCIDENT_STATUS_CHANGED',
    entity: 'Incident', entityId: incident._id,
    metadata: { status, notes },
    req,
  });

  if (status === 'RESOLVED' || status === 'DISMISSED') {
    await models.Notification.create({
      recipient: incident.reporter,
      type: 'INCIDENT_RESOLVED',
      title: `Your incident was ${status.toLowerCase()}`,
      body: notes || incident.title,
      link: `/incidents/${incident._id}`,
      refModel: 'Incident', refId: incident._id,
      severity: status === 'RESOLVED' ? 'success' : 'info',
    });
  }

  res.json({ incident: incident.toJSON() });
}

// =================================================================
// GET MAP DATA (light payload for the dashboard heatmap)
// =================================================================
async function mapData(req, res) {
  const { election } = req.query;
  const filter = { ...scopeFilter(req) };
  if (election) filter.election = election;

  // Only fetch incidents that have GPS coordinates
  filter['location.lat'] = { $exists: true, $ne: null };
  filter['location.lng'] = { $exists: true, $ne: null };

  const incidents = await models.Incident.find(filter)
    .select('_id title type severity status location.lat location.lng occurredAt')
    .sort({ occurredAt: -1 })
    .limit(500)
    .lean();

  res.json({ incidents });
}

module.exports = { submit, list, getOne, assign, updateStatus, mapData };