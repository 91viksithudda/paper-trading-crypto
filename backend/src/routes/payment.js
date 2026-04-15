const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

let razorpay;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

router.post('/create-order', protect, async (req, res) => {
  try {
    if (!razorpay) return res.status(500).json({ error: 'Razorpay keys not configured on server' });
    // Payment of 100 INR for 1000 USD virtual funds
    const amount = 100 * 100; // 100 INR in paise

    const options = {
      amount,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error('Razorpay Error:', err);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

router.post('/verify', protect, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature === expectedSign) {
      const existingUser = await User.findById(req.user.id);
      if (!existingUser) return res.status(404).json({ error: 'User not found' });

      // Import models
      const Transaction = require('../models/Transaction');
      const ReferralEarning = require('../models/ReferralEarning');

      // 1. Credit 1000 virtual cash to the user
      existingUser.cashBalance += 1000;
      existingUser.totalDeposited += 1000;
      await existingUser.save();

      // Record deposit transaction
      await Transaction.create({
        userId: existingUser._id,
        amount: 100, // 100 INR
        type: 'deposit',
        status: 'completed'
      });

      // 2. Process Referral Commission
      if (existingUser.referredBy) {
        // Prevent double commissions by checking if a referral bonus has already been given for this user
        const existingCommission = await ReferralEarning.findOne({ referredUserId: existingUser._id });
        if (!existingCommission) {
          const referrer = await User.findOne({ referralCode: existingUser.referredBy });
          if (referrer && referrer._id.toString() !== existingUser._id.toString()) { // Prevent self-referral
            // Add ₹25 to referrer's wallet
            referrer.referralEarnings += 25;
            await referrer.save();

            await ReferralEarning.create({
              referrerId: referrer._id,
              referredUserId: existingUser._id,
              commissionAmount: 25,
              status: 'paid'
            });

            await Transaction.create({
              userId: referrer._id,
              amount: 25,
              type: 'referral_commission',
              status: 'completed'
            });
          }
        }
      }

      return res.json({ message: 'Payment successful, funds added! 🚀', balance: existingUser.cashBalance });
    } else {
      return res.status(400).json({ error: 'Invalid signature sent!' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

module.exports = router;
