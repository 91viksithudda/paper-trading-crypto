require('dotenv').config({ path: './backend/.env' });
const { MongoClient } = require('mongodb');

const run = async () => {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        console.log('Connected to Native Driver');
        const db = client.db('paper_trading_db');
        const users = await db.collection('users').find({}).limit(5).toArray();
        console.log('Users:', users.map(u => ({ username: u.username, role: u.role })));
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await client.close();
    }
};

run();
