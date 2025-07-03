const { connectDB } = require('../../database/db.js'); 
const net = require('net');
const { crearOrden, buscarOrdenesPorUsuario } = require('../service/orderLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'order';

function header(n) { return String(n).padStart(5, '0'); }

// --- Funciones para enviar respuesta al bus---
function sendResponse(socket, data) {
    const service = SERVICE_NAME.padEnd(5, ' ');
    const payload = JSON.stringify(data);
    const fullMessage = header(service.length + 2 + payload.length) + service + 'OK' + payload;
    console.log(`[${SERVICE_NAME}Service] -> Enviando respuesta OK`);
    socket.write(fullMessage);
}

function sendError(socket, errorMessage) {
    const service = SERVICE_NAME.padEnd(5, ' ');
    const payload = JSON.stringify({ error: errorMessage });
    const fullMessage = header(service.length + 2 + payload.length) + service + 'NK' + payload;
    console.error(`❌ [${SERVICE_NAME}Service] -> Enviando ERROR (NK): ${errorMessage}`);
    socket.write(fullMessage);
}
// --- Fin Funciones de Respuesta ---

async function startService() {
    await connectDB();
    const serviceSocket = new net.Socket();
    const connectToBus = () => serviceSocket.connect(BUS_PORT, BUS_HOST);

    serviceSocket.on('connect', () => {
        console.log(`✅ [${SERVICE_NAME}Service] Conectado al bus en ${BUS_PORT}.`);
        const registerMessage = header(10) + 'sinit'.padEnd(5) + SERVICE_NAME.padEnd(5);
        serviceSocket.write(registerMessage);
    });

    let buffer = '';
    serviceSocket.on('data', (data) => {
        buffer += data.toString();

        while (buffer.length >= 5) {
            const header = buffer.substring(0, 5);
            const length = parseInt(header, 10);

             if (isNaN(length) || length <= 0 || length > 100000) { // Add more strict checks for length
                console.error(`❌ [${SERVICE_NAME}Service] Invalid or negative header length "${header}" (Parsed: ${length}). Clearing buffer to prevent infinite loop.`);
                buffer = ''; 
                break;
            }

            const totalMessageLength = 5 + length;
            
            if (length > 100000) { 
                console.error(`❌ [${SERVICE_NAME}Service] Excessive message length ${length}. Possible buffer corruption. Clearing buffer.`);
                buffer = '';
                break;
            }


            if (buffer.length < totalMessageLength) {
                break; 
            }

            const fullMessage = buffer.substring(0, totalMessageLength);
            buffer = buffer.slice(totalMessageLength);
            if (fullMessage.length < 10) { 
                console.warn(`[${SERVICE_NAME}Service] Received message too short to contain service name (${fullMessage.length} bytes). Ignoring.`);
                continue;
            }

            const serviceNamePart = fullMessage.substring(5, 10);
            const serviceReceived = serviceNamePart.trim();
            const contentAfterService = fullMessage.substring(10); // This is either Status+Payload or just Payload

            const potentialStatusText = fullMessage.length >= 12 ? fullMessage.substring(10, 12) : '';
            const isMessageWithStatus = (potentialStatusText === 'OK' || potentialStatusText === 'NK');

            if (isMessageWithStatus) {
                if (serviceReceived === 'sinit' && potentialStatusText === 'OK') {
                    console.log(`[${SERVICE_NAME}Service] Ignoring 'sinit' OK reply from bus.`);
                } else {
                    console.warn(`[${SERVICE_NAME}Service] Received unexpected message for service '${serviceReceived}' with Status ('${potentialStatusText}'). Ignoring.`);
                }
                continue;

            } else {
                if (serviceReceived === SERVICE_NAME) {
                    console.log(`[${SERVICE_NAME}Service] Processing client request.`);
                    const requestPayloadString = contentAfterService; 
                    (async (sendResponseFunc, sendErrorFunc, socket) => {
                        try {
                            const requestData = JSON.parse(requestPayloadString); 
                            let resultado;

                            // --- Route Action ---
                            if (requestData.action === 'create_order') {
                                resultado = await crearOrden(requestData.payload);
                            } else if (requestData.action === 'find_orders') {
                                resultado = await buscarOrdenesPorUsuario(requestData.payload.email);
                            } else {
                                // Action not recognized for THIS service
                                throw new Error(`Acción no reconocida en servicio '${SERVICE_NAME}': '${requestData.action}'`);
                            }

                            // --- Send Response ---
                            sendResponseFunc(socket, resultado); // Use passed function and serviceSocket

                        } catch (error) {
                            console.error(`❌ [${SERVICE_NAME}Service] ERROR during async processing:`, error.message); // Keep error log
                            sendErrorFunc(socket, error.message); // Use passed function and serviceSocket
                        } finally {
                            // console.log(`[${SERVICE_NAME}Service] Async processing finished for message.`); // Reduced logging
                        }
                    })(sendResponse, sendError, serviceSocket); // Execute IIFE and pass variables


                } else {
                    console.warn(`❌ [${SERVICE_NAME}Service] Client request format message for wrong service ('${serviceReceived}'). Expected '${SERVICE_NAME}'. Ignoring.`);
                }
            }

        } 
    });

    serviceSocket.on('close', () => { console.log(`[${SERVICE_NAME}Service] Conexión cerrada. Reintentando en 5 segundos...`); buffer = ''; setTimeout(connectToBus, 5000); });
    serviceSocket.on('error', (err) => console.error(`❌ [${SERVICE_NAME}Service] Error de socket:`, err.message));
    
    connectToBus(); // Iniciar la conexión al bus
}

startService();