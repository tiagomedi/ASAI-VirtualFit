require('dotenv').config({ path: __dirname + '/.env' }); // Asegura que encuentre el .env en la misma carpeta
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Usamos la URI de la variable de entorno que ya tienes configurada
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado a MongoDB exitosamente');
    } catch (err) {
        console.error('❌ Error de conexión a MongoDB:', err.message);
        // Salimos del proceso si no nos podemos conectar, porque el servicio es inútil sin DB.
        process.exit(1); 
    }
};

// Exportamos la función para poder llamarla desde fuera, y también mongoose para los modelos.
module.exports = { connectDB, mongoose };

//Para usarlo en otros archivos/servicios:
//const mongoose = require('./ruta/al/archivo');