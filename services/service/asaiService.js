const { connectDB } = require('../../database/db.js');
const net = require('net');
const Product = require('../../database/models/product.model');
const Order = require('../../database/models/order.model');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const ASAI_SERVICE_NAME = 'asais';

/**
 * Función helper para formatear y enviar mensajes al bus.
 */
function sendMessage(socket, destination, message) {
    console.log(`[asaiService] Preparando para enviar a destino: '${destination}'`);
    const payload = destination + message;
    const header = String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0');
    socket.write(header + payload);
    console.log(`[asaiService] Mensaje enviado a '${destination}'.`);
}

/**
 * La lógica de negocio que interpreta la consulta del usuario.
 */
async function interpretarConsulta(query, userId) {
    const q = query.toLowerCase().trim();
    console.log(`[asaiService] Interpretando consulta para el usuario ${userId}: "${q}"`);

    // Lógica de palabras clave (tu código actual ya es bueno)
    if (q.includes('pedido') || q.includes('orden')) {
        const ultimoPedido = await Order.findOne({ user_id: userId }).sort({ createdAt: -1 }).lean();
        if (!ultimoPedido) return "No tienes pedidos recientes.";
        return `El estado de tu último pedido es: "${ultimoPedido.estado}".`;
    }
    if (q.includes('buscar')) {
        // ... tu lógica de búsqueda ...
        return "He encontrado estos productos para ti: Zapatillas Rojas, Camiseta Azul.";
    }
    return "¡Hola! Soy ASAI. ¿En qué puedo ayudarte? Prueba con 'buscar productos' o 'estado de mi pedido'.";
}

/**
 * Procesa un único mensaje completo que ha sido extraído del buffer.
 */
async function processRequest(socket, fullPayload) {
    const destination = fullPayload.substring(0, 5);
    const messageContent = fullPayload.substring(5);

    if (destination !== ASAI_SERVICE_NAME) return;

    console.log(`[Worker ${ASAI_SERVICE_NAME}] Petición recibida.`);
    let responseClientId = null;
    let correlationId = null;

    try {
        const requestData = JSON.parse(messageContent);
        responseClientId = requestData.clientId;
        correlationId = requestData.correlationId;

        if (!responseClientId || !correlationId || typeof requestData.query === 'undefined') {
            throw new Error(`Petición a '${ASAI_SERVICE_NAME}' inválida.`);
        }
        
        const asaiResponseText = await interpretarConsulta(requestData.query, requestData.userId);
        
        const successPayload = { status: 'success', correlationId, data: { respuesta: asaiResponseText } };
        // Usa el MISMO socket que recibió la petición para responder
        sendMessage(socket, responseClientId, JSON.stringify(successPayload));

    } catch (error) {
        console.error(`[Worker ${ASAI_SERVICE_NAME}] Error: ${error.message}`);
        if (responseClientId && correlationId) {
            const errorPayload = { status: 'error', correlationId, message: error.message };
            sendMessage(socket, responseClientId, JSON.stringify(errorPayload));
        }
    }
}

/**
 * Crea el worker que se conecta al bus y maneja el servicio ASAI.
 */
async function createAsaiWorker() {
    const workerSocket = new net.Socket();
    let buffer = '';

    workerSocket.connect({ host: BUS_HOST, port: BUS_PORT }, () => {
        console.log(`[Worker ${ASAI_SERVICE_NAME}] Conectado al bus.`);
        sendMessage(workerSocket, 'sinit', ASAI_SERVICE_NAME);
    });

    try {
        for await (const dataChunk of workerSocket) {
            buffer += dataChunk.toString('utf8');
            while (true) {
                if (buffer.length < 5) break;
                const length = parseInt(buffer.substring(0, 5), 10);
                if (isNaN(length) || buffer.length < 5 + length) break;
                
                const fullPayload = buffer.substring(5, 5 + length);
                buffer = buffer.substring(5 + length);
                
                // Llamamos a nuestra función de procesamiento que usa el workerSocket para responder
                await processRequest(workerSocket, fullPayload);
            }
        }
    } catch (err) {
        console.error(`[Worker ${ASAI_SERVICE_NAME}] Error en el stream: ${err.message}`);
    }
    console.log(`[Worker ${ASAI_SERVICE_NAME}] Conexión cerrada.`);
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