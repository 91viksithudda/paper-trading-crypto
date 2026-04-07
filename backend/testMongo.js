const mongoose = require('mongoose');
const uri = "mongodb+srv://viksithooda91_db_user:RSgOYur9Q2ebaFSR@cluster0.tkpodlz.mongodb.net/paper_trading_db?retryWrites=true&w=majority";

mongoose.connect(uri).then(async () => {
    console.log("Connected");
    const TestModel = mongoose.model('Test', new mongoose.Schema({ name: String }));
    try {
        await TestModel.create({ name: 'testuser' });
        console.log("Write success!");
        const docs = await TestModel.find({});
        console.log("Found:", docs);
    } catch (err) {
        console.log("Write Error:", err);
    }
    process.exit(0);
}).catch(err => {
    console.log("Connect Error:", err);
    process.exit(1);
});
