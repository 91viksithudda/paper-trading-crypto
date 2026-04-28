require('dotenv').config({ path: './backend/.env' });
const mongoose = require('mongoose');

const run = async () => {
    try {
        console.log('Connecting to:', process.env.MONGODB_URI.split('@')[1]); // Don't log credentials
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
        console.log('Connected!');
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await mongoose.disconnect();
    }
};

run();
