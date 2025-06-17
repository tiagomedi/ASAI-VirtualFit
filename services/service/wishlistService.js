// services/service/wishlistService.js

const { connectDB } = require('../../database/db.js');
const net = require('net');
const wishlistLogic = require('./wishlistLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'deseo';

// --- Funciones de Comunicación Profesionales y Estandarizadas ---
function header(n) { return String(n).padStart(5, '0'); }

function registerService(socket) {
    const registerCommand = 'sinit'.padEnd(5, ' ');
    const serviceIdentifier = SERVICE_NAME.padEnd(5, ' ');
    const payload = registerCommand + serviceIdentifier;
    const fullMessage = header(payload.length) + payload;
    console.log(`[${SERVICE_NAME}Service] -> Enviando mensaje de registro: "${fullMessage}"`);
    socket.write(fullMessage);
}

function sendResponse(socket, data) {
    const service = SERVICE_NAME.padEnd(5, ' ');
    const status = "OK"; // El bus REQUIERE este estado para reenviar la respuesta.
    const jsonPayload = JSON.stringify(data);
    
    const payload = status + jsonPayload;

    const messageLength = service.length + Buffer.byteLength(payload, 'utf8');
    const messageHeader = header(messageLength);

    const fullMessage = messageHeader + service + payload;
    
    console.log(`[${SERVICE_NAME}Service] -> Enviando respuesta (CON OK) al bus: ${fullMessage.substring(0, 150)}...`);
    socket.write(fullMessage);
}

function sendError(socket, errorMessage) {
    const service = SERVICE_NAME.padEnd(5, ' ');
    const status = "OK";
    const errorResponse = { status: 'error', message: errorMessage };
    const jsonPayload = JSON.stringify(errorResponse);

    const payload = status + jsonPayload;

    const messageLength = service.length + Buffer.byteLength(payload, 'utf8');
    const messageHeader = header(messageLength);

    const fullMessage = messageHeader + service + payload;
    console.log(`[${SERVICE_NAME}Service] -> Enviando ERROR (CON OK) al bus: ${fullMessage}`);
    socket.write(fullMessage);
}
// --- Función Principal del Servicio (ya robusta) ---
async function startService() {
    await connectDB();
    const serviceSocket = new net.Socket();
    const connectToBus = () => serviceSocket.connect(BUS_PORT, BUS_HOST);

    serviceSocket.on('connect', () => {
        console.log(`[${SERVICE_NAME}Service] Conectado al bus en ${BUS_PORT}.`);
        registerService(serviceSocket);
    });

    let buffer = '';
    serviceSocket.on('data', (data) => {
        buffer += data.toString();
        while (true) {
            if (buffer.length < 5) break;
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length)) { buffer = ''; break; }
            const totalMessageLength = 5 + length;
            if (buffer.length < totalMessageLength) break;
            
            const messageToProcess = buffer.substring(0, totalMessageLength);
            buffer = buffer.substring(totalMessageLength);
            console.log(`\n[${SERVICE_NAME}Service] <- Mensaje completo recibido: ${messageToProcess.substring(0, 200)}...`);

            const statusCheck = messageToProcess.substring(10, 12);
            if (statusCheck === 'OK' || statusCheck === 'NK') {
                console.log(`[${SERVICE_NAME}Service] Mensaje de estado del bus ignorado.`);
                continue;
            }

            const messageContent = messageToProcess.substring(10);
            (async () => {
                try {
                    const req = JSON.parse(messageContent);
                    let result;
                    switch (req.action) {
                        case 'view':
                            result = await wishlistLogic.verListaDeDeseos(req.user_id);
                            break;
                        case 'add':
                            result = await wishlistLogic.agregarALista(req.user_id, req.producto_id);
                            break;
                        case 'remove':
                            result = await wishlistLogic.eliminarDeLista(req.user_id, req.producto_id);
                            break;
                        default:
                            throw new Error(`Acción desconocida en wishlistService: ${req.action}`);
                    }
                    sendResponse(serviceSocket, result);
                } catch (error) {
                    console.error(`[${SERVICE_NAME}Service] ERROR procesando solicitud:`, error.message);
                    sendError(serviceSocket, error.message);
                }
            })();
        }
    });

    serviceSocket.on('close', () => { console.log(`[${SERVICE_NAME}Service] Conexión cerrada. Reintentando...`); buffer = ''; setTimeout(connectToBus, 5000); });
    serviceSocket.on('error', (err) => console.error(`[${SERVICE_NAME}Service] Error de conexión:`, err.message));

    connectToBus();
}

startService();