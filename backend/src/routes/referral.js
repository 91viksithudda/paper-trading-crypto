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

module.exports = router;
