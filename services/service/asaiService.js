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
 * Mantiene el mismo formato que authService para consistencia.
 */
function sendMessage(socket, destination, message, serviceName, status = 'OK') {
    console.log(`[asaiService] Preparando para enviar a destino: '${destination}'`);
    // The message format should be: destination(5) + serviceName(5) + status(2) + JSON
    // The bus will route based on destination and forward the entire message to the client
    const destinationFormatted = destination.padEnd(5, ' '); // Destino (clientId) para routing del bus
    const serviceNameFormatted = serviceName.padEnd(5, ' '); // Nombre del servicio - 5 bytes  
    const statusField = status.padEnd(2, ' '); // Campo de status - 2 bytes
    const fullMessage = destinationFormatted + serviceNameFormatted + statusField + message;
    const header = String(Buffer.byteLength(fullMessage, 'utf8')).padStart(5, '0');
    socket.write(header + fullMessage);
    console.log(`[asaiService] Mensaje completo enviado: '${fullMessage.substring(0, 20)}...'`);
}

/**
 * Función para registrar un servicio en el bus.
 */
function registerService(socket, serviceName) {
    console.log(`[asaiService] Registrando servicio: '${serviceName}'`);
    const registerPayload = 'sinit' + serviceName;
    const header = String(Buffer.byteLength(registerPayload, 'utf8')).padStart(5, '0');
    socket.write(header + registerPayload);
    console.log(`[asaiService] Registro enviado para '${serviceName}'.`);
}
/**
 * Lógica de negocio para interpretar la consulta.
 */
async function interpretarConsulta(query, userId) {
    const q = query.toLowerCase().trim();
    console.log(`[asaiService] Interpretando consulta para el usuario ${userId}: "${q}"`);

    

    
    const precioRegex = /entre\s+(\d+)\s+y\s+(\d+)/;
    const match = q.match(precioRegex);
    if (match) {
        const min = parseInt(match[1], 10);
        const max = parseInt(match[2], 10);

        // Busca productos en ese rango de precio
        const productos = await Product.find({
            'variaciones.precio': { $gte: min, $lte: max }
        }).limit(10);

        if (productos.length === 0) {
            return `No encontré productos entre $${min} y $${max}.`;
        }

        // Devuelve una lista simple de nombres y precios
        return productos.map(p => 
            `${p.nombre} - desde $${Math.min(...p.variaciones.map(v => v.precio))}`
        ).join('\n');
    }

    // 1. Verificación de estado de pedido (lógica existente)
    if (q.includes('pedido') || q.includes('orden')) {
        const ultimoPedido = await Order.findOne({ user_id: userId }).sort({ createdAt: -1 }).lean();
        if (!ultimoPedido) return "Aún no tienes pedidos en tu historial.";
        return `El estado de tu último pedido es: "${ultimoPedido.estado}".`;
    }

    // 2. NUEVA LÓGICA: Verificación de búsqueda de productos
    if (q.includes('buscar') || q.includes('mostrar') || q.includes('tienes') || q.includes('producto')) {
        
        // Objeto de consulta dinámico para Mongoose
        const queryObject = {};
        
        // Dividimos la consulta en palabras para analizarlas
        const palabras = q.replace(/,/g, ' ').split(' ').filter(p => p.length > 2);

        // Términos comunes de productos y marcas (puedes expandir esto)
        const tiposProducto = ['zapatilla', 'polera', 'pantalón', 'chaqueta', 'short'];
        const marcasConocidas = ['nike', 'adidas', 'puma', 'reebok', 'jordan'];
        const coloresConocidos = ['rojo', 'azul', 'negro', 'blanco', 'verde', 'amarillo', 'gris'];

        palabras.forEach(palabra => {
            // Buscar por tipo de producto
            if (tiposProducto.some(tipo => palabra.includes(tipo))) {
                queryObject.nombre = new RegExp(palabra, 'i');
            }
            // Buscar por marca
            if (marcasConocidas.includes(palabra)) {
                queryObject.marca = new RegExp(palabra, 'i');
            }
            // Buscar por color en las variaciones
            if (coloresConocidos.includes(palabra)) {
                queryObject['variaciones.color'] = new RegExp(palabra, 'i');
            }
        });

        // Si no se construyó ninguna consulta, es una pregunta genérica
        if (Object.keys(queryObject).length === 0) {
            return "Puedo buscar productos por tipo (zapatilla, polera), marca o color. ¿Qué te gustaría encontrar?";
        }

        console.log('[asaiService] Ejecutando búsqueda con el objeto:', queryObject);
        const productos = await Product.find(queryObject).limit(5).lean(); // Limitamos a 5 para no saturar

        if (productos.length === 0) {
            return "Lo siento, no encontré productos que coincidan con tu búsqueda. Intenta con otros términos.";
        }

        // Formateamos una respuesta amigable
        let respuesta = `¡Claro! Encontré esto para ti:\n`;

        productos.forEach(p => {
            respuesta += `  - ${p.nombre} marca ${p.marca} - precio $${Math.min(...p.variaciones.map(v => v.precio))}\n`;
        });

    
        return respuesta;


    }

    // 3. Respuesta por defecto (lógica existente)
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
        sendMessage(socket, responseClientId, JSON.stringify(successPayload), ASAI_SERVICE_NAME, 'OK');

    } catch (error) {
        console.error(`[asaiService Handler] Error: ${error.message}`);
        if (responseClientId && correlationId) {
            const errorPayload = { 
                status: 'error', 
                correlationId,
                message: error.message 
            };
            sendMessage(socket, responseClientId, JSON.stringify(errorPayload), ASAI_SERVICE_NAME, 'NK');
        }
    }
}

