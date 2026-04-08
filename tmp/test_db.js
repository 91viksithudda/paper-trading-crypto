const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/viksi/Downloads/paper trading/backend/.env' });

const test = async () => {
    console.log('Testing connection to:', process.env.MONGODB_URI);
    try {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        console.log('✅ Connection Successful!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection Failed:', err.message);
        process.exit(1);
    }
};

test();
