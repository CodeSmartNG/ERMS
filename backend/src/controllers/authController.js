
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const audit = require('../services/auditService');
const {
  canCreateRole,
  requiredScopeFields,
} = require('../utils/roleScope');

const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('../utils/tokens');

const MAX_REFRESH_SESSIONS = 5;

const SCOPE_FIELDS = [
  'party',
  'state',
  'lga',
  'ward',
  'pollingUnit',
];

// Safely compare MongoDB ObjectIds and string IDs.
function sameId(a, b) {
  if (!a || !b) return false;
  return String(a) === String(b);
}

// ---------------------------------------------------------------- login
async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findOne({
    email: email.toLowerCase(),
  }).select('+password');

  if (!user) {
    await audit.log({
      action: 'AUTH_LOGIN_FAILED',
      metadata: { email, reason: 'user_not_found' },
      req,
      severity: 'warning',
    });

    throw ApiError.unauthorized('Invalid credentials');
  }

  if (!user.isActive) {
    await audit.log({
      actor: user._id,
      actorRole: user.role,
      action: 'AUTH_LOGIN_FAILED',
      metadata: { reason: 'inactive' },
      req,
      severity: 'warning',
    });

    throw ApiError.unauthorized('Account is inactive');
  }

  const ok = await user.comparePassword(password);

  if (!ok) {
    await audit.log({
      actor: user._id,
      actorRole: user.role,
      action: 'AUTH_LOGIN_FAILED',
      metadata: { reason: 'bad_password' },
      req,
      severity: 'warning',
    });

    throw ApiError.unauthorized('Invalid credentials');
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const refreshHash = hashToken(refreshToken);

  await User.updateOne(
    { _id: user._id },
    {
      $push: {
        refreshTokenHashes: {
          $each: [refreshHash],
          $slice: -MAX_REFRESH_SESSIONS,
        },
      },
      $set: {
        lastLoginAt: new Date(),
        lastLoginIp: req.ip,
      },
    }
  );

  await audit.log({
    actor: user._id,
    actorRole: user.role,
    action: 'AUTH_LOGIN_SUCCESS',
    req,
  });

  res.json({
    accessToken,
    refreshToken,
    user: user.toJSON(),
  });
}

// --------------------------------------------------------------- refresh
// Rotate refresh tokens. Reuse of a rotated token revokes all sessions.
async function refresh(req, res) {
  const { refreshToken } = req.body;

  let payload;

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const hash = hashToken(refreshToken);

  const user = await User.findOne({
    _id: payload.sub,
    refreshTokenHashes: hash,
  });

  if (!user) {
    const owner = await User.findById(payload.sub);

    if (owner) {
      await User.updateOne(
        { _id: owner._id },
        { $set: { refreshTokenHashes: [] } }
      );

      await audit.log({
        actor: owner._id,
        action: 'AUTH_REFRESH_REUSE_DETECTED',
        req,
        severity: 'critical',
      });
    }

    throw ApiError.unauthorized('Invalid refresh token');
  }

  if (!user.isActive) {
    throw ApiError.unauthorized('Account is inactive');
  }

  const newRefresh = signRefreshToken(user);
  const newHash = hashToken(newRefresh);

  await User.updateOne(
    { _id: user._id },
    { $pull: { refreshTokenHashes: hash } }
  );

  await User.updateOne(
    { _id: user._id },
    {
      $push: {
        refreshTokenHashes: {
          $each: [newHash],
          $slice: -MAX_REFRESH_SESSIONS,
        },
      },
    }
  );

  await audit.log({
    actor: user._id,
    actorRole: user.role,
    action: 'AUTH_REFRESH_SUCCESS',
    req,
  });

  res.json({
    accessToken: signAccessToken(user),
    refreshToken: newRefresh,
  });
}

// ---------------------------------------------------------------- logout
async function logout(req, res) {
  const { refreshToken } = req.body || {};

  if (refreshToken) {
    const hash = hashToken(refreshToken);

    await User.updateOne(
      { _id: req.user._id },
      { $pull: { refreshTokenHashes: hash } }
    );
  }

  await audit.log({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'AUTH_LOGOUT',
    req,
  });

  res.json({ message: 'Logged out' });
}

// ------------------------------------------------------------------- me
async function me(req, res) {
  res.json({ user: req.user.toJSON() });
}

// ------------------------------------------------------------- register
// Only provisioned accounts. No public signup.
async function register(req, res) {
  const {
    email,
    password,
    firstName,
    lastName,
    phoneNumber,
    role,
    scope = {},
  } = req.body;

  // 1. Validate required registration fields.
  if (!email || !password || !firstName || !lastName || !role) {
    throw ApiError.badRequest(
      'Email, password, first name, last name and role are required'
    );
  }

  // 2. Check whether the creator can create this role.
  if (!canCreateRole(req.user.role, role)) {
    throw ApiError.forbidden(
      `Role ${req.user.role} cannot create ${role}`
    );
  }

  // 3. Validate requested scope fields.
  const required = requiredScopeFields(role);

  for (const field of required) {
    if (!scope[field]) {
      throw ApiError.badRequest(
        `scope.${field} is required for role ${role}`
      );
    }
  }

  // 4. Enforce creator scope containment.
  const creatorScope = req.user.scope || {};

  const finalScope = {
    party: null,
    state: null,
    lga: null,
    ward: null,
    pollingUnit: null,
  };

  for (const field of SCOPE_FIELDS) {
    const creatorValue = creatorScope[field];
    const requestedValue = scope[field];

    if (creatorValue) {
      // A scoped creator cannot delegate outside their own scope.
      if (
        requestedValue &&
        !sameId(creatorValue, requestedValue)
      ) {
        throw ApiError.forbidden(
          `Cannot create user in ${field} outside your scope`
        );
      }

      // Always inherit the creator's scope.
      finalScope[field] = creatorValue;
    } else if (requestedValue) {
      finalScope[field] = requestedValue;
    }
  }

  // 5. Verify all required fields after scope containment.
  for (const field of required) {
    if (!finalScope[field]) {
      throw ApiError.badRequest(
        `Cannot create ${role}: scope.${field} is missing`
      );
    }
  }

  // 6. Validate that supplied scope IDs are valid MongoDB ObjectIds.
  for (const field of SCOPE_FIELDS) {
    const value = finalScope[field];

    if (value && !User.base.Types.ObjectId.isValid(value)) {
      throw ApiError.badRequest(
        `Invalid MongoDB ID supplied for scope.${field}`
      );
    }
  }

  // 7. Create account. Password is hashed by the User pre-save hook.
  const user = await User.create({
    email: email.toLowerCase().trim(),
    password,
    firstName,
    lastName,
    phoneNumber: phoneNumber || null,
    role,
    scope: finalScope,
    createdBy: req.user._id,
  });

  // 8. Record account creation.
  await audit.log({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'USER_CREATED',
    entity: 'User',
    entityId: user._id,
    metadata: {
      role,
      email: user.email,
      party: finalScope.party,
      state: finalScope.state,
    },
    req,
  });

  res.status(201).json({
    message: 'User created successfully',
    user: user.toJSON(),
  });
}

module.exports = {
  login,
  refresh,
  logout,
  me,
  register,
};
