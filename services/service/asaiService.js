// services/asaiService.js

const { connectDB } = require('../../database/db.js');
const net = require('net');
const Product = require('../../database/models/product.model');
const Order = require('../../database/models/order.model');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const ASAI_SERVICE_NAME = 'asais';

/**
 * La función principal que interpreta la consulta del usuario.
 */
async function interpretarConsulta(query, userId) {
    const q = query.toLowerCase().trim();
    console.log(`[asaiService] Interpretando consulta para el usuario ${userId}: "${q}"`);

    // --- LÓGICA DE PALABRAS CLAVE MEJORADA ---

    // 1. Búsqueda de estado de pedido
    if (q.includes('pedido') || q.includes('orden') || q.includes('compra')) {
        const ultimoPedido = await Order.findOne({ user_id: userId }).sort({ createdAt: -1 }).lean();
        if (!ultimoPedido) {
            return "Aún no tienes pedidos en tu historial. ¡Anímate a hacer tu primera compra!";
        }
        return `Tu último pedido (ID: ...${ultimoPedido._id.toString().slice(-6)}) se encuentra en estado: "${ultimoPedido.estado}". Se realizó el ${new Date(ultimoPedido.createdAt).toLocaleDateString()}.`;
    }

    // 2. Búsqueda de productos
    const palabrasBusqueda = ['buscar', 'necesito', 'quiero', 'muéstrame', 'tienes'];
    if (palabrasBusqueda.some(palabra => q.startsWith(palabra))) {
        const filtro = {};
        const keywords = ['zapatillas', 'camiseta', 'pantalon', 'chaqueta', 'short', 'poleron'];
        keywords.forEach(kw => {
            if (q.includes(kw)) filtro.nombre = new RegExp(kw, 'i');
        });
        const colores = ['rojo', 'azul', 'negro', 'blanco', 'verde', 'gris'];
        colores.forEach(color => {
            if (q.includes(color)) filtro['variaciones.color'] = new RegExp(color, 'i');
        });
        const tallas = ['xs', 's', 'm', 'l', 'xl'];
        tallas.forEach(talla => {
            if (q.includes(`talla ${talla}`)) filtro['variaciones.talla'] = talla.toUpperCase();
        });

        if (Object.keys(filtro).length === 0) {
            return "Puedo buscar productos por ti. ¿Qué te interesa? Prueba con 'buscar camiseta negra' o 'muéstrame pantalones talla M'.";
        }
        
        console.log('[asaiService] Filtro de búsqueda generado:', filtro);
        const productos = await Product.find(filtro).limit(3).lean();

        if (productos.length === 0) {
            return "Lo siento, no encontré productos que coincidan con tu búsqueda. Puedes intentar con otros términos o ser más general.";
        }

        let respuesta = "¡Claro! Encontré esto para ti:\n\n";
        productos.forEach(p => {
            respuesta += `  - Producto: ${p.nombre} (Marca: ${p.marca})\n`;
            if (p.variaciones && p.variaciones.length > 0) {
                const variacionInfo = p.variaciones.map(v => `    · Talla: ${v.talla || 'N/A'}, Color: ${v.color || 'N/A'}, Precio: $${v.precio}`).join('\n');
                respuesta += `${variacionInfo}\n\n`;
            }
        });
        return respuesta;
    }

    // 3. Saludos y Bienvenida Inicial
    const saludos = ['hola', 'buenos dias', 'buenas'];
    if (saludos.some(saludo => q.startsWith(saludo)) || q === '') {
         return "¡Hola! Soy ASAI, tu asistente de compras. ¿Qué te gustaría hacer?\n" +
                "  1. Buscar un producto (ej: 'buscar zapatillas rojas')\n" +
                "  2. Consultar mi último pedido (ej: 'estado de mi pedido')\n" +
                "  3. Pedir ayuda (ej: 'ayuda con mi talla')";
    }
    
    // 4. Respuesta por defecto si no entiende nada
    return "No estoy seguro de haber entendido. Puedes probar con una de estas opciones:\n" +
           "  - 'buscar [producto] [color]'\n" +
           "  - 'estado de mi orden'\n" +
           "  - 'ayuda'";
}

// --- Lógica del Worker y Servidor ---

async function handleAsaiRequest(socket, messageContent) {
    let responseClientId = null;
    try {
        const requestData = JSON.parse(messageContent);
        responseClientId = requestData.clientId;
        const { userId, query } = requestData;
        if (!userId || query === undefined) throw new Error('Petición a ASAI inválida.');
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
    workerSocket.on('close', () => console.log(`[Worker ${ASAI_SERVICE_NAME}] Conexión cerrada.`));
    workerSocket.on('error', (err) => console.error(`[Worker ${ASAI_SERVICE_NAME}] Error: ${err.message}`));
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