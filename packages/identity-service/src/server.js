require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { ZodError } = require('zod');

const { auditClient, buildCorsOptions } = require('@froncort/shared');
const { connectRedis } = require('./lib/redis');
const { AppError } = require('./lib/errors');
const { router: authRoutes } = require('./routes/auth.routes');
const orgsRoutes = require('./routes/orgs.routes');
const connectionsRoutes = require('./routes/connections.routes');
const internalRoutes = require('./routes/internal.routes');

const app = express();

app.use(helmet());
app.use(cors(buildCorsOptions())); // Locked to CORS_ALLOWED_ORIGINS at Phase 6
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.json({ data: { status: 'ok', service: 'identity-service' } });
});

app.use('/auth', authRoutes);
app.use('/orgs', orgsRoutes);
app.use('/connections', connectionsRoutes);
app.use('/internal', internalRoutes);

app.use((req, res) => {
  res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { message: err.errors[0]?.message || 'Invalid request body', code: 'VALIDATION_ERROR' },
    });
  }
  if (err instanceof auditClient.AuditLogError) {
    return res.status(err.statusCode).json({ error: { message: err.message, code: err.code } });
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { message: err.message, code: err.code } });
  }
  // Prisma's "malformed ID" error on a path param — treat identically to a
  // real not-found rather than leaking a 500/stack detail (CLAUDE.md rule #2
  // spirit: never reveal more than "this doesn't exist" to a caller poking
  // at IDs that aren't theirs).
  if (err && err.code === 'P2023') {
    return res.status(404).json({ error: { message: 'Resource not found', code: 'NOT_FOUND' } });
  }
  console.error(err);
  return res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
});

const PORT = process.env.IDENTITY_PORT || 4001;

// Guarded so `require`-ing this file (e.g. from tests/, which needs the
// `app` instance without binding the fixed port) never auto-starts a real
// listener. Only the actual `node src/server.js` entry point does.
if (require.main === module) {
  connectRedis()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`identity-service listening on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('identity-service failed to connect to Redis:', err.message);
      process.exit(1);
    });
}

module.exports = app;
