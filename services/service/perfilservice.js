/* ---------------- PERFIL SERVICE (multi-registro por correo) ---------- */
const net = require('net');
const { connectDB } = require('../../database/db');
const User = require('../../database/models/user.model');

const BUS_HOST = process.env.BUS_HOST || 'localhost';
const BUS_PORT = Number(process.env.BUS_PORT) || 5001;

// Servidor directo para clientes
const SERVICE_NAME = 'perfil';
const DIRECT_HOST = 'localhost';
const DIRECT_PORT = 5010; // Puerto directo para el cliente

/* ---- Helper para armar tramas con longitud en bytes ------------------ */
const frame = (svc, status, body = '') => {
  const payload = `${svc}${status}${body}`;
  return (
    String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0') + payload
  );
};

/* ---------------- Lógica por operación (correo) ----------------------- */
async function handleMessage(svc, data) {
  switch (svc) {
    case 'prfl1': {                               // ➜ Ver perfil
      const correo = data.trim().toLowerCase();
      const user = await User.findOne({ correo }).lean();
      if (!user) throw new Error('Usuario no encontrado');
      return JSON.stringify(user);
    }

    case 'prfl2': {                               // ➜ Agregar dirección
      const [correoRaw, json] = data.split('|');
      const correo = correoRaw.trim().toLowerCase();
      const user = await User.findOne({ correo });
      if (!user) throw new Error('Usuario no encontrado');
      user.direcciones.push(JSON.parse(json));
      await user.save();
      return 'Dirección añadida con éxito';
    }

    case 'prfl3': {                               // ➜ Agregar método de pago
      const [correoRaw, json] = data.split('|');
      const correo = correoRaw.trim().toLowerCase();
      const user = await User.findOne({ correo });
      if (!user) throw new Error('Usuario no encontrado');
      user.metodos_pago.push(JSON.parse(json));
      await user.save();
      return 'Método de pago añadido con éxito';
    }

    default:
      throw new Error('Comando no reconocido');
  }
}

/**
 * Maneja una conexión directa de un cliente.
 * @param {net.Socket} socket El socket del cliente conectado.
 */
async function handleDirectConnection(socket) {
    const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[${SERVICE_NAME}Service] Cliente conectado DIRECTAMENTE (${clientAddress})`);
    
    let buffer = '';
    socket.setEncoding('utf8');

    socket.on('data', (data) => {
        buffer += data;
        while (true) {
            if (buffer.length < 5) break; 
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length)) { buffer = ''; socket.end(); break; }
            const totalMessageLength = 5 + length;
            if (buffer.length < totalMessageLength) break;
            
            const messageToProcess = buffer.substring(5, totalMessageLength);
            buffer = buffer.substring(totalMessageLength);
            
            console.log(`[${SERVICE_NAME}Service] <- Petición directa recibida: ${messageToProcess}`);

            (async () => {
                try {
                    const req = JSON.parse(messageToProcess);
                    let result;
                    
                    switch (req.action) {
                        case 'ver_perfil':
                            result = await handleMessage('prfl1', req.correo);
                            break;
                        case 'agregar_direccion':
                            result = await handleMessage('prfl2', `${req.correo}|${JSON.stringify(req.direccion)}`);
                            break;
                        case 'agregar_pago':
                            result = await handleMessage('prfl3', `${req.correo}|${JSON.stringify(req.metodo_pago)}`);
                            break;
                        default:
                            throw new Error(`Acción directa desconocida: ${req.action}`);
                    }
                    
                    const response = { status: 'success', data: result };
                    const payload = JSON.stringify(response);
                    const header = String(payload.length).padStart(5, '0');
                    socket.write(header + payload);

                } catch (error) {
                    console.error(`[${SERVICE_NAME}Service] ERROR en conexión directa:`, error.message);
                    const errorResponse = { status: 'error', message: error.message };
                    const payload = JSON.stringify(errorResponse);
                    const header = String(payload.length).padStart(5, '0');
                    socket.write(header + payload);
                } finally {
                    socket.end();
                }
            })();
        }
    });

    socket.on('error', (err) => console.log(`Error en socket directo (${clientAddress}): ${err.message}`));
    socket.on('close', () => console.log(`Conexión directa cerrada (${clientAddress}).`));
}

/* -------- Crea una conexión y registra un código de servicio ---------- */
function registerService(code) {
  const sock = new net.Socket();
  let buffer = '';
  let isRegistered = false;

  sock.connect(BUS_PORT, BUS_HOST, () => {
    const sinit = `sinit${code}`;
    sock.write(String(sinit.length).padStart(5, '0') + sinit);
    console.log(`[PerfilService] ✅ Registrando código '${code}'`);
  });

  sock.on('data', async (dataChunk) => {
    buffer += dataChunk.toString();
    
    while (buffer.length >= 5) {
      const lengthStr = buffer.substring(0, 5);
      const length = parseInt(lengthStr, 10);
      
      if (isNaN(length) || length <= 0) {
        console.error(`[PerfilService:${code}] ❌ Header inválido: ${lengthStr}`);
        buffer = '';
        break;
      }
      
      if (buffer.length < 5 + length) {
        break; // Esperar más datos
      }
      
      const fullMessage = buffer.substring(0, 5 + length);
      buffer = buffer.substring(5 + length);
      
      const payload = fullMessage.substring(5);
      const svc = payload.substring(0, 5);
      const datos = payload.substring(5);
      
      // Manejar respuestas del bus (confirmaciones de registro)
      if (!isRegistered && svc === code) {
        if (datos === 'OK') {
          console.log(`[PerfilService:${code}] ✅ Registrado exitosamente`);
          isRegistered = true;
        } else if (datos.startsWith('NK')) {
          console.error(`[PerfilService:${code}] ❌ Error de registro: ${datos}`);
        }
        continue;
      }
      
      // Procesar solicitudes de clientes solo si estamos registrados
      if (isRegistered && svc === code) {
        // Verificar si es una respuesta del bus que debemos ignorar
        if (datos === 'OK' || datos.startsWith('NK')) {
          console.log(`[PerfilService:${code}] Ignorando respuesta del bus: ${datos}`);
          continue;
        }
        
        let status = 'OK', body = '';
        try {
          body = await handleMessage(svc, datos);
        } catch (e) {
          status = 'NK';
          body = e.message;
        }
        
        sock.write(frame(svc, status, body));
      }
    }
  });

  sock.on('error', e => {
    console.error(`[PerfilService:${code}] ❌`, e.message);
    isRegistered = false;
  });
  
  sock.on('close', () => {
    console.log(`[PerfilService:${code}] 🔌 cerrado`);
    isRegistered = false;
  });
}

async function startService() {
    await connectDB();
    
    // Servidor directo para clientes
    const directServer = net.createServer(handleDirectConnection);
    directServer.listen(DIRECT_PORT, DIRECT_HOST, () => {
        console.log(`[${SERVICE_NAME}Service] Escuchando conexiones DIRECTAS en ${DIRECT_HOST}:${DIRECT_PORT}`);
    });

    directServer.on('error', (err) => {
        console.error(`[${SERVICE_NAME}Service] Error en el servidor directo:`, err);
    });

    // Registro en el bus (mantener funcionalidad existente)
    ['prfl1', 'prfl2', 'prfl3'].forEach(registerService);
}

startService();

