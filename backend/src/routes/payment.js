const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

router.post('/create-order', protect, async (req, res) => {
  try {
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
      // Add 1000 USD
      const user = req.userModel; // If auth middleware attach userModel
      // The auth middleware only sets req.user which is the jwt payload { id: ... }
      // Let's actually find the user
      const existingUser = await User.findById(req.user.id);
      if (!existingUser) return res.status(404).json({ error: 'User not found' });
      
      existingUser.cashBalance += 1000;
      existingUser.totalDeposited += 1000;
      await existingUser.save();

      return res.json({ message: 'Payment successful, funds added', balance: existingUser.cashBalance });
    } else {
      return res.status(400).json({ error: 'Invalid signature sent!' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

module.exports = router;
