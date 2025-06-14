// services/authService.js

const { connectDB } = require('../../database/db.js');
const net = require('net');
const { crearUsuario, autenticarUsuario } = require('./userlogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;

/**
 * Función helper para formatear y enviar mensajes al bus.
 */
function sendMessage(socket, destination, message) {
    console.log(`[authService] Preparando para enviar a destino: '${destination}'`);
    const payload = destination + message;
    const header = String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0');
    socket.write(header + payload);
    console.log(`[authService] Mensaje enviado a '${destination}'.`);
}

/**
 * Procesa un único mensaje completo que ha sido extraído del buffer.
 */
async function processRequest(socket, fullPayload, serviceName, handlerFunction) {
    const destination = fullPayload.substring(0, 5);
    const messageContent = fullPayload.substring(5);

    if (destination !== serviceName) return; // Ignorar mensajes que no son para nosotros

    console.log(`[Worker ${serviceName}] Petición recibida.`);
    let responseClientId = null;
    let correlationId = null;

    try {
        const requestData = JSON.parse(messageContent);
        responseClientId = requestData.clientId;
        correlationId = requestData.correlationId;

        if (!responseClientId || !correlationId) {
            throw new Error(`Petición a '${serviceName}' inválida.`);
        }
        
        const result = await handlerFunction(requestData.correo, requestData.password);
        
        const successPayload = { status: 'success', correlationId, data: result };
        // Usa el MISMO socket que recibió la petición para responder
        sendMessage(socket, responseClientId, JSON.stringify(successPayload));

    } catch (error) {
        console.error(`[Worker ${serviceName}] Error: ${error.message}`);
        if (responseClientId && correlationId) {
            const errorPayload = { status: 'error', correlationId, message: error.message };
            sendMessage(socket, responseClientId, JSON.stringify(errorPayload));
        }
    }
}

/**
 * Crea un "trabajador" que se conecta al bus y maneja un servicio específico.
 */
async function createServiceWorker(serviceName, handlerFunction) {
    const workerSocket = new net.Socket();
    let buffer = '';

    workerSocket.connect({ host: BUS_HOST, port: BUS_PORT }, () => {
        console.log(`[Worker ${serviceName}] Conectado al bus.`);
        // Este socket se registra para atender un servicio específico
        sendMessage(workerSocket, 'sinit', serviceName);
    });

    try {
        for await (const dataChunk of workerSocket) {
            buffer += dataChunk.toString('utf8');
            while (true) {
                if (buffer.length < 5) break;
                const length = parseInt(buffer.substring(0, 5), 10);
                if (isNaN(length) || buffer.length < 5 + length) break;
                
                const fullPayload = buffer.substring(5, 5 + length);
                buffer = buffer.substring(5 + length);
                
                // Llamamos a nuestra función de procesamiento que usa el workerSocket para responder
                await processRequest(workerSocket, fullPayload, serviceName, handlerFunction);
            }
        }
    } catch (err) {
        console.error(`[Worker ${serviceName}] Error en el stream: ${err.message}`);
    }
    console.log(`[Worker ${serviceName}] Conexión cerrada.`);
}

async function startServer() {
    await connectDB();
    console.log('Iniciando servicios de autenticación...');
    createServiceWorker('auths', crearUsuario);
    createServiceWorker('logns', autenticarUsuario);
}

startServer();