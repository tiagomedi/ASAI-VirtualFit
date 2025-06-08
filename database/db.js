require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Conectado a MongoDB'))
    .catch(err => console.error('Error de conexión:', err));

module.exports = mongoose;

//Para usarlo en otros archivos/servicios:
//const mongoose = require('./ruta/al/archivo');