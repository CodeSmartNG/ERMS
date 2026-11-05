const { z } = require('zod');
const { ROLES } = require('../utils/roleScope');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ObjectId');

// Password policy: ≥12 chars, upper, lower, digit
const password = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token required'),
});

const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password,
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  phoneNumber: z.string().min(7).max(20).optional(),
  role: z.enum(Object.values(ROLES)),
  scope: z
    .object({
      state: objectId.optional(),
      lga: objectId.optional(),
      ward: objectId.optional(),
      pollingUnit: objectId.optional(),
    })
    .optional()
    .default({}),
});

module.exports = { loginSchema, refreshSchema, logoutSchema, registerSchema };
