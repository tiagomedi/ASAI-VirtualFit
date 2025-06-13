<<<<<<< HEAD

// Contenido para services/perfil/perfilService.js
const net = require('net');
const mongoose = require('mongoose'); // Lo necesitamos para validar ObjectIDs
const connectDB = require('../../database/db.js');
const User = require('../../database/models/user.model');
=======
const bcrypt = require('bcrypt');
>>>>>>> parent of b304370 (Cliclientes)

const User = require('../../database/models/user.model'); 
const Product = require('../../database/models/product.model');

<<<<<<< HEAD
const bcrypt = require('bcrypt');
const User = require('../../database/models/user.model'); 


  // 2. SEGUNDO: Ahora que la DB está lista, conectamos al bus.
  const sock = new net.Socket();
  let buffer = '';


  sock.connect(5001, 'localhost', () => {
    console.log('[PerfilService] ✅ Conectado al BUS');
    const registrationMessage = '00009regisprfl';
    sock.write(registrationMessage);
    console.log(`[PerfilService] 📢 Registrando servicio con prefijo 'prfl'...`);
  });

  sock.on('data', async (data) => {
    buffer += data.toString('utf8');

    while (buffer.length >= 5) {
      const payloadLen = parseInt(buffer.slice(0, 5), 10);
      const totalMsgLen = 5 + payloadLen;
      if (buffer.length < totalMsgLen) return;
      
      const raw = buffer.slice(5, totalMsgLen);
      buffer = buffer.slice(totalMsgLen);

      const servicio = raw.slice(0, 5);
      const datos = raw.slice(5).trim();

      if (servicio === 'regis') {
        console.log(`[PerfilService] ✅ Confirmación de registro del bus: [${datos}]`);
        continue;
      }

      console.log(`[PerfilService] 📨 Petición recibida para servicio: ${servicio}, Datos: ${datos}`);
      let respuesta = '';
      let estado = 'OK';

      try {
        if (servicio === 'prfl1') {
          const id = datos;
          if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('El ID no es válido');
          const user = await User.findById(id).lean();
          if (!user) throw new Error('Usuario no encontrado');
          respuesta = JSON.stringify(user);
        } else if (servicio === 'prfl2') {
          const [id, json] = datos.split('|');
          if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('El ID no es válido');
          const direccion = JSON.parse(json);
          const user = await User.findById(id);
          if (!user) throw new Error('Usuario no encontrado');
          user.direcciones.push(direccion);
          await user.save();
          respuesta = 'Dirección añadida con éxito';
        } else if (servicio === 'prfl3') {
            const [id, json] = datos.split('|');
            if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('El ID no es válido');
            const metodo = JSON.parse(json);
            const user = await User.findById(id);
            if (!user) throw new Error('Usuario no encontrado');
            user.metodos_pago.push(metodo);
            await user.save();
            respuesta = 'Método de pago añadido con éxito';
        } else {
          estado = 'NK';
          respuesta = 'Comando no reconocido';
        }
      } catch (err) {
        estado = 'NK';
        respuesta = `Error: ${err.message}`;
      }

      console.log(`[PerfilService] 📤 Enviando respuesta [${estado}]: ${respuesta}`);
      const cuerpo = servicio + estado + respuesta;
      const header = String(cuerpo.length).padStart(5, '0');
      sock.write(header + cuerpo);
=======
const SALT_ROUNDS = 10;

async function crearUsuario(correo, passwordPlano) {
    console.log('[userService] Buscando si el usuario ya existe...');
    const usuarioExistente = await User.findOne({ correo: correo.toLowerCase() });
    if (usuarioExistente) {
        throw new Error('El correo electrónico ya está en uso.');
>>>>>>> parent of b304370 (Cliclientes)
    }

    console.log('[userService] Hasheando contraseña...');
    const hash_password = await bcrypt.hash(passwordPlano, SALT_ROUNDS);

<<<<<<< HEAD
// Ejecutamos la función principal para iniciar el servicio
startService();

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
=======
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
module.exports = {
    crearUsuario
};
>>>>>>> parent of b304370 (Cliclientes)
