// services/userService.js

const bcrypt = require('bcrypt');
// --- CORRECCIÓN DE RUTAS ---
// Salimos de 'services', entramos en 'database/models'
const User = require('../database/models/user.model'); 
const Product = require('../database/models/product.model');

const SALT_ROUNDS = 10;

async function crearUsuario(correo, passwordPlano) {
    console.log('[userService] Buscando si el usuario ya existe...');
    const usuarioExistente = await User.findOne({ correo: correo.toLowerCase() });
    if (usuarioExistente) {
        throw new Error('El correo electrónico ya está en uso.');
    }

    console.log('[userService] Hasheando contraseña...');
    const hash_password = await bcrypt.hash(passwordPlano, SALT_ROUNDS);

    const newUser = new User({
        correo: correo,
        hash_password: hash_password
    });
    
    console.log('[userService] Guardando nuevo usuario en la BD...');
    await newUser.save();
    console.log('[userService] Usuario guardado con éxito.');

    const userObject = newUser.toObject();
    delete userObject.hash_password;
    
    return userObject;
}

// Exportamos solo la función necesaria por ahora
module.exports = {
    crearUsuario
};