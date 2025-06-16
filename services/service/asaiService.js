// services/asaiService.js

const { connectDB } = require('../../database/db.js');
const net = require('net');
const Product = require('../../database/models/product.model');
const Order = require('../../database/models/order.model');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const ASAI_SERVICE_NAME = 'asais';

/**
 * Helper para enviar respuestas a través del socket del worker.
 */
function sendMessage(socket, destinationId, payload) {
    const messageJson = JSON.stringify(payload);
    const finalPayloadString = destinationId + messageJson;

    // 1. Crear un Buffer a partir del payload string. Esto nos da la longitud en bytes REAL.
    const payloadBuffer = Buffer.from(finalPayloadString, 'utf8');
    const payloadLength = payloadBuffer.length; // .length en un Buffer es su tamaño en bytes.

    // 2. Crear un Buffer para el header. 5 bytes de longitud.
    const headerBuffer = Buffer.alloc(5);
    headerBuffer.write(String(payloadLength).padStart(5, '0'), 'utf8');

    // 3. Concatenar los dos buffers (header + payload) en un único buffer final.
    const messageBuffer = Buffer.concat([headerBuffer, payloadBuffer]);

    try {
        // 4. Escribir el buffer completo en una sola operación.
        // Esto es mucho más fiable que escribir una string concatenada.
        socket.write(messageBuffer);
        console.log(`[Service] Respuesta enviada a '${destinationId}'. Header: ${headerBuffer.toString()}, Longitud: ${payloadLength}, Total Bytes: ${messageBuffer.length}`);
    } catch (error) {
        console.error(`[Service] Error al escribir en el socket: ${error.message}`);
    }
}
/**
 * Lógica de negocio para interpretar la consulta.
 */
async function interpretarConsulta(query, userId) {
    const q = query.toLowerCase().trim();
    console.log(`[asaiService] Interpretando consulta para el usuario ${userId}: "${q}"`);

    if (q.includes('pedido') || q.includes('orden')) {
        const ultimoPedido = await Order.findOne({ user_id: userId }).sort({ createdAt: -1 }).lean();
        if (!ultimoPedido) return "Aún no tienes pedidos en tu historial.";
        return `El estado de tu último pedido es: "${ultimoPedido.estado}".`;
    }
    if (q.includes('buscar')) {
        // En un futuro, aquí buscarías en la DB de productos.
        return "He encontrado estos productos para ti: Zapatillas Rojas, Camiseta Azul.";
    }
    return "¡Hola! Soy ASAI. ¿En qué puedo ayudarte? Prueba con 'buscar productos' o 'estado de mi pedido'.";
}

/**
 * Procesa una petición completa dirigida a este servicio.
 */
async function handleAsaiRequest(socket, messageContent) {
    let responseClientId = null;
    let correlationId = null; 
    try {
        const requestData = JSON.parse(messageContent);
        responseClientId = requestData.clientId;
        correlationId = requestData.correlationId;
        const { userId, query } = requestData;

        if (!userId || typeof query === 'undefined' || !responseClientId || !correlationId) {
            throw new Error("Petición a ASAI inválida: falta 'userId', 'query', 'clientId' o 'correlationId'.");
        }

        const asaiResponseText = await interpretarConsulta(query, userId);
        
        const successPayload = { 
            status: 'success', 
            correlationId,
            data: { respuesta: asaiResponseText } 
        };
        sendMessage(socket, responseClientId, successPayload);

    } catch (error) {
        console.error(`[asaiService Handler] Error: ${error.message}`);
        if (responseClientId && correlationId) {
            const errorPayload = { 
                status: 'error', 
                correlationId,
                message: error.message 
            };
            sendMessage(socket, responseClientId, errorPayload);
        }
    }
}

/**
 * Crea el worker que se conecta al bus y escucha peticiones.
 */
function createAsaiWorker() {
    const workerSocket = new net.Socket();
    let buffer = '';

    workerSocket.connect({ host: BUS_HOST, port: BUS_PORT }, () => {
        console.log(`[Worker ${ASAI_SERVICE_NAME}] Conectado para recibir peticiones.`);
        const registerPayload = 'sinit' + ASAI_SERVICE_NAME;
        const header = String(Buffer.byteLength(registerPayload, 'utf8')).padStart(5, '0');
        workerSocket.write(header + registerPayload);
    });

    workerSocket.on('data', (dataChunk) => {
        buffer += dataChunk.toString('utf8');
        while (true) {
            if (buffer.length < 5) break;
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length) || buffer.length < 5 + length) break;
            
            const fullPayload = buffer.substring(5, 5 + length);
            buffer = buffer.substring(5 + length);
            const destination = fullPayload.substring(0, 5);

            if (destination === ASAI_SERVICE_NAME) {
                // Pasamos el socket del worker para poder responder por el mismo canal.
                handleAsaiRequest(workerSocket, fullPayload.substring(5));
            }
        }
    });

    workerSocket.on('close', () => {
        console.log(`[Worker ${ASAI_SERVICE_NAME}] Conexión de escucha cerrada. Reintentando en 5 segundos...`);
        setTimeout(createAsaiWorker, 5000);
    });

    workerSocket.on('error', (err) => {
        console.error(`[Worker ${ASAI_SERVICE_NAME}] Error de socket: ${err.message}`);
        // La conexión se cerrará y el evento 'close' se encargará de reconectar.
    });
}

/**
 * Función principal que inicia el servicio.
 */
async function startServer() {
    await connectDB();
    console.log('Iniciando servicio de asistente ASAI...');
    createAsaiWorker();
}

startServer();