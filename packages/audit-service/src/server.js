require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { ZodError } = require('zod');

const { buildCorsOptions } = require('@froncort/shared');
const { AppError } = require('./lib/errors');
const internalRoutes = require('./routes/internal.routes');
const auditLogRoutes = require('./routes/auditLog.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const { startDigestScheduler } = require('./scheduler');

const app = express();

app.use(helmet());
app.use(cors(buildCorsOptions())); // Locked to CORS_ALLOWED_ORIGINS at Phase 6
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ data: { status: 'ok', service: 'audit-service' } });
});

app.use('/internal', internalRoutes);
app.use('/', auditLogRoutes);
app.use('/notifications', notificationsRoutes);

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
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { message: err.message, code: err.code } });
  }
  console.error(err);
  return res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
});

// Render (unlike Railway) assigns its own port via $PORT and requires the
// app to bind to it — AUDIT_PORT stays first for local dev/Railway parity
// with the other 3 services' locked port table, PORT only wins when the
// platform actually sets it.
const PORT = process.env.PORT || process.env.AUDIT_PORT || 4004;

// Guarded so `require`-ing this file (e.g. from tests/) never auto-starts a
// real listener or a real cron schedule — only the actual
// `node src/server.js` entry point does either.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`audit-service listening on port ${PORT}`);
    startDigestScheduler();
  });
}

module.exports = app;
