const { connectDB, mongoose } = require('../../database/db.js');
const net = require('net');
const { procesarPago } = require('../service/pagosLogic.js'); 

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'pagos';

function header(n) { return String(n).padStart(5, '0'); }

// --- Funciones para enviar respuesta al bus ---
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
                buffer = ''; // Clear buffer on invalid header
                break; // Exit while loop
            }

            const totalMessageLength = 5 + length;
            
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
            const contentAfterService = fullMessage.substring(10);

            const potentialStatusText = fullMessage.length >= 12 ? fullMessage.substring(10, 12) : '';
            const isMessageWithStatus = (potentialStatusText === 'OK' || potentialStatusText === 'NK');

            if (isMessageWithStatus) {
                if (serviceReceived === 'sinit' && potentialStatusText === 'OK') {
                    console.log(`[${SERVICE_NAME}Service] Ignoring 'sinit' OK reply from bus.`);
                } else if (serviceReceived === 'point' && potentialStatusText === 'OK') {
                    console.log(`[${SERVICE_NAME}Service] Ignoring async reply from 'point' service.`);
                }
                else {
                    console.warn(`[${SERVICE_NAME}Service] Received unexpected message with Status ('${potentialStatusText}') for service '${serviceReceived}'. Ignoring.`);
                }
                continue; 

            } else {
                if (serviceReceived === SERVICE_NAME) {
                    console.log(`[${SERVICE_NAME}Service] Processing client request.`);
                    const requestPayloadString = contentAfterService; 
                    (async (sendResponseFunc, sendErrorFunc, socket) => {
                        let session = null; // Initialize session to null
                        try {
                            const requestData = JSON.parse(requestPayloadString); // Parse payload inside try
                            // Start session and transaction only for the specific action that needs it
                            if (requestData.action === 'procesar_pago') { 
                                session = await mongoose.connection.startSession();
                                session.startTransaction();
                                console.log(`--- [${SERVICE_NAME}Service] Transaction started ---`); // Keep transaction log
                            }

                            let resultado;

                            // --- Route Action ---
                            if (requestData.action === 'procesar_pago') {
                                // Pass session and socket as required by procesarPago logic
                                resultado = await procesarPago(requestData.payload, session, socket);
                            } else {
                                // Action not recognized for THIS service
                                throw new Error(`Acción no reconocida en servicio '${SERVICE_NAME}': '${requestData.action}'`);
                            }

                            // --- Send Response ---
                            if (session && session.inTransaction()) { 
                                await session.commitTransaction();
                                console.log(`--- [${SERVICE_NAME}Service] Transaction committed ---`); // Keep transaction log
                            }
                            sendResponseFunc(socket, resultado); // Use passed function and serviceSocket

                        } catch (error) {
                            console.error(`❌ [${SERVICE_NAME}Service] ERROR during async processing:`, error.message); // Keep error log
                            // Abort transaction only if it was started and is active
                            if (session && session.inTransaction()) { 
                                await session.abortTransaction();
                                console.log(`--- [${SERVICE_NAME}Service] Transaction aborted ---`); // Keep transaction log
                            }
                            sendErrorFunc(socket, error.message); // Use passed function and serviceSocket
                        } finally {
                            // End session only if it was started
                            if (session) { 
                                await session.endSession();
                                console.log(`--- [${SERVICE_NAME}Service] Session ended ---`); // Keep session log
                            }
                        }
                    })(sendResponse, sendError, serviceSocket); // Execute IIFE and pass variables

                } else {
                    console.warn(`❌ [${SERVICE_NAME}Service] Client request format message for wrong service ('${serviceReceived}'). Expected '${SERVICE_NAME}'. Ignoring.`);
                }
            }
        } // End while loop
    });

    serviceSocket.on('close', () => { console.log(`[${SERVICE_NAME}Service] Conexión cerrada. Reintentando en 5 segundos...`); buffer = ''; setTimeout(connectToBus, 5000); });
    serviceSocket.on('error', (err) => console.error(`❌ [${SERVICE_NAME}Service] Error de socket:`, err.message));
    
    connectToBus(); // Iniciar la conexión al bus
}

startService();