// services/service/catalogService.js

const { connectDB } = require('../../database/db.js');
const net = require('net');
const catalogLogic = require('./catalogLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'catal';

// --- Funciones de Comunicación ---
function header(n) { return String(n).padStart(5, '0'); }

// ***** INICIO DE LA CORRECCIÓN CRÍTICA *****
function registerService(socket) {
    const registerCommand = 'sinit'.padEnd(5, ' ');
    // ASEGURAMOS QUE EL NOMBRE DEL SERVICIO TENGA 5 CARACTERES
    const serviceIdentifier = SERVICE_NAME.padEnd(5, ' '); // Esto produce "catal "

    const payload = registerCommand + serviceIdentifier;
    const fullMessage = header(payload.length) + payload;
    
    console.log(`[${SERVICE_NAME}Service] -> Enviando mensaje de registro: "${fullMessage}"`);
    socket.write(fullMessage);
}
// ***** FIN DE LA CORRECCIÓN CRÍTICA *****

function sendResponse(socket, data) {
    const service = SERVICE_NAME.padEnd(5, ' ');
    const payload = JSON.stringify(data);
    const fullMessage = header(service.length + payload.length) + service + payload;
    console.log(`[${SERVICE_NAME}Service] -> Enviando respuesta al bus (Longitud: ${payload.length}): ${fullMessage.substring(0, 150)}...`);
    socket.write(fullMessage);
}

function sendError(socket, errorMessage) {
    const service = SERVICE_NAME.padEnd(5, ' ');
    const errorResponse = { status: 'error', message: errorMessage };
    const payload = JSON.stringify(errorResponse);
    const fullMessage = header(service.length + payload.length) + service + payload;
    console.log(`[${SERVICE_NAME}Service] -> Enviando ERROR al bus: ${fullMessage}`);
    socket.write(fullMessage);
}

// --- Función Principal (ya es robusta, no necesita cambios) ---
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
            console.log(`\n[${SERVICE_NAME}Service] <- Mensaje completo recibido: ${messageToProcess.substring(0,200)}...`);

            const statusCheck = messageToProcess.substring(10, 12);
            if (statusCheck === 'OK' || statusCheck === 'NK') {
                console.log(`[${SERVICE_NAME}Service] Mensaje de estado del bus ignorado.`);
                continue;
            }

            const messageContent = messageToProcess.substring(10);
            (async () => {
                try {
                    const requestData = JSON.parse(messageContent);
                    let result = await catalogLogic.listarTodosLosProductos();
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