/**
 * Crea el worker que se conecta al bus y escucha peticiones.
 */
function createAsaiWorker() {
    const workerSocket = new net.Socket();
    let buffer = '';
    let isRegistered = false;

    workerSocket.connect({ host: BUS_HOST, port: BUS_PORT }, () => {
        console.log(`[Worker ${ASAI_SERVICE_NAME}] Conectado al bus.`);
        registerService(workerSocket, ASAI_SERVICE_NAME);
    });

    workerSocket.on('data', (dataChunk) => {
        console.log(`[Worker ${ASAI_SERVICE_NAME}] Datos recibidos: ${dataChunk.toString().substring(0, 50)}...`);
        buffer += dataChunk.toString('utf8');
        while (true) {
            if (buffer.length < 5) break;
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length) || buffer.length < 5 + length) break;
            
            const fullPayload = buffer.substring(5, 5 + length);
            buffer = buffer.substring(5 + length);
            const destination = fullPayload.substring(0, 5);
            console.log(`[Worker ${ASAI_SERVICE_NAME}] Mensaje para destino: '${destination}', esperado: '${ASAI_SERVICE_NAME}'`);

            // Manejar respuestas del bus para el registro
            if (!isRegistered && destination === 'sinit') {
                const response = fullPayload.substring(5);
                if (response.includes('OK' + ASAI_SERVICE_NAME)) {
                    console.log(`[Worker ${ASAI_SERVICE_NAME}] Registrado exitosamente en el bus`);
                    isRegistered = true;
                } else if (response.includes('NK')) {
                    console.error(`[Worker ${ASAI_SERVICE_NAME}] Error de registro: ${response}`);
                    setTimeout(() => {
                        workerSocket.destroy();
                    }, 5000);
                }
                continue;
            }

            // Procesar solicitudes de clientes solo si estamos registrados
            if (isRegistered && destination === ASAI_SERVICE_NAME) {
                const messageContent = fullPayload.substring(5);
                console.log(`[Worker ${ASAI_SERVICE_NAME}] Contenido del mensaje: ${messageContent.substring(0, 100)}...`);
                
                // Verificar si el mensaje es una respuesta del bus (OK/NK)
                if (messageContent === 'OK' || messageContent.startsWith('NK')) {
                    console.log(`[Worker ${ASAI_SERVICE_NAME}] Respuesta del bus ignorada: ${messageContent}`);
                    continue;
                }
                
                // Procesar solo si parece ser una solicitud de cliente (debe ser JSON)
                try {
                    JSON.parse(messageContent);
                    console.log(`[Worker ${ASAI_SERVICE_NAME}] Procesando petición de cliente...`);
                    handleAsaiRequest(workerSocket, messageContent);
                } catch (error) {
                    console.log(`[Worker ${ASAI_SERVICE_NAME}] Mensaje no es JSON válido, ignorando: ${messageContent.substring(0, 50)}...`);
                }
            } else if (isRegistered) {
                console.log(`[Worker ${ASAI_SERVICE_NAME}] Mensaje ignorado - destino no coincide: '${destination}' vs '${ASAI_SERVICE_NAME}'`);
            }
        }
    });

    workerSocket.on('close', () => {
        console.log(`[Worker ${ASAI_SERVICE_NAME}] Conexión de escucha cerrada. Reintentando en 5 segundos...`);
        isRegistered = false;
        setTimeout(createAsaiWorker, 5000);
    });

    workerSocket.on('error', (err) => {
        console.error(`[Worker ${ASAI_SERVICE_NAME}] Error de socket: ${err.message}`);
        isRegistered = false;
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