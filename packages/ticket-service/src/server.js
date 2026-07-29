require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

app.use(helmet());
app.use(cors()); // TODO Phase 6: lock to CORS_ALLOWED_ORIGINS allowlist
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ data: { status: 'ok', service: 'ticket-service' } });
});

const PORT = process.env.TICKETS_PORT || 4002;
app.listen(PORT, () => {
  console.log(`ticket-service listening on port ${PORT}`);
});
