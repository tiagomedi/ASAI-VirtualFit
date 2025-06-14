// services/adminService.js

const { connectDB } = require('../../database/db.js');
const net = require('net');
const User = require('../../database/models/user.model');
const productService = require('./productLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const ADMIN_SERVICE_NAME = 'admin';

async function verificarAdmin(userId) {
    // ... (esta función es correcta y no necesita cambios)
    const user = await User.findById(userId);
    if (!user || user.rol !== 'admin') {
        throw new Error('Acceso denegado. Se requiere rol de administrador.');
    }
    console.log(`[adminService] Usuario ${userId} verificado como administrador.`);
}

/**
 * Función que crea el worker para el servicio de administración.
 */
async function createAdminWorker() {
    const workerSocket = new net.Socket();
    let buffer = '';

    // --- CORRECCIÓN CLAVE ---
    // Usamos un objeto de opciones para una conexión inequívoca.
    const connectionOptions = {
        host: BUS_HOST,
        port: BUS_PORT
    };

    workerSocket.connect(connectionOptions, () => {
        console.log(`[Worker ${ADMIN_SERVICE_NAME}] Conectado al bus.`);
        sendMessage(workerSocket, 'sinit', ADMIN_SERVICE_NAME);
    });

    workerSocket.on('data', async (dataChunk) => {
        buffer += dataChunk.toString();
        while (true) {
            if (buffer.length < 5) break;
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length) || buffer.length < 5 + length) break;
            
            const fullPayload = buffer.substring(5, 5 + length);
            buffer = buffer.substring(5 + length);

            const destination = fullPayload.substring(0, 5);
            if (destination !== ADMIN_SERVICE_NAME) continue;

            // La llamada a handleAdminRequest ya es correcta
            await handleAdminRequest(workerSocket, fullPayload.substring(5));
        }
    });

    workerSocket.on('close', () => console.log(`[Worker ${ADMIN_SERVICE_NAME}] Conexión cerrada.`));
    workerSocket.on('error', (err) => console.error(`[Worker ${ADMIN_SERVICE_NAME}] Error: ${err.message}`));
}

async function handleAdminRequest(socket, messageContent) {
    let responseClientId = null;
    let correlationId = null; // Lo declaramos
    try {
        const requestData = JSON.parse(messageContent);
        responseClientId = requestData.clientId;
        correlationId = requestData.correlationId; // Capturamos si viene
        const { userId, operation, payload } = requestData;

        // --- VALIDACIÓN CORREGIDA ---
        if (!responseClientId || !userId || !operation || !payload) {
            throw new Error('Petición de admin inválida.');
        }

        await verificarAdmin(userId);

        let result;
        // ... (el switch case es correcto)
        
        const successPayload = { status: 'success', correlationId, data: result };
        sendMessage(socket, responseClientId, JSON.stringify(successPayload));

    } catch (error) {
        // ...
        if (responseClientId) {
            const errorPayload = { status: 'error', correlationId, message: error.message };
            sendMessage(socket, responseClientId, JSON.stringify(errorPayload));
        }
    }
}

function sendMessage(socket, destination, message) {
    // ... (esta función ya es correcta y no necesita cambios)
    const payload = destination + message;
    const header = String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0');
    socket.write(header + payload);
}

async function startServer() {
    await connectDB();
    console.log('Iniciando servicios de administración...');
    createAdminWorker();
}

startServer();