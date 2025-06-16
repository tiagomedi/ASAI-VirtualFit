// services/service/catalogService.js

const { connectDB } = require('../../database/db.js');
const net = require('net');
const catalogLogic = require('./catalogLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'catal';

// --- Funciones de Comunicación (sin cambios, ya son robustas) ---
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
    console.log(`[${SERVICE_NAME}Service] -> Enviando respuesta (Longitud: ${payload.length}): ${fullMessage.substring(0, 150)}...`);
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


// --- Función Principal del Servicio ---
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
                    const req = JSON.parse(messageContent);
                    let result;

                    // ***** INICIO DE LA CORRECCIÓN CRÍTICA *****
                    // El switch debe manejar todas las acciones definidas en catalogLogic.
                    switch (req.action) {
                        case 'list_all':
                            console.log("--- [catalogService] Enrutando a 'listarTodosLosProductos' ---");
                            result = await catalogLogic.listarTodosLosProductos();
                            break;
                        case 'search':
                             console.log("--- [catalogService] Enrutando a 'buscarProductos' ---");
                            result = await catalogLogic.buscarProductos(req.term);
                            break;
                        case 'filter':
                             console.log("--- [catalogService] Enrutando a 'filtrarProductos' ---");
                            result = await catalogLogic.filtrarProductos(req.criteria);
                            break;
                        case 'get_details': // ¡Esta era la acción que faltaba!
                             console.log("--- [catalogService] Enrutando a 'obtenerDetallesProducto' ---");
                            result = await catalogLogic.obtenerDetallesProducto(req.producto_id);
                            break;
                        default:
                            throw new Error(`Acción desconocida en catalogService: ${req.action}`);
                    }
                    // ***** FIN DE LA CORRECCIÓN CRÍTICA *****
                    
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