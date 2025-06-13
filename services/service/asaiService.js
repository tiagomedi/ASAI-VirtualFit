// services/asaiService.js

const { connectDB } = require('../../database/db.js');
const net = require('net');
const Product = require('../../database/models/product.model'); // Para buscar productos
const Order = require('../../database/models/order.model');   // Para buscar pedidos

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const ASAI_SERVICE_NAME = 'asais';

/**
 * La función principal que interpreta la consulta del usuario.
 * Usa lógica simple de palabras clave.
 * @param {string} query - La consulta en texto plano del usuario.
 * @param {string} userId - El ID del usuario que pregunta.
 * @returns {Promise<string>} Una respuesta en texto plano para el usuario.
 */
async function interpretarConsulta(query, userId) {
    const q = query.toLowerCase();
    console.log(`[asaiService] Interpretando consulta para el usuario ${userId}: "${q}"`);

    // --- LÓGICA DE PALABRAS CLAVE ---

    // 1. Búsqueda de estado de pedido
    if (q.includes('pedido') || q.includes('orden')) {
        const ultimoPedido = await Order.findOne({ user_id: userId }).sort({ createdAt: -1 });
        if (!ultimoPedido) {
            return "No he encontrado pedidos recientes en tu historial.";
        }
        return `El estado de tu último pedido (ID: ...${ultimoPedido._id.toString().slice(-6)}) es: ${ultimoPedido.estado}. Se pagó un total de ${ultimoPedido.total_pago}.`;
    }

    // 2. Búsqueda de productos (simple)
    if (q.includes('buscar') || q.includes('necesito') || q.includes('quiero')) {
        // Creamos un filtro de búsqueda para MongoDB
        const filtro = {};
        
        // Extraer palabras clave de productos (zapatillas, camiseta, etc.)
        const keywords = ['zapatillas', 'camiseta', 'pantalon', 'chaqueta'];
        keywords.forEach(kw => {
            if (q.includes(kw)) {
                filtro.nombre = new RegExp(kw, 'i'); // Búsqueda insensible a mayúsculas
            }
        });
        
        // Extraer colores
        const colores = ['rojo', 'azul', 'negro', 'blanco'];
        colores.forEach(color => {
            if (q.includes(color)) {
                filtro['variaciones.color'] = new RegExp(color, 'i');
            }
        });

        // Extraer tallas
        const tallas = ['xs', 's', 'm', 'l', 'xl'];
        tallas.forEach(talla => {
            if (q.includes(`talla ${talla}`)) {
                filtro['variaciones.talla'] = talla.toUpperCase();
            }
        });

        if (Object.keys(filtro).length === 0) {
            return "No entendí qué producto buscas. Prueba con 'buscar zapatillas rojas talla M'.";
        }
        
        console.log('[asaiService] Filtro de búsqueda generado:', filtro);
        const productos = await Product.find(filtro).limit(3);

        if (productos.length === 0) {
            return "No encontré productos que coincidan con tu búsqueda. Intenta con otros términos.";
        }

        let respuesta = "Encontré esto para ti:\n";
        productos.forEach(p => {
            respuesta += `- ${p.nombre} (Marca: ${p.marca})\n`;
        });
        return respuesta;
    }

    // 3. Ayuda o recomendación
    if (q.includes('ayuda') || q.includes('recomienda') || q.includes('talla')) {
        return "¡Claro! Puedo ayudarte a encontrar lo que buscas. ¿Qué tipo de prenda o para qué actividad la necesitas? Luego podemos filtrar por talla, color o marca.";
    }

    // 4. Saludo o respuesta por defecto
    return "Hola, soy ASAI. ¿En qué puedo ayudarte? Puedes pedirme que busque productos (ej: 'buscar camiseta azul') o que te informe sobre tu último pedido.";
}


// --- Lógica del Worker (muy similar a los otros servicios) ---

async function createAsaiWorker() {
    const workerSocket = new net.Socket();
    let buffer = '';

    workerSocket.connect({ host: BUS_HOST, port: BUS_PORT }, () => {
        console.log(`[Worker ${ASAI_SERVICE_NAME}] Conectado al bus.`);
        sendMessage(workerSocket, 'sinit', ASAI_SERVICE_NAME);
    });

    workerSocket.on('data', async (dataChunk) => {
        buffer += dataChunk.toString();
        while (true) {
            if (buffer.length < 5) break;
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length) || buffer.length < 5 + length) break;
            
            const fullPayload = buffer.substring(5, 5 + length);
            buffer = buffer.substring(5 + length);

            const destination = fullPayload.substring(0, 5);
            if (destination !== ASAI_SERVICE_NAME) continue;
            
            await handleAsaiRequest(workerSocket, fullPayload.substring(5));
        }
    });
    // ... (listeners 'close' y 'error')
}

async function handleAsaiRequest(socket, messageContent) {
    let responseClientId = null;
    try {
        const requestData = JSON.parse(messageContent);
        responseClientId = requestData.clientId;
        const { userId, query } = requestData;

        if (!userId || !query) throw new Error('Petición a ASAI inválida.');

        // La lógica principal del asistente
        const asaiResponseText = await interpretarConsulta(query, userId);
        
        const successPayload = { status: 'success', data: { respuesta: asaiResponseText } };
        sendMessage(socket, responseClientId, JSON.stringify(successPayload));

    } catch (error) {
        console.error(`[asaiService Handler] Error: ${error.message}`);
        if (responseClientId) {
            const errorPayload = { status: 'error', message: error.message };
            sendMessage(socket, responseClientId, JSON.stringify(errorPayload));
        }
    }
}

function sendMessage(socket, destination, message) {
    const payload = destination + message;
    const header = String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0');
    socket.write(header + payload);
}

async function startServer() {
    await connectDB();
    console.log('Iniciando servicio de asistente ASAI...');
    createAsaiWorker();
}

startServer();