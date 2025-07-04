const net = require('net');
const { connectDB } = require('./database/db.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;

// Almacenar las conexiones de servicios registrados
const registeredServices = new Map();
const clientConnections = new Map();

/**
 * Procesa mensajes del bus
 * @param {net.Socket} socket - Socket del cliente/servicio
 * @param {string} message - Mensaje completo recibido
 */
function processMessage(socket, message) {
    console.log(`[Bus] Procesando mensaje: ${message.substring(0, 50)}...`);
    
    // Formato: [servicio_destino 5 chars][datos...]
    const destination = message.substring(0, 5);
    const messageContent = message.substring(5);
    
    // Manejo especial para registro de servicios
    if (destination === 'sinit') {
        const serviceName = messageContent.trim();
        registeredServices.set(serviceName, socket);
        console.log(`[Bus] Servicio '${serviceName}' registrado exitosamente`);
        
        // Confirmar registro
        const confirmMessage = `${serviceName}OK`;
        const header = String(confirmMessage.length).padStart(5, '0');
        socket.write(header + confirmMessage);
        return;
    }
    
    // Enrutamiento de mensajes
    if (registeredServices.has(destination)) {
        const serviceSocket = registeredServices.get(destination);
        const header = String(message.length).padStart(5, '0');
        serviceSocket.write(header + message);
        console.log(`[Bus] Mensaje enviado a servicio '${destination}'`);
    } else {
        console.log(`[Bus] Servicio '${destination}' no encontrado`);
        // Enviar error de vuelta al cliente
        const errorMessage = `${destination}NK${'Servicio no disponible'}`;
        const header = String(errorMessage.length).padStart(5, '0');
        socket.write(header + errorMessage);
    }
}

/**
 * Maneja una nueva conexión al bus
 * @param {net.Socket} socket - Socket de la conexión
 */
function handleConnection(socket) {
    const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[Bus] Nueva conexión desde ${clientId}`);
    
    let buffer = '';
    
    socket.on('data', (data) => {
        buffer += data.toString();
        
        // Procesar mensajes completos
        while (buffer.length >= 5) {
            const lengthStr = buffer.substring(0, 5);
            const length = parseInt(lengthStr, 10);
            
            if (isNaN(length)) {
                console.error(`[Bus] Header inválido: ${lengthStr}`);
                buffer = '';
                break;
            }
            
            if (buffer.length < 5 + length) {
                break; // Esperar más datos
            }
            
            const message = buffer.substring(5, 5 + length);
            buffer = buffer.substring(5 + length);
            
            processMessage(socket, message);
        }
    });
    
    socket.on('close', () => {
        console.log(`[Bus] Conexión cerrada: ${clientId}`);
        
        // Remover servicio del registro si estaba registrado
        for (const [serviceName, serviceSocket] of registeredServices.entries()) {
            if (serviceSocket === socket) {
                registeredServices.delete(serviceName);
                console.log(`[Bus] Servicio '${serviceName}' desregistrado`);
                break;
            }
        }
    });
    
    socket.on('error', (err) => {
        console.error(`[Bus] Error en conexión ${clientId}:`, err.message);
    });
}

/**
 * Inicia el bus de mensajería
 */
async function startBus() {
    try {
        // Conectar a la base de datos
        await connectDB();
        console.log('[Bus] Conectado a la base de datos');
        
        // Crear el servidor del bus
        const server = net.createServer(handleConnection);
        
        server.listen(BUS_PORT, BUS_HOST, () => {
            console.log(`🚌 [Bus] Bus de mensajería iniciado en ${BUS_HOST}:${BUS_PORT}`);
            console.log(`📡 [Bus] Esperando conexiones de servicios y clientes...`);
        });
        
        server.on('error', (err) => {
            console.error('[Bus] Error del servidor:', err);
            process.exit(1);
        });
        
        // Manejo de cierre limpio
        process.on('SIGINT', () => {
            console.log('\n[Bus] Cerrando bus de mensajería...');
            server.close(() => {
                console.log('[Bus] Bus cerrado exitosamente');
                process.exit(0);
            });
        });
        
    } catch (error) {
        console.error('[Bus] Error al iniciar:', error);
        process.exit(1);
    }
}

// Iniciar el bus
startBus(); 