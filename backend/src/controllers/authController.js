const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const audit = require('../services/auditService');
const { canCreateRole, requiredScopeFields } = require('../utils/roleScope');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('../utils/tokens');

const MAX_REFRESH_SESSIONS = 5;

// ---------------------------------------------------------------- login
async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) {
    await audit.log({ action: 'AUTH_LOGIN_FAILED', metadata: { email, reason: 'user_not_found' }, req, severity: 'warning' });
    throw ApiError.unauthorized('Invalid credentials');
  }
  if (!user.isActive) {
    await audit.log({ actor: user._id, actorRole: user.role, action: 'AUTH_LOGIN_FAILED', metadata: { reason: 'inactive' }, req, severity: 'warning' });
    throw ApiError.unauthorized('Account is inactive');
  }

  const ok = await user.comparePassword(password);
  if (!ok) {
    await audit.log({ actor: user._id, actorRole: user.role, action: 'AUTH_LOGIN_FAILED', metadata: { reason: 'bad_password' }, req, severity: 'warning' });
    throw ApiError.unauthorized('Invalid credentials');
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const refreshHash = hashToken(refreshToken);

  await User.updateOne(
    { _id: user._id },
    {
      $push: { refreshTokenHashes: { $each: [refreshHash], $slice: -MAX_REFRESH_SESSIONS } },
      $set: { lastLoginAt: new Date(), lastLoginIp: req.ip },
    }
  );

  await audit.log({ actor: user._id, actorRole: user.role, action: 'AUTH_LOGIN_SUCCESS', req });

  res.json({ accessToken, refreshToken, user: user.toJSON() });
}

// --------------------------------------------------------------- refresh
// Token rotation: old refresh hash is removed, new one added.
// Reuse of an already-rotated token ⇒ assume theft ⇒ revoke ALL sessions.
async function refresh(req, res) {
  const { refreshToken } = req.body;

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const hash = hashToken(refreshToken);
  const user = await User.findOne({ _id: payload.sub, refreshTokenHashes: hash });

  if (!user) {
    // Token valid by signature but not present in DB ⇒ reuse/theft.
    const owner = await User.findById(payload.sub);
    if (owner) {
      await User.updateOne({ _id: owner._id }, { $set: { refreshTokenHashes: [] } });
      await audit.log({ actor: owner._id, action: 'AUTH_REFRESH_REUSE_DETECTED', req, severity: 'critical' });
    }
    throw ApiError.unauthorized('Invalid refresh token');
  }
  if (!user.isActive) throw ApiError.unauthorized('Account is inactive');

  const newRefresh = signRefreshToken(user);
  const newHash = hashToken(newRefresh);

  await User.updateOne({ _id: user._id }, { $pull: { refreshTokenHashes: hash } });
  await User.updateOne(
    { _id: user._id },
    { $push: { refreshTokenHashes: { $each: [newHash], $slice: -MAX_REFRESH_SESSIONS } } }
  );

  await audit.log({ actor: user._id, actorRole: user.role, action: 'AUTH_REFRESH_SUCCESS', req });

  res.json({ accessToken: signAccessToken(user), refreshToken: newRefresh });
}

// ---------------------------------------------------------------- logout
async function logout(req, res) {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    const hash = hashToken(refreshToken);
    await User.updateOne({ _id: req.user._id }, { $pull: { refreshTokenHashes: hash } });
  }
  await audit.log({ actor: req.user._id, actorRole: req.user.role, action: 'AUTH_LOGOUT', req });
  res.json({ message: 'Logged out' });
}

// ------------------------------------------------------------------- me
async function me(req, res) {
  res.json({ user: req.user.toJSON() });
}

// ------------------------------------------------------------- register
// Only provisioned accounts. No public signup.
async function register(req, res) {
  const { email, password, firstName, lastName, phoneNumber, role, scope } = req.body;

  // 1) Can the creator create this role?
  if (!canCreateRole(req.user.role, role)) {
    throw ApiError.forbidden(`Role ${req.user.role} cannot create ${role}`);
  }

  // 2) Does the requested scope contain the fields the role requires?
  const required = requiredScopeFields(role);
  for (const field of required) {
    if (!scope?.[field]) throw ApiError.badRequest(`scope.${field} is required for role ${role}`);
  }

  // 3) Scope containment: creator can only delegate scope within their own.
  const creatorScope = req.user.scope || {};
  const finalScope = { state: null, lga: null, ward: null, pollingUnit: null };
  for (const field of ['state', 'lga', 'ward', 'pollingUnit']) {
    if (creatorScope[field]) {
      // Creator is scoped — force the same value.
      if (scope?.[field] && !creatorScope[field].equals(scope[field])) {
        throw ApiError.forbidden(`Cannot create user in ${field} outside your scope`);
      }
      finalScope[field] = creatorScope[field];
    } else if (scope?.[field]) {
      finalScope[field] = scope[field];
    }
  }
  for (const field of required) {
    if (!finalScope[field]) {
      throw ApiError.forbidden(`Cannot create ${role}: missing ${field} after scope containment`);
    }
  }

  // 4) Create (password is hashed by the User pre-save hook).
  const user = await User.create({
    email: email.toLowerCase(),
    password,
    firstName,
    lastName,
    phoneNumber: phoneNumber || null,
    role,
    scope: finalScope,
    createdBy: req.user._id,
  });

  await audit.log({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'USER_CREATED',
    entity: 'User',
    entityId: user._id,
    metadata: { role, email: user.email },
    req,
  });

  res.status(201).json({ user: user.toJSON() });
}

module.exports = { login, refresh, logout, me, register };
