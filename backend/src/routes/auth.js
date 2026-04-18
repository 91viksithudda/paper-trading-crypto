const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const store = require('../db/inMemoryStore');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Require User model normally (it handles mongoose.models internally)
let User;
try {
  User = require('../models/User');
} catch (e) {
  console.warn('⚠️ User model could not be loaded. Memory mode will be used if needed.');
}

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'antigravity_jwt_secret_2024', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// Signup
router.post('/signup', async (req, res) => {
  try {
    const schema = Joi.object({
      username: Joi.string().alphanum().min(3).max(20).required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(6).required(),
      referredBy: Joi.string().optional().allow(null, '')
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    // Use memory mode if forced or if DB is not available
    if (process.env.USE_MEMORY === 'true' || !User) {
      const existing = store.findUserByEmailOrUsername(value.email, value.username);
      if (existing) return res.status(409).json({ error: 'Email or username already exists' });

      const user = await store.createUser(value);
      const token = signToken(user._id);
      return res.status(201).json({
        message: 'Account created successfully (Memory Mode)',
        token,
        user: { id: user._id, username: user.username, email: user.email, cashBalance: user.cashBalance, portfolio: user.portfolio, createdAt: user.createdAt, role: user.role },
      });
    }

    // Generate a unique referral code
    value.referralCode = value.username.substring(0, 3).toUpperCase() + Math.floor(1000 + Math.random() * 9000);

    const existingUser = await User.findOne({ $or: [{ email: value.email }, { username: value.username }] });
    if (existingUser) return res.status(409).json({ error: 'Email or username already exists' });

    const user = await User.create(value);
    const token = signToken(user._id);
    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id: user._id, username: user.username, email: user.email, cashBalance: user.cashBalance, portfolio: user.portfolio, createdAt: user.createdAt, referralCode: user.referralCode, referralEarnings: user.referralEarnings, role: user.role },
    });
  } catch (err) {
    console.error('Signup Error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
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

    if (process.env.USE_MEMORY === 'true' || !User) {
      const user = store.findUserByEmail(value.email);
      if (!user) return res.status(401).json({ error: 'Invalid email or password' });
      const valid = await store.comparePassword(value.password, user.password);
      if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

      const token = signToken(user._id);
      return res.json({
        message: 'Login successful (Memory Mode)',
        token,
        user: { id: user._id, username: user.username, email: user.email, cashBalance: user.cashBalance, portfolio: user.portfolio, createdAt: user.createdAt, role: user.role },
      });
    }

    const user = await User.findOne({ email: value.email }).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const isMatch = await user.comparePassword(value.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user._id);
    res.json({
      message: 'Login successful',
      token,
      user: { id: user._id, username: user.username, email: user.email, cashBalance: user.cashBalance, portfolio: user.portfolio, createdAt: user.createdAt, referralCode: user.referralCode, referralEarnings: user.referralEarnings, role: user.role },
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
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

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Create reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 mins

    await user.save();

    // Create reset URL
    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${resetToken}`;

    // Email Setup
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"Support" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Password Reset Request',
      text: `You requested a password reset. Click the link below to set a new password:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: 'Reset link sent to email!' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Reset Password
router.post('/reset-password/:token', async (req, res) => {
  try {
    const resetPasswordToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password updated successfully!' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
