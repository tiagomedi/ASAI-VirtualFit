require('dotenv').config({ path: __dirname + '/.env' });
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado a MongoDB exitosamente');
    } catch (err) {
        console.error('❌ Error de conexión a MongoDB:', err.message);
        process.exit(1); 
    }
};
module.exports = { connectDB, mongoose };