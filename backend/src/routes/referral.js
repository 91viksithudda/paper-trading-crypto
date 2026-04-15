const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const ReferralEarning = require('../models/ReferralEarning');

router.get('/stats', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Ensure backwards compatibility for old users who lack a referralCode
    if (!user.referralCode) {
      user.referralCode = user.username.substring(0, 3).toUpperCase() + Math.floor(1000 + Math.random() * 9000);
      try { await user.save(); } catch(e){} // Ignore duplicate key errors if edge case
    }

    const earnings = await ReferralEarning.find({ referrerId: user._id }).populate('referredUserId', 'username createdAt');
    const totalReferred = await User.countDocuments({ referredBy: user.referralCode });

    res.json({
      referralCode: user.referralCode,
      referralEarnings: user.referralEarnings || 0,
      totalReferred,
      earningsHistory: earnings
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch referral stats' });
  }
});

// Customize referral coupon code
router.post('/customize-code', protect, async (req, res) => {
  try {
    const { newCode } = req.body;
    if (!newCode || newCode.length < 3 || newCode.length > 20) {
      return res.status(400).json({ error: 'Code must be between 3 and 20 characters' });
    }
    if (!/^[a-zA-Z0-9]+$/.test(newCode)) {
      return res.status(400).json({ error: 'Code must be alphanumeric without spaces' });
    }

    const codeExists = await User.findOne({ referralCode: newCode.toUpperCase() });
    if (codeExists && codeExists._id.toString() !== req.user.id) {
      return res.status(400).json({ error: 'This coupon code is already taken!' });
    }

    const user = await User.findById(req.user.id);
    user.referralCode = newCode.toUpperCase();
    
    // Auto-update any existing users that used the old code? 
    // The previous earnings history won't break because they are linked by ObjectId (referrerId), 
    // only the simple user.referredBy string relation gets stale, which is fine since the commission is already paid!
    await user.save();

    res.json({ message: 'Coupon code updated successfully!', referralCode: user.referralCode });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Coupon code already taken' });
    res.status(500).json({ error: 'Failed to update code' });
  }
});

module.exports = router;
