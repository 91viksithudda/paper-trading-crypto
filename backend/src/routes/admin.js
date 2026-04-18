const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Trade = require('../models/Trade');
const Transaction = require('../models/Transaction');
const ReferralEarning = require('../models/ReferralEarning');
const { protect, adminOnly } = require('../middleware/auth');

// Apply protection to all routes in this router
router.use(protect);
router.use(adminOnly);

// Get dashboard stats
router.get('/stats', async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        const tradeCount = await Trade.countDocuments();
        const transactionCount = await Transaction.countDocuments();
        const referralEarningsCount = await ReferralEarning.countDocuments();

        const recentTrades = await Trade.find().sort({ createdAt: -1 }).limit(10);
        const recentUsers = await User.find().sort({ createdAt: -1 }).limit(10).select('-password');

        res.json({
            userCount,
            tradeCount,
            transactionCount,
            referralEarningsCount,
            recentTrades,
            recentUsers
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats: ' + err.message });
    }
});

// Get all users
router.get('/users', async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users: ' + err.message });
    }
});

// Update user balance
router.post('/users/:id/balance', async (req, res) => {
    try {
        const { id } = req.params;
        const { newBalance } = req.body;
        
        const user = await User.findByIdAndUpdate(id, { $set: { cashBalance: Number(newBalance) } }, { new: true });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: 'Balance updated successfully', user });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update balance: ' + err.message });
    }
});

// Delete a user
router.delete('/users/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user: ' + err.message });
    }
});

module.exports = router;
