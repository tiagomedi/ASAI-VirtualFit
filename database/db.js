
// const path = require('path');
// const mongoose = require('mongoose');

// // Construye una ruta absoluta al archivo .env en la carpeta raíz del proyecto
// const envPath = path.resolve(__dirname, './.env');

// // Carga las variables de entorno desde esa ruta específica
// require('dotenv').config({ path: envPath });

// // --- PASO DE DEPURACIÓN ---
// // Imprime la ruta que está usando y el valor que encuentra para MONGODB_URI
// console.log(`Buscando archivo .env en: ${envPath}`);
// console.log(`Valor de MONGODB_URI: ${process.env.MONGODB_URI}`);
// // --- FIN DE DEPURACIÓN ---

// // Validar que la URI se haya cargado correctamente
// if (!process.env.MONGODB_URI) {
//     throw new Error('ERROR FATAL: La variable de entorno MONGODB_URI no está definida. Asegúrate de que tu archivo .env existe en la raíz del proyecto y tiene el formato correcto.');
// }

// mongoose.connect(process.env.MONGODB_URI)
// .then(() => console.log('Conectado a MongoDB'))
// .catch(err => console.error('Error de conexión:', err));

// module.exports = mongoose;

// db.js

const path = require('path');
const mongoose = require('mongoose');

// Carga las variables de entorno
const envPath = path.resolve(__dirname, './.env');
require('dotenv').config({ path: envPath });

console.log(`Buscando archivo .env en: ${envPath}`);
const mongoUri = process.env.MONGODB_URI;
console.log(`Valor de MONGODB_URI: ${mongoUri ? 'Encontrado.' : 'NO ENCONTRADO.'}`);

if (!mongoUri) {
    throw new Error('ERROR FATAL: La variable de entorno MONGODB_URI no está definida.');
}

// Inicia la conexión y guarda la promesa resultante en una variable
const connectionPromise = mongoose.connect(mongoUri)
    .then(m => {
        console.log('Conexión a MongoDB establecida con éxito.');
        // Devolvemos la conexión para que la promesa se resuelva con ella.
        return m.connection; 
    })
    .catch(err => {
        console.error('Error inicial de conexión a MongoDB:', err);
        // Es crucial relanzar el error para que la promesa se rechace
        // y los que la esperan sepan que algo salió mal.
        throw err;
    });

// --- CAMBIO CLAVE ---
// Exportamos la promesa de la conexión, no el objeto mongoose.
module.exports = connectionPromise;