const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { authRouter } = require('./routes/auth');
const { productsRouter } = require('./routes/products');
const { customersRouter } = require('./routes/customers');
const { invoicesRouter } = require('./routes/invoices');
const { dashboardRouter } = require('./routes/dashboard');
const { marketingRouter } = require('./routes/marketing');
const { settingsRouter } = require('./routes/settings');
const { exportRouter } = require('./routes/export');

// `now` is an optional override, threaded through to routers (currently just dashboardRouter)
// that need to compute "today" -- defaults to real wall-clock time in production, and lets
// tests pin a fixed local date/time without depending on the real clock.
function createApp(db, { now = () => new Date() } = {}) {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter(db));
  app.use('/api/products', productsRouter(db));
  app.use('/api/customers', customersRouter(db));
  app.use('/api/invoices', invoicesRouter(db));
  app.use('/api/dashboard', dashboardRouter(db, now));
  app.use('/api/marketing', marketingRouter(db, now));
  app.use('/api/settings', settingsRouter(db));
  app.use('/api/export', exportRouter(db));
  return app;
}

module.exports = { createApp };
