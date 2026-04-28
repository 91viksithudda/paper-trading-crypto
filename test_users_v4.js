require('dotenv').config({ path: './backend/.env' });
const mongoose = require('mongoose');

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const User = require('./backend/src/models/User');
        const count = await User.countDocuments();
        console.log('User count:', count);
        if (count > 0) {
            const users = await User.find().limit(5).select('username role');
            console.log('Sample users:', users);
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await mongoose.disconnect();
    }
};

run();
