
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

// Normalize ObjectIds and populated references.
function normalizeId(value) {
  if (!value) return null;

  if (typeof value === 'object' && value._id) {
    return String(value._id);
  }

  if (typeof value === 'object' && value.id) {
    return String(value.id);
  }

  return String(value);
}

function sameId(a, b) {
  const first = normalizeId(a);
  const second = normalizeId(b);

  return !!first && !!second && first === second;
}

// Convert MongoDB duplicate-key errors into useful messages.
function duplicateKeyMessage(err) {
  if (err?.code !== 11000) return null;

  const field = Object.keys(
    err.keyPattern || err.keyValue || {}
  )[0];

  if (field === 'email') {
    return 'This email address is already registered. Please use another email.';
  }

  if (field === 'phoneNumber') {
    return 'This phone number is already registered. Check the existing database index.';
  }

  return `Duplicate value detected for ${field || 'a unique database field'}.`;
}

// ---------------------------------------------------------------- LOGIN
async function login(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { password } = req.body;

  const user = await User.findOne({ email }).select('+password');

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

// --------------------------------------------------------------- REFRESH
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

// ---------------------------------------------------------------- LOGOUT
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

// ---------------------------------------------------------------- ME
async function me(req, res) {
  res.json({ user: req.user.toJSON() });
}

// ------------------------------------------------------------- REGISTER
// Only authorized users can provision accounts.
async function register(req, res) {
  const {
    email,
    password,
    firstName,
    lastName,
    phoneNumber,
    role,
    scope = {},
  } = req.body || {};

  // 1. Validate basic fields.
  if (
    !email ||
    !password ||
    !firstName ||
    !lastName ||
    !role
  ) {
    throw ApiError.badRequest(
      'Email, password, first name, last name and role are required'
    );
  }

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof firstName !== 'string' ||
    typeof lastName !== 'string'
  ) {
    throw ApiError.badRequest('Invalid registration data');
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || password.length < 12) {
    throw ApiError.badRequest(
      'A valid email and password of at least 12 characters are required'
    );
  }

  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    throw ApiError.badRequest('Invalid user scope');
  }

  // 2. Check creator permissions.
  if (!canCreateRole(req.user.role, role)) {
    throw ApiError.forbidden(
      `Role ${req.user.role} cannot create ${role}`
    );
  }

  // 3. Build final scope BEFORE checking required fields.
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
      // Do not allow scoped creators to delegate outside their scope.
      if (
        requestedValue &&
        !sameId(creatorValue, requestedValue)
      ) {
        throw ApiError.forbidden(
          `Cannot create user in ${field} outside your scope`
        );
      }

      // Inherit the creator's authorized scope.
      finalScope[field] = normalizeId(creatorValue);
    } else if (requestedValue) {
      finalScope[field] = normalizeId(requestedValue);
    }
  }

  // 4. Validate required fields AFTER scope inheritance.
  const required = requiredScopeFields(role);

  for (const field of required) {
    if (!finalScope[field]) {
      throw ApiError.badRequest(
        `scope.${field} is required for role ${role}`
      );
    }
  }

  // 5. Validate MongoDB ObjectIds.
  const ObjectId = User.base.Types.ObjectId;

  for (const field of SCOPE_FIELDS) {
    const value = finalScope[field];

    if (value && !ObjectId.isValid(value)) {
      throw ApiError.badRequest(
        `Invalid MongoDB ID supplied for scope.${field}`
      );
    }
  }

  // 6. Normalize optional phone number.
  const normalizedPhone = phoneNumber
    ? String(phoneNumber).trim()
    : null;

  // 7. Check email before attempting account creation.
  const existingUser = await User.findOne({
    email: normalizedEmail,
  }).select('_id');

  if (existingUser) {
    throw ApiError.conflict
      ? ApiError.conflict('This email address is already registered.')
      : ApiError.badRequest('This email address is already registered.');
  }

  // 8. Create account.
  let user;

  try {
    user = await User.create({
      email: normalizedEmail,
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phoneNumber: normalizedPhone,
      role,
      scope: finalScope,
      createdBy: req.user._id,
    });
  } catch (err) {
    // Handles duplicate-key races and legacy unique indexes.
    const duplicateMessage = duplicateKeyMessage(err);

    if (duplicateMessage) {
      throw ApiError.badRequest(duplicateMessage);
    }

    // Preserve the existing model validation errors.
    if (err?.name === 'ValidationError') {
      throw ApiError.badRequest(err.message);
    }

    throw err;
  }

  // 9. Audit account creation.
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
      lga: finalScope.lga,
    },
    req,
  });

  // 10. Return result.
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
