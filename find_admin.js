require('dotenv').config({ path: './backend/.env' });
const { MongoClient } = require('mongodb');

const run = async () => {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db('paper_trading_db');
        const admin = await db.collection('users').findOne({ role: 'admin' });
        console.log('Admin user found:', admin ? admin.username : 'NONE');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await client.close();
    }
};

run();
