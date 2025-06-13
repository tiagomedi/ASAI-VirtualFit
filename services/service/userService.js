const bcrypt = require('bcrypt');
const User = require('../../database/models/user.model'); 

const SALT_ROUNDS = 10;

async function crearUsuario(correo, passwordPlano) {
    console.log(`[userService] Iniciando creación para: ${correo}`);
    
    // Validar si el usuario ya existe
    const usuarioExistente = await User.findOne({ correo: correo.toLowerCase() }).exec();
    if (usuarioExistente) {
        throw new Error('El correo electrónico ya está en uso.');
    }
    console.log('[userService] El usuario no existe, procediendo.');

    // Hashear la contraseña
    const hash_password = await bcrypt.hash(passwordPlano, SALT_ROUNDS);
    console.log('[userService] Contraseña hasheada.');

    // Crear la nueva instancia de usuario
    const newUser = new User({
        correo: correo,
        hash_password: hash_password
        // Los otros campos usarán sus valores por defecto del schema
    });
    console.log('[userService] Nueva instancia de usuario creada en memoria.');

    try {
        // --- PASO DE GUARDADO EXPLÍCITO ---
        console.log('[userService] Intentando guardar el nuevo usuario en la base de datos...');
        const savedUser = await newUser.save();
        console.log(`[userService] ¡ÉXITO! Usuario guardado con ID: ${savedUser._id}`);
        
        // Devolvemos el objeto del usuario guardado sin el hash
        const userObject = savedUser.toObject();
        delete userObject.hash_password;
        return userObject;
        
    } catch (validationError) {
        // Si .save() falla, Mongoose lanza una excepción que podemos capturar.
        console.error('[userService] ERROR DE VALIDACIÓN O GUARDADO:', validationError);
        // Re-lanzamos el error para que el authService lo atrape y lo envíe al cliente.
        throw new Error(`Error al guardar el usuario: ${validationError.message}`);
    }
}

async function autenticarUsuario(correo, passwordPlano) {
    // ... (esta función ya es correcta, no necesita cambios)
    console.log(`[userService] Intentando autenticar a: ${correo}`);
    const user = await User.findOne({ correo: correo.toLowerCase() }).exec();
    if (!user) {
        throw new Error('Correo o contraseña incorrectos.');
    }
    const esPasswordValido = await bcrypt.compare(passwordPlano, user.hash_password);
    if (!esPasswordValido) {
        throw new Error('Correo o contraseña incorrectos.');
    }
    console.log('[userService] Autenticación exitosa.');
    const userObject = user.toObject();
    delete userObject.hash_password;
    return userObject;
}

module.exports = {
    crearUsuario,
    autenticarUsuario
};