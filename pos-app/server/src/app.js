const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { authRouter } = require('./routes/auth');
const { productsRouter } = require('./routes/products');
const { customersRouter } = require('./routes/customers');

function createApp(db) {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter(db));
  app.use('/api/products', productsRouter(db));
  app.use('/api/customers', customersRouter(db));
  return app;
}

module.exports = { createApp };
