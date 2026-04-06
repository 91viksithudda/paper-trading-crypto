const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const store = require('../db/inMemoryStore');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'antigravity_jwt_secret_2024', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// Helper to get user model (mongoose or memory)
const getMongoUser = () => {
  if (process.env.USE_MEMORY === 'true') return null;
  try { return require('../models/User'); } catch { return null; }
};

// Signup
router.post('/signup', async (req, res) => {
  try {
    const schema = Joi.object({
      username: Joi.string().alphanum().min(3).max(20).required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(6).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    if (process.env.USE_MEMORY === 'true') {
      const existing = store.findUserByEmailOrUsername(value.email, value.username);
      if (existing) return res.status(409).json({ error: 'Email or username already exists' });

      const user = await store.createUser(value);
      const token = signToken(user._id);
      return res.status(201).json({
        message: 'Account created successfully',
        token,
        user: { id: user._id, username: user.username, email: user.email, cashBalance: user.cashBalance, portfolio: user.portfolio, createdAt: user.createdAt },
      });
    }

    const User = getMongoUser();
    const existingUser = await User.findOne({ $or: [{ email: value.email }, { username: value.username }] });
    if (existingUser) return res.status(409).json({ error: 'Email or username already exists' });

    const user = await User.create(value);
    const token = signToken(user._id);
    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id: user._id, username: user.username, email: user.email, cashBalance: user.cashBalance, portfolio: user.portfolio, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    if (process.env.USE_MEMORY === 'true') {
      const user = store.findUserByEmail(value.email);
      if (!user) return res.status(401).json({ error: 'Invalid email or password' });
      const valid = await store.comparePassword(value.password, user.password);
      if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

      const token = signToken(user._id);
      return res.json({
        message: 'Login successful',
        token,
        user: { id: user._id, username: user.username, email: user.email, cashBalance: user.cashBalance, portfolio: user.portfolio, createdAt: user.createdAt },
      });
    }

    const User = getMongoUser();
    const user = await User.findOne({ email: value.email }).select('+password');
    if (!user || !(await user.comparePassword(value.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = signToken(user._id);
    res.json({
      message: 'Login successful',
      token,
      user: { id: user._id, username: user.username, email: user.email, cashBalance: user.cashBalance, portfolio: user.portfolio, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user
router.get('/me', require('../middleware/auth').protect, async (req, res) => {
  res.json({ user: req.user });
});

// Claim daily reward
router.post('/daily-reward', require('../middleware/auth').protect, async (req, res) => {
  try {
    if (process.env.USE_MEMORY === 'true') {
      const user = store.findUserById(req.user._id || req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const now = new Date();
      if (user.dailyRewardClaimed) {
        const hoursSince = (now - new Date(user.dailyRewardClaimed)) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          const hoursLeft = Math.ceil(24 - hoursSince);
          return res.status(400).json({ error: `Daily reward already claimed. Come back in ${hoursLeft} hour(s).` });
        }
      }
      const reward = 100;
      user.cashBalance += reward;
      user.dailyRewardClaimed = now;
      store.saveUser(user);
      return res.json({ message: `🎉 Daily reward of $${reward} credited!`, cashBalance: user.cashBalance, reward });
    }

    const User = getMongoUser();
    const user = await User.findById(req.user._id);
    const now = new Date();
    const lastClaim = user.dailyRewardClaimed;
    if (lastClaim) {
      const hoursSince = (now - lastClaim) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        const hoursLeft = Math.ceil(24 - hoursSince);
        return res.status(400).json({ error: `Daily reward already claimed. Come back in ${hoursLeft} hour(s).` });
      }
    }
    const reward = 100;
    user.cashBalance += reward;
    user.dailyRewardClaimed = now;
    await user.save();
    res.json({ message: `🎉 Daily reward of $${reward} credited!`, cashBalance: user.cashBalance, reward });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
