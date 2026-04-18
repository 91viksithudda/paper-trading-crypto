const jwt = require('jsonwebtoken');
const store = require('../db/inMemoryStore');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'antigravity_jwt_secret_2024');

    if (process.env.USE_MEMORY === 'true') {
      const user = store.findUserById(decoded.id);
      if (!user) return res.status(401).json({ error: 'User not found' });
      const { password, ...safeUser } = user;
      req.user = safeUser;
      return next();
    }

    const User = require('../models/User');
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token' });
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    next(err);
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admins only.' });
  }
};

module.exports = { protect, adminOnly };
