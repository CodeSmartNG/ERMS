const models = require('../models');
const ApiError = require('../utils/ApiError');

// =================================================================
// LIST — the caller's notifications, newest first, with unread count
// =================================================================
async function list(req, res) {
  const filter = { recipient: req.user._id };

  if (req.query.unread === 'true') filter.isRead = false;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.severity) filter.severity = req.query.severity;

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const [notifications, total, unread] = await Promise.all([
    models.Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    models.Notification.countDocuments(filter),
    models.Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    }),
  ]);

  res.json({
    notifications,
    unread,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}

// =================================================================
// GET ONE — must belong to the caller
// =================================================================
async function getOne(req, res) {
  const notification = await models.Notification.findOne({
    _id: req.params.id,
    recipient: req.user._id,
  }).lean();

  if (!notification) throw ApiError.notFound('Notification not found');
  res.json({ notification });
}

// =================================================================
// MARK ONE READ
// =================================================================
async function markRead(req, res) {
  const notification = await models.Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  ).lean();

  if (!notification) throw ApiError.notFound('Notification not found');
  res.json({ notification });
}

// =================================================================
// MARK ALL READ — bulk operation, returns count
// =================================================================
async function markAllRead(req, res) {
  const result = await models.Notification.updateMany(
    { recipient: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  res.json({ updated: result.modifiedCount });
}

// =================================================================
// DELETE ONE — optional; useful for dismissible notifications
// =================================================================
async function remove(req, res) {
  const result = await models.Notification.deleteOne({
    _id: req.params.id,
    recipient: req.user._id,
  });

  if (result.deletedCount === 0) {
    throw ApiError.notFound('Notification not found');
  }
  res.json({ ok: true });
}

module.exports = { list, getOne, markRead, markAllRead, remove };
