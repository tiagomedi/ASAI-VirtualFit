// database/db.js

const path = require('path');
const mongoose = require('mongoose');

// Carga las variables de entorno desde el archivo .env en la carpeta raíz del proyecto.
// path.resolve(__dirname, '../.env') construye la ruta absoluta de forma segura.
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// --- Validación de la Variable de Entorno ---
// Es una buena práctica verificar que la variable necesaria se haya cargado correctamente.
if (!process.env.MONGODB_URI) {
    console.error('❌ ERROR FATAL: La variable de entorno MONGODB_URI no está definida.');
    console.error('Asegúrate de que tu archivo .env existe en la raíz del proyecto y contiene la línea MONGODB_URI=mongodb://127.0.0.1:27017/tu_base_de_datos');
    // Si no hay URI, la aplicación no puede funcionar, por lo que detenemos el proceso.
    process.exit(1);
}

/**
 * Función asíncrona que establece la conexión global de Mongoose con la base de datos.
 * Esta función debe ser llamada con 'await' al inicio de cada servicio que necesite la BD.
 */
async function connectDB() {
    try {
        // Mongoose maneja un pool de conexiones. Solo necesitas conectar una vez por proceso.
        await mongoose.connect(process.env.MONGODB_URI, {
            // Opciones recomendadas para evitar warnings de deprecación y mejorar la conexión
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Conectado a MongoDB exitosamente.');
    } catch (err) {
        console.error('❌ Error fatal de conexión a la base de datos:', err.message);
        // Si la conexión inicial falla, el servicio no puede arrancar.
        process.exit(1);
    }
}

// Exportamos únicamente la función para que otros módulos puedan importarla y llamarla.
module.exports = { connectDB };