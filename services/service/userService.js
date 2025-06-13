// Contenido para services/perfil/perfilService.js
const net = require('net');
const mongoose = require('mongoose'); // Lo necesitamos para validar ObjectIDs
const connectDB = require('../../database/db.js');
const User = require('../../database/models/user.model');

// Función principal asíncrona para controlar el orden de inicio
const startService = async () => {
  // 1. PRIMERO: Conectamos a la DB y esperamos a que esté lista.
  await connectDB();

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
    }
  });

  sock.on('error', err => console.error('[PerfilService] ❌ Error:', err.message));
  sock.on('close', () => console.log('[PerfilService] 🔌 Desconectado del bus.'));
};

// Ejecutamos la función principal para iniciar el servicio
startService();