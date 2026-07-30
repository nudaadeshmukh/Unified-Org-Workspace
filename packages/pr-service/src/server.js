require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { ZodError } = require('zod');
const { auditClient, buildCorsOptions } = require('@froncort/shared');

const { AppError } = require('./lib/errors');
const prsRoutes = require('./routes/prs.routes');
const internalRoutes = require('./routes/internal.routes');

const app = express();

app.use(helmet());
app.use(cors(buildCorsOptions())); // Locked to CORS_ALLOWED_ORIGINS at Phase 6
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ data: { status: 'ok', service: 'pr-service' } });
});

app.use('/prs', prsRoutes);
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
  // Prisma's "malformed ID" error on a path param — same 404-not-500
  // discipline as identity-service/ticket-service.
  if (err && err.code === 'P2023') {
    return res.status(404).json({ error: { message: 'Resource not found', code: 'NOT_FOUND' } });
  }
  console.error(err);
  return res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
});

const PORT = process.env.PRS_PORT || 4003;

// Guarded so `require`-ing this file (e.g. from tests/) never auto-starts a
// real listener — only the actual `node src/server.js` entry point does.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`pr-service listening on port ${PORT}`);
  });
}

module.exports = app;
