const express = require('express');
const { z } = require('zod');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { authenticate } = require('@froncort/shared');
const authService = require('../services/auth.service');
const { AppError } = require('../lib/errors');

const router = express.Router();

const REFRESH_COOKIE_NAME = 'froncort_refresh_token';
const REFRESH_TTL_MS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10) * 24 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  };
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...cookieOptions(), maxAge: REFRESH_TTL_MS });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  orgName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const switchOrgSchema = z.object({
  orgId: z.string().uuid(),
});

// Locked: 5 attempts / 15 min, keyed by IP + email combined. No standard/legacy
// rate-limit headers exposed — don't leak internal throttle state.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${(req.body && req.body.email) || ''}`,
  handler: (req, res) => {
    res.status(429).json({
      error: { message: 'Too many login attempts. Try again later.', code: 'RATE_LIMITED' },
    });
  },
});

router.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const result = await authService.register(body);
    setRefreshCookie(res, result.refreshToken);
    res.status(201).json({
      data: { accessToken: result.accessToken, user: result.user, memberships: result.memberships },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body);
    setRefreshCookie(res, result.refreshToken);
    res.json({
      data: { accessToken: result.accessToken, user: result.user, memberships: result.memberships },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const oldToken = req.cookies ? req.cookies[REFRESH_COOKIE_NAME] : undefined;
    const result = await authService.refresh(oldToken);
    setRefreshCookie(res, result.refreshToken);
    res.json({ data: { accessToken: result.accessToken } });
  } catch (err) {
    if (err instanceof AppError) {
      clearRefreshCookie(res);
    }
    next(err);
  }
});

router.post('/switch-org', authenticate, async (req, res, next) => {
  try {
    const { orgId } = switchOrgSchema.parse(req.body);
    const refreshToken = req.cookies ? req.cookies[REFRESH_COOKIE_NAME] : undefined;
    const result = await authService.switchOrg(req.user.id, refreshToken, orgId);
    res.json({ data: { accessToken: result.accessToken } });
  } catch (err) {
    next(err);
  }
});

router.delete('/session', authenticate, async (req, res, next) => {
  try {
    await authService.logoutEverywhere(req.user.id);
    clearRefreshCookie(res);
    res.json({ data: { loggedOut: true } });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await authService.getMe(req.user.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, REFRESH_COOKIE_NAME };
