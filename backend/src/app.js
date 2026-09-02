require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('node:path');
const swaggerUi = require('swagger-ui-express');
const openApiDocument = require('./docs/openapi');

const authRoutes = require('./routes/auth');
const culturesRoutes = require('./routes/cultures');
const regionsRoutes = require('./routes/regions');
const placesRoutes = require('./routes/places');
const coursesRoutes = require('./routes/courses');
const aiRoutes = require('./routes/ai');
const usersRoutes = require('./routes/users');
const { createAccountDeletionRouter } = require('./routes/accountDeletion');
const {
  readAccountDeletionConfig,
  validateAccountDeletionConfig,
} = require('./config/accountDeletion');
const { createAccountDeletionMailer } = require('./services/accountDeletionEmailService');
const {
  startAccountDeletionEmailWorker,
} = require('./services/accountDeletionEmailWorker');

const app = express();
const accountDeletionConfig = readAccountDeletionConfig();
const accountDeletionConfigErrors = validateAccountDeletionConfig(accountDeletionConfig);
if (accountDeletionConfigErrors.length > 0) {
  throw new Error(
    `Invalid account deletion web form configuration: ${accountDeletionConfigErrors.join('; ')}`,
  );
}

app.use(cors({
  exposedHeaders: [
    'X-Cache-Status',
    'X-Has-More',
    'X-Next-Page',
    'X-Page-No',
    'X-Num-Of-Rows',
    'X-Region-Data-Status',
    'X-Total-Count',
  ],
}));
function accountDeletionPageHeaders(_req, res, next) {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  next();
}

app.get('/account-deletion', accountDeletionPageHeaders, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'account-deletion', 'index.html'));
});
app.get('/account-deletion/confirm', accountDeletionPageHeaders, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'account-deletion', 'confirm.html'));
});
app.use('/account-deletion', createAccountDeletionRouter({ config: accountDeletionConfig }));
app.use(express.json());
app.get('/privacy-policy', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'privacy-policy', 'index.html'));
});
app.get('/terms', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'terms', 'index.html'));
});

app.get('/openapi.json', (req, res) => res.json(openApiDocument));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV });
});

app.use('/auth', authRoutes);
app.use('/cultures', culturesRoutes);
app.use('/', regionsRoutes);
app.use('/places', placesRoutes);
app.use('/courses', coursesRoutes);
app.use('/ai', aiRoutes);
app.use('/users', usersRoutes);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});

const accountDeletionWorker = accountDeletionConfig.enabled
  ? startAccountDeletionEmailWorker({
    config: accountDeletionConfig,
    mailer: createAccountDeletionMailer(accountDeletionConfig),
  })
  : null;

async function shutdown() {
  await accountDeletionWorker?.stop();
  server.close();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
