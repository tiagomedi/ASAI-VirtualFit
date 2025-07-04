// notif1Service.js

require('dotenv').config();
const { connectDB } = require('../../database/db.js');
const net = require('net');
const { sendEmail } = require('../service/notif1Logic.js'); 

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'notif';

function header(n) { return String(n).padStart(5, '0'); }

// Solo responde si hay un clientId
function sendResponse(socket, data, clientId) {
    if (!clientId) return; // No responder a servicios
    const service = SERVICE_NAME.padEnd(5, ' ');
    const payload = JSON.stringify(data);
    const messageBody = service + clientId + payload;
    const fullMessage = header(messageBody.length) + messageBody;
    console.log(`[${SERVICE_NAME}Service] -> Enviando respuesta a cliente ${clientId.trim()}`);
    socket.write(fullMessage);
}

function sendError(socket, errorMessage, clientId) {
    if (!clientId) return; // No responder a servicios
    const service = SERVICE_NAME.padEnd(5, ' ');
    const errorResponse = { status: 'error', message: errorMessage };
    const payload = JSON.stringify(errorResponse);
    const messageBody = service + clientId + payload;
    const fullMessage = header(messageBody.length) + messageBody;
    console.error(`❌ [${SERVICE_NAME}Service] -> Enviando ERROR a cliente ${clientId.trim()}: ${errorMessage}`);
    socket.write(fullMessage);
}

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
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length) || length <= 0 || buffer.length < 5 + length) break;
            
            const fullMessage = buffer.substring(0, 5 + length);
            buffer = buffer.substring(5 + length);

            const serviceReceived = fullMessage.substring(5, 10).trim();
            const contentAfterService = fullMessage.substring(10);
            
            // Ignoramos respuestas del bus (tienen OK/NK)
            if (contentAfterService.startsWith('OK') || contentAfterService.startsWith('NK')) {
                console.log(`[${SERVICE_NAME}Service] Ignorando respuesta del bus.`);
                continue;
            }
            
            let clientId = null;
            let payloadString = contentAfterService;

            // --- LÓGICA DE DETECCIÓN DE SOLICITUD ---
            // Si el contenido no empieza con '{', asumimos que los primeros 10 chars son un ID de cliente
            if (!contentAfterService.trim().startsWith('{')) {
                clientId = contentAfterService.substring(0, 10);
                payloadString = contentAfterService.substring(10);
                console.log(`[${SERVICE_NAME}Service] Solicitud de cliente detectada. ID: ${clientId.trim()}`);
            } else {
                console.log(`[${SERVICE_NAME}Service] Solicitud de servicio detectada (sin ID de cliente).`);
            }

            if (serviceReceived === SERVICE_NAME) {
                (async () => {
                    try {
                        const requestData = JSON.parse(payloadString);
                        if (requestData.action === 'send_email') {
                            const resultado = await sendEmail(requestData.payload);
                            sendResponse(serviceSocket, resultado, clientId); // Solo responde si hay ID
                        } else {
                            throw new Error(`Acción no reconocida: '${requestData.action}'`);
                        }
                    } catch (error) {
                        console.error(`❌ [${SERVICE_NAME}Service] ERROR:`, error.message);
                        sendError(serviceSocket, error.message, clientId); // Solo responde si hay ID
                    }
                })();
            }
        }
    });

    serviceSocket.on('close', () => { console.log(`[${SERVICE_NAME}Service] Conexión cerrada. Reintentando...`); buffer = ''; setTimeout(connectToBus, 5000); });
    serviceSocket.on('error', (err) => console.error(`❌ [${SERVICE_NAME}Service] Error de socket:`, err.message));
    
    connectToBus();
}

startService();