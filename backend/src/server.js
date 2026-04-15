require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// Security middleware - Only on local
if (!process.env.VERCEL) {
  const helmet = require('helmet');
  const rateLimit = require('express-rate-limit');
  const path = require('path');
  
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
  });
  app.use('/api/', limiter);
  
  // Serve static locally
  app.use(express.static(path.join(__dirname, '../../frontend/web')));
} else {
  // CORS for Vercel
  app.use(cors());
}

app.use(express.json());

// Let the app know if we're in in-memory mode
app.locals.usingMemory = false;

// Import routes
const { updatePriceCache } = require('./services/binanceService');
const { checkAutomatedOrders } = require('./services/orderAutomationService');
const authRoutes = require('./routes/auth');
const marketRoutes = require('./routes/market');
const tradeRoutes = require('./routes/trade');
const portfolioRoutes = require('./routes/portfolio');
const leaderboardRoutes = require('./routes/leaderboard');
const paymentRoutes = require('./routes/payment');

app.use('/api/auth', authRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/trade', tradeRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/payment', paymentRoutes);

app.get('/api/health', async (req, res) => {
  res.json({ 
    status: 'OK', 
    mode: process.env.USE_MEMORY === 'true' ? 'in-memory' : 'mongodb',
    vercel: !!process.env.VERCEL,
    dbConnected: mongoose.connection.readyState >= 1,
    timestamp: new Date().toISOString() 
  });
});

// Local only fallback
if (!process.env.VERCEL) {
  const path = require('path');
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/web/index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;

/**
 * Serverless initialization for MongoDB
 */
let isDBConnected = false;
const connectDB = async () => {
  if (isDBConnected || mongoose.connection.readyState >= 1) return true;
  const mongoUri = process.env.MONGODB_URI;
  
  if (!mongoUri || mongoUri.includes('<username>')) {
    console.warn('⚠️ No valid MONGODB_URI found. Falling back to IN-MEMORY mode.');
    process.env.USE_MEMORY = 'true';
    return false;
  }
  
  try {
    process.env.USE_MEMORY = 'false';
    await mongoose.connect(mongoUri, { 
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000 
    });
    isDBConnected = true;
    console.log('✅ MongoDB connected');
    return true;
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.env.USE_MEMORY = 'true';
    return false;
  }
};

// Middleware to ensure DB and Cache are ready
let isAppInitialized = false;
app.use(async (req, res, next) => {
  // If we're on Vercel, we need to ensure DB is connected for EVERY request 
  // because the instance might be cold-started or reused without global state.
  if (process.env.VERCEL) {
    await connectDB();
    // Also try to update price cache if it's empty
    const { getPrice, getTopSymbols } = require('./services/binanceService');
    const firstSymbol = getTopSymbols()[0].symbol;
    if (!getPrice(firstSymbol)) {
      await updatePriceCache().catch(() => {});
    }
  } else if (!isAppInitialized) {
    await connectDB();
    await updatePriceCache().catch(() => {});
    isAppInitialized = true;
  }
  
  next();
});

// For local and Render deployment
if (!process.env.VERCEL) {
  const cron = require('node-cron');
  const startServer = async () => {
    // Start listening immediately so Render/cloud platforms see the port is open
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server listening on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Initialize services in the background
    try {
      console.log('🏗️ Initializing services...');
      await connectDB();
      await updatePriceCache();
      console.log('✅ Services initialized successfully');
      
      // Schedule background tasks
      cron.schedule('*/15 * * * * *', async () => {
        await updatePriceCache().catch(e => console.error('Cron Price Error:', e.message));
        await checkAutomatedOrders().catch(e => console.error('Cron Order Error:', e.message));
      });
    } catch (err) {
      console.error('❌ Initialization Warning:', err.message);
    }
  };
  startServer();
}

module.exports = app;
