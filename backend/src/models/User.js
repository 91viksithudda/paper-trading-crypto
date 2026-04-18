const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username must not exceed 20 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false,
  },
  avatar: {
    type: String,
    default: '',
  },
  cashBalance: {
    type: Number,
    default: 10000,
    min: 0,
  },
  portfolio: [
    {
      coin: { type: String, required: true },
      symbol: { type: String, required: true },
      quantity: { type: Number, required: true, min: 0 },
      avgBuyPrice: { type: Number, required: true, min: 0 },
      leverage: { type: Number, default: 1, min: 1, max: 100 },
      stopLoss: { type: Number, default: null },
      takeProfit: { type: Number, default: null },
      liquidationPrice: { type: Number, default: null },
      type: { type: String, enum: ['LONG', 'SHORT'], default: 'LONG' },
      collateral: { type: Number, default: 0 },
    },
  ],
  totalDeposited: {
    type: Number,
    default: 10000,
  },
  dailyRewardClaimed: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
  },
  referredBy: {
    type: String,
    default: null,
  },
  referralEarnings: {
    type: Number,
    default: 0,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
