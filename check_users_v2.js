require('dotenv').config({ path: './backend/.env' });
const mongoose = require('mongoose');

const run = async () => {
    try {
        console.log('Connecting...');
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
        console.log('Connected to MongoDB');
        
        const User = require('./backend/src/models/User');
        const users = await User.find({}).select('username email role').lean();
        console.log('Users found:', users.length);
        console.log(JSON.stringify(users, null, 2));
    } catch (err) {
        console.error('CRITICAL ERROR:', err);
    } finally {
        await mongoose.disconnect();
    }
};

run();
