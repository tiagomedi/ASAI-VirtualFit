// services/cartService.js
const { connectDB } = require('../../database/db.js');
const net = require('net');
const cartLogic = require('./cartLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'carro';

// --- Funciones de Comunicación (Robustas) ---
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
    const payload = JSON.stringify(data);
    const fullMessage = header(service.length + payload.length) + service + payload;
    console.log(`[${SERVICE_NAME}Service] -> Enviando respuesta: ${fullMessage.substring(0, 150)}...`);
    socket.write(fullMessage);
}

function sendError(socket, errorMessage) {
    const service = SERVICE_NAME.padEnd(5, ' ');
    const errorResponse = { status: 'error', message: errorMessage };
    const payload = JSON.stringify(errorResponse);
    const fullMessage = header(service.length + payload.length) + service + payload;
    console.log(`[${SERVICE_NAME}Service] -> Enviando ERROR: ${fullMessage}`);
    socket.write(fullMessage);
}


// --- Función Principal del Servicio ---
async function startService() {
    await connectDB();
    const serviceSocket = new net.Socket();
    const connectToBus = () => serviceSocket.connect(BUS_PORT, BUS_HOST);

    serviceSocket.on('connect', () => {
        console.log(`[${SERVICE_NAME}Service] Conectado al bus en ${BUS_PORT}.`);
        registerService(serviceSocket);
    });

    // ***** INICIO DE LA CORRECCIÓN CRÍTICA *****
    // Implementación del búfer de lectura robusto
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
                    const req = JSON.parse(messageContent);
                    let result;
                    switch (req.action) {
                        case 'view':
                            result = await cartLogic.verCarrito(req.user_id);
                            break;
                        case 'add':
                            result = await cartLogic.agregarAlCarrito(req.user_id, req.producto_id, req.cantidad);
                            break;
                        case 'update':
                            result = await cartLogic.modificarCantidad(req.user_id, req.producto_variacion_id, req.nueva_cantidad);
                            break;
                        case 'remove':
                            result = await cartLogic.eliminarDelCarrito(req.user_id, req.producto_variacion_id);
                            break;
                        default:
                            throw new Error(`Acción desconocida en cartService: ${req.action}`);
                    }
                    sendResponse(serviceSocket, result);
                } catch (error) {
                    console.error(`[${SERVICE_NAME}Service] ERROR procesando solicitud:`, error.message);
                    sendError(serviceSocket, error.message);
                }
            })();
        }
    });
    // ***** FIN DE LA CORRECCIÓN CRÍTICA *****


    serviceSocket.on('close', () => { console.log(`[${SERVICE_NAME}Service] Conexión cerrada. Reintentando...`); buffer = ''; setTimeout(connectToBus, 5000); });
    serviceSocket.on('error', (err) => console.error(`[${SERVICE_NAME}Service] Error de conexión:`, err.message));

    connectToBus();
}

startService();