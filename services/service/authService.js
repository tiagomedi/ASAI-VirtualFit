// services/authService.js

const { connectDB } = require('../../database/db.js');
const net = require('net');
const { crearUsuario, autenticarUsuario } = require('./userlogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;

/**
 * Función helper para formatear y enviar mensajes al bus.
 */
function sendMessage(socket, destination, message, serviceName, status = 'OK') {
    console.log(`[authService] Preparando para enviar a destino: '${destination}'`);
    const serviceNameFormatted = serviceName.padEnd(5, ' '); // Nombre del servicio que envía la respuesta
    const statusField = status.padEnd(2, ' '); // Campo de status de 2 bytes
    const payload = serviceNameFormatted + statusField + message;
    const header = String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0');
    socket.write(header + payload);
    console.log(`[authService] Mensaje enviado a '${destination}' con status '${status}'.`);
}

/**
 * Función para registrar un servicio en el bus.
 */
function registerService(socket, serviceName) {
    console.log(`[authService] Registrando servicio: '${serviceName}'`);
    const registerPayload = 'sinit' + serviceName;
    const header = String(Buffer.byteLength(registerPayload, 'utf8')).padStart(5, '0');
    socket.write(header + registerPayload);
    console.log(`[authService] Registro enviado para '${serviceName}'.`);
}

/**
 * Procesa un único mensaje completo que ha sido extraído del buffer.
 */
async function processRequest(socket, fullPayload, serviceName, handlerFunction) {
    const destination = fullPayload.substring(0, 5);
    const messageContent = fullPayload.substring(5);

    if (destination !== serviceName) return;

    console.log(`[Worker ${serviceName}] Petición recibida.`);
    let responseClientId = null;
    let correlationId = null; // Lo declaramos para usarlo si existe

    try {
        const requestData = JSON.parse(messageContent);
        responseClientId = requestData.clientId;
        correlationId = requestData.correlationId; // Capturamos el ID si viene

        // --- VALIDACIÓN CORREGIDA ---
        // Solo validamos el clientId, que es esencial para responder.
        if (!responseClientId) {
            throw new Error(`La petición no contiene un 'clientId'.`);
        }
        
        const result = await handlerFunction(requestData.correo, requestData.password);
        
        const successPayload = { status: 'success', correlationId, data: result };
        sendMessage(socket, responseClientId, JSON.stringify(successPayload), serviceName, 'OK');

    } catch (error) {
        console.error(`[Worker ${serviceName}] Error: ${error.message}`);
        if (responseClientId) {
            // El correlationId puede ser undefined aquí, y eso está bien.
            const errorPayload = { status: 'error', correlationId, message: error.message };
            sendMessage(socket, responseClientId, JSON.stringify(errorPayload), serviceName, 'ER');
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
        registerService(workerSocket, serviceName);
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