// services/authService.js

const { connectDB } = require('../../database/db.js');
const net = require('net');
const { crearUsuario, autenticarUsuario } = require('./userService');


const BUS_HOST = 'localhost';
const BUS_PORT = 5001;

function sendMessage(socket, destination, message) {
    console.log(`[authService] Preparando para enviar a destino: '${destination}'`);
    const payload = destination + message;

    // --- CORRECCIÓN FINAL ---
    // Calculamos la longitud del payload EN BYTES, no en caracteres.
    const header = String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0');
    
    socket.write(header + payload);
    console.log(`[authService] Mensaje enviado a '${destination}'.`);
}

async function processMessage(socket, fullPayload, serviceName, handlerFunction) {
    const destination = fullPayload.substring(0, 5);
    const messageContent = fullPayload.substring(5);

    if (destination !== serviceName) return;

    console.log(`[Worker ${serviceName}] Petición recibida.`);
    let responseClientId = null;
    try {
        const requestData = JSON.parse(messageContent);
        responseClientId = requestData.clientId;

        if (!responseClientId) throw new Error("Payload sin clientId.");
        
        const result = await handlerFunction(requestData.correo, requestData.password);
        
        const successPayload = { status: 'success', data: result };
        sendMessage(socket, responseClientId, JSON.stringify(successPayload));

    } catch (error) {
        console.error(`[Worker ${serviceName}] Error: ${error.message}`);
        if (responseClientId) {
            const errorPayload = { status: 'error', message: error.message };
            sendMessage(socket, responseClientId, JSON.stringify(errorPayload));
        }
    }
}

async function createServiceWorker(serviceName, handlerFunction) {
    const workerSocket = new net.Socket();
    let buffer = '';

    workerSocket.connect(BUS_PORT, BUS_HOST, () => {
        console.log(`[Worker ${serviceName}] Conectado al bus.`);
        sendMessage(workerSocket, 'sinit', serviceName);
    });

    try {
        for await (const dataChunk of workerSocket) {
            buffer += dataChunk.toString();
            while (true) {
                if (buffer.length < 5) break;
                const length = parseInt(buffer.substring(0, 5), 10);
                if (isNaN(length)) { // Comprobación de seguridad
                    console.error(`[Worker ${serviceName}] Cabecera inválida. Buffer: ${buffer}`);
                    buffer = ""; // Limpiar buffer corrupto
                    break;
                }
                if (buffer.length < 5 + length) break;
                
                const fullPayload = buffer.substring(5, 5 + length);
                buffer = buffer.substring(5 + length);

                await processMessage(workerSocket, fullPayload, serviceName, handlerFunction);
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