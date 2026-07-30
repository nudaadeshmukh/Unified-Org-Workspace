require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const { ZodError } = require('zod');
const { auditClient, buildCorsOptions } = require('@froncort/shared');

const { AppError } = require('./lib/errors');
const { UPLOAD_DIR } = require('./lib/upload');
const ticketsRoutes = require('./routes/tickets.routes');
const orgsRoutes = require('./routes/orgs.routes');
const internalRoutes = require('./routes/internal.routes');

const app = express();

app.use(helmet());
app.use(cors(buildCorsOptions())); // Locked to CORS_ALLOWED_ORIGINS at Phase 6
app.use(morgan('dev'));
app.use(express.json());

// Locked storage mechanism (implementation_guide.md Phase 3): uploaded files
// are served back out from local disk via express.static, relative path
// only (e.g. "/uploads/<uuid>-<originalname>"), never an absolute URL.
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/health', (req, res) => {
  res.json({ data: { status: 'ok', service: 'ticket-service' } });
});

app.use('/tickets', ticketsRoutes);
app.use('/orgs', orgsRoutes);
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
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: { message: err.message, code: 'VALIDATION_ERROR' } });
  }
  if (err instanceof auditClient.AuditLogError) {
    return res.status(err.statusCode).json({ error: { message: err.message, code: err.code } });
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { message: err.message, code: err.code } });
  }
  // Prisma's "malformed ID" error on a path param — same 404-not-500
  // discipline as identity-service (never leak more than "doesn't exist").
  if (err && err.code === 'P2023') {
    return res.status(404).json({ error: { message: 'Resource not found', code: 'NOT_FOUND' } });
  }
  console.error(err);
  return res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
});

const PORT = process.env.TICKETS_PORT || 4002;

// Guarded so `require`-ing this file (e.g. from tests/) never auto-starts a
// real listener — only the actual `node src/server.js` entry point does.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ticket-service listening on port ${PORT}`);
  });
}

module.exports = app;
