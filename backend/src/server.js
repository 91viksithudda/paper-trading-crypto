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

/**
 * Serverless initialization for MongoDB
 */
let isDBConnected = false;
const connectDB = async () => {
  if (isDBConnected || mongoose.connection.readyState >= 1) return;
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri || mongoUri.includes('<username>')) return;
  
  try {
    // Faster timeout for serverless
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    isDBConnected = true;
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
  }
};

// Middleware to ensure DB and Cache are ready
let isAppInitialized = false;
app.use(async (req, res, next) => {
  if (!isAppInitialized) {
    const mongoUri = process.env.MONGODB_URI;
    process.env.USE_MEMORY = (mongoUri && !mongoUri.includes('<username>')) ? 'false' : 'true';
    
    // Attempt DB and Price connection but don't block too long
    Promise.all([
      connectDB(),
      updatePriceCache().catch(e => console.error('Price update failed', e.message))
    ]);
    
    isAppInitialized = true;
  }
  
  // Always try to connect if not connected
  if (process.env.VERCEL && !isDBConnected) {
    await connectDB().catch(() => {}); 
  }
  next();
});

// For local development
if (!process.env.VERCEL) {
  const startLocal = async () => {
    await connectDB();
    await updatePriceCache().catch(() => {});
    cron.schedule('*/15 * * * * *', updatePriceCache);
    app.listen(PORT, () => console.log(`🚀 API running on http://localhost:${PORT}`));
  };
  startLocal();
}

module.exports = app;
