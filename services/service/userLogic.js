// services/userService.js

const bcrypt = require('bcrypt');
const User = require('../../database/models/user.model'); // Asegúrate de que la ruta sea correcta

const SALT_ROUNDS = 10; // Factor de coste para el hasheo de contraseñas

/**
 * Crea un nuevo usuario en la base de datos.
 * Hashea la contraseña antes de guardarla.
 * @param {string} correo - El correo electrónico del usuario.
 * @param {string} passwordPlano - La contraseña en texto plano proporcionada por el usuario.
 * @returns {Promise<object>} El documento del usuario recién creado (sin el hash de la contraseña).
 */
async function crearUsuario(correo, passwordPlano) {
    console.log(`[userService] Iniciando creación para: ${correo}`);
    
    // 1. Validar si el usuario ya existe para evitar duplicados
    const usuarioExistente = await User.findOne({ correo: correo.toLowerCase() }).exec();
    if (usuarioExistente) {
        throw new Error('El correo electrónico ya está en uso.');
    }
    console.log('[userService] El usuario no existe, procediendo.');

    // 2. Hashear la contraseña
    
    const hash_password = await bcrypt.hash(passwordPlano, SALT_ROUNDS);
    console.log('[userService] Contraseña hasheada.');

    // 3. Crear la nueva instancia del modelo de usuario
    const newUser = new User({
        correo: correo.toLowerCase(),
        hash_password: hash_password
        // El rol y otros campos usarán los valores por defecto definidos en el UserSchema
    });
    console.log('[userService] Nueva instancia de usuario creada en memoria.');

    try {
        // 4. Guardar el nuevo usuario en la base de datos
        console.log('[userService] Intentando guardar el nuevo usuario en la base de datos...');
        const savedUser = await newUser.save();
        console.log(`[userService] ¡ÉXITO! Usuario guardado con ID: ${savedUser._id}`);
        
        // 5. Devolver el objeto del usuario sin el hash por seguridad
        const userObject = savedUser.toObject();
        delete userObject.hash_password;
        return userObject;
        
    } catch (validationError) {
        // Capturar errores de validación de Mongoose (ej. un campo requerido falta)
        console.error('[userService] ERROR DE VALIDACIÓN O GUARDADO:', validationError);
        throw new Error(`Error al guardar el usuario: ${validationError.message}`);
    }
}

/**
 * Autentica a un usuario comparando su correo y contraseña.
 * @param {string} correo - El correo electrónico del usuario.
 * @param {string} passwordPlano - La contraseña en texto plano.
 * @returns {Promise<object>} El documento del usuario si la autenticación es exitosa (sin el hash).
 */
async function autenticarUsuario(correo, passwordPlano) {
    console.log(`[userService] Intentando autenticar a: ${correo}`);
    
    // 1. Buscar al usuario por su correo
    const user = await User.findOne({ correo: correo.toLowerCase() }).exec();
    
    // 2. Si el usuario no existe, lanzar un error genérico (no dar pistas a atacantes)
    if (!user) {
        console.log('[userService] Usuario no encontrado.');
        throw new Error('Correo o contraseña incorrectos.');
    }
    
    // 3. Comparar de forma segura la contraseña proporcionada con el hash almacenado
    const esPasswordValido = await bcrypt.compare(passwordPlano, user.hash_password);
    
    // 4. Si no coinciden, lanzar el mismo error genérico
    if (!esPasswordValido) {
        console.log('[userService] Contraseña incorrecta.');
        throw new Error('Correo o contraseña incorrectos.');
    }
    
    console.log('[userService] Autenticación exitosa.');
    
    // 5. Devolver el objeto del usuario sin el hash
    const userObject = user.toObject();
    delete userObject.hash_password;
    return userObject;
}

// Exportar las funciones para que otros servicios (como authService) puedan usarlas
module.exports = {
    crearUsuario,
    autenticarUsuario
};