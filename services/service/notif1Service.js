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
        console.log(`[${SERVICE_NAME}Service] Enviando registro: "${registerMessage}"`);
        serviceSocket.write(registerMessage);
    });

    let buffer = '';
    serviceSocket.on('data', (data) => {
        buffer += data.toString();
        console.log(`[${SERVICE_NAME}Service] 📨 Datos recibidos del bus: "${data.toString()}"`);
        console.log(`[${SERVICE_NAME}Service] 📦 Buffer actual length: ${buffer.length}`);

        while (buffer.length >= 5) {
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length) || length <= 0 || buffer.length < 5 + length) {
                console.log(`[${SERVICE_NAME}Service] ⏳ Esperando más datos. Length esperado: ${length}, buffer actual: ${buffer.length}`);
                break;
            }
            
            const fullMessage = buffer.substring(0, 5 + length);
            buffer = buffer.substring(5 + length);
            console.log(`[${SERVICE_NAME}Service] 📄 Mensaje completo extraído: "${fullMessage}"`);

            const serviceReceived = fullMessage.substring(5, 10).trim();
            const contentAfterService = fullMessage.substring(10);
            console.log(`[${SERVICE_NAME}Service] 🎯 Servicio destinatario: "${serviceReceived}"`);
            console.log(`[${SERVICE_NAME}Service] 📝 Contenido después del servicio: "${contentAfterService.substring(0, 100)}..."`);
            
            // Ignoramos respuestas del bus (tienen OK/NK)
            if (contentAfterService.startsWith('OK') || contentAfterService.startsWith('NK')) {
                console.log(`[${SERVICE_NAME}Service] Respuesta del bus: ${contentAfterService.substring(0, 20)}...`);
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
                        console.log(`[${SERVICE_NAME}Service] Raw payload: "${payloadString}"`);
                        console.log(`[${SERVICE_NAME}Service] Payload length: ${payloadString.length}`);
                        
                        // Estrategia más robusta para limpiar el JSON
                        let cleanPayload = payloadString.trim();
                        
                        // Buscar el primer '{' y el último '}' para extraer el JSON válido
                        const firstBrace = cleanPayload.indexOf('{');
                        const lastBrace = cleanPayload.lastIndexOf('}');
                        
                        if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
                            throw new Error('No se encontró JSON válido en el payload');
                        }
                        
                        const validJson = cleanPayload.substring(firstBrace, lastBrace + 1);
                        console.log(`[${SERVICE_NAME}Service] JSON extraído length: ${validJson.length}`);
                        console.log(`[${SERVICE_NAME}Service] JSON preview: ${validJson.substring(0, 100)}...`);
                        
                        const requestData = JSON.parse(validJson);
                        if (requestData.action === 'send_email') {
                            const resultado = await sendEmail(requestData.payload);
                            sendResponse(serviceSocket, resultado, clientId);
                        } else {
                            throw new Error(`Acción no reconocida: '${requestData.action}'`);
                        }
                    } catch (error) {
                        console.error(`❌ [${SERVICE_NAME}Service] ERROR:`, error.message);
                        sendError(serviceSocket, error.message, clientId);
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