require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cron = require('node-cron');

const app = express();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);
app.use(express.json({ limit: '10kb' }));

// Serve static frontend
const path = require('path');
app.use(express.static(path.join(__dirname, '../../frontend/web')));

// Let the app know if we're in in-memory mode
let usingMemory = false;
app.locals.usingMemory = false;

// Import routes
const { updatePriceCache } = require('./services/binanceService');
const authRoutes = require('./routes/auth');
const marketRoutes = require('./routes/market');
const tradeRoutes = require('./routes/trade');
const portfolioRoutes = require('./routes/portfolio');
const leaderboardRoutes = require('./routes/leaderboard');

app.use('/api/auth', authRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/trade', tradeRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', mode: usingMemory ? 'in-memory' : 'mongodb', timestamp: new Date().toISOString() });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/web/index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Try MongoDB first, fall back to in-memory
  const mongoUri = process.env.MONGODB_URI;
  const hasRealMongo = mongoUri && !mongoUri.includes('<username>') && !mongoUri.includes('<password>');

  if (hasRealMongo) {
    console.log('📡 Attempting MongoDB connection...');
    try {
      // Set options for serverless
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000, // Faster timeout for serverless
      });
      console.log('✅ MongoDB connected');
    } catch (err) {
      console.warn('⚠️  MongoDB failed, switching to in-memory mode:', err.message);
      usingMemory = true;
      app.locals.usingMemory = true;
    }
  } else {
    console.log('⚡ Running in IN-MEMORY mode.');
    usingMemory = true;
    app.locals.usingMemory = true;
  }

  // Set memory mode on routes
  process.env.USE_MEMORY = usingMemory ? 'true' : 'false';

  // Update prices
  try {
    await updatePriceCache();
  } catch (err) {
    console.error('Price cache update failed:', err.message);
  }

  // Only start cron and listen if NOT on Vercel
  if (!process.env.VERCEL) {
    // Update every 15 seconds
    cron.schedule('*/15 * * * * *', async () => {
      await updatePriceCache();
    });

    app.listen(PORT, () => {
      console.log(`🚀 Antigravity Crypto API running on port ${PORT}`);
      console.log(`📡 Mode: ${usingMemory ? 'IN-MEMORY' : 'MONGODB'}`);
      console.log(`🌐 Frontend: http://localhost:${PORT}`);
    });
  } else {
    console.log('☁️  Running in Vercel Serverless environment');
  }
};

// Global initialization start
startServer().catch(err => console.error('Startup Error:', err));

// Export the Express API for Vercel
module.exports = app;
