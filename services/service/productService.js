require('../../database/db.js'); // Conecta a la base de datos
const net = require('net');
const Product = require('../../database/models/product.model.js'); // Importa el modelo de Producto

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'prods'; // Nombre corto y único para el servicio de productos

/**
 * Envía un mensaje formateado al bus.
 * @param {net.Socket} socket - El socket del bus.
 * @param {string} service - El ID del cliente o servicio de destino (5 chars).
 * @param {string} message - El contenido del mensaje.
 */
function sendMessage(socket, service, message) {
    const payload = service + message;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`[${SERVICE_NAME}] Enviando: ${fullMessage}`);
    socket.write(fullMessage);
}

const client = new net.Socket();

client.connect(BUS_PORT, BUS_HOST, () => {
    console.log(`[${SERVICE_NAME}] Conectado al bus.`);
    // Se registra en el bus para que el bus sepa que este servicio existe.
    sendMessage(client, 'sinit', SERVICE_NAME);
});

client.on('data', (data) => {
    const rawData = data.toString();
    console.log(`[${SERVICE_NAME}] Datos crudos recibidos: ${rawData}`);

    const length = parseInt(rawData.substring(0, 5), 10);
    const payload = rawData.substring(5, 5 + length);
    const sender = payload.substring(0, 5); // Quién envió el mensaje (el clientId)
    const message = payload.substring(5);

    console.log(`[${SERVICE_NAME}] Mensaje procesado: de='${sender}', mensaje='${message}'`);

    if (sender === 'sinit') {
        console.log(`[${SERVICE_NAME}] Registro en el bus confirmado.`);
        return;
    }

    // Procesar la solicitud del cliente de forma asíncrona
    (async () => {
        let request;
        try {
            request = JSON.parse(message);
            const { command, clientId } = request;

            if (!command || !clientId) {
                throw new Error('Payload inválido, falta "command" o "clientId".');
            }

            let responsePayload;

            // Manejar diferentes comandos si el servicio crece
            switch (command) {
                case 'getCatalog':
                    console.log(`[${SERVICE_NAME}] Obteniendo catálogo de la BD...`);
                    // .lean() devuelve objetos JS planos, más rápido que documentos Mongoose completos
                    const productos = await Product.find({}).lean();
                    
                    responsePayload = {
                        status: 'success',
                        data: productos
                    };
                    break;
                
                // Aquí se podrían añadir otros casos: getProductById, filterProducts, etc.
                default:
                    throw new Error(`Comando desconocido: ${command}`);
            }

            // Enviar la respuesta al cliente original
            sendMessage(client, clientId, JSON.stringify(responsePayload));

        } catch (error) {
            console.error(`[${SERVICE_NAME}] Error al procesar la solicitud: ${error.message}`);
            // Es crucial tener el clientId para poder responder el error.
            const clientId = request ? request.clientId : sender;
            const errorPayload = {
                status: 'error',
                message: error.message
            };
            sendMessage(client, clientId, JSON.stringify(errorPayload));
        }
    })();
});

client.on('close', () => {
    console.log(`[${SERVICE_NAME}] Conexión con el bus cerrada.`);
});

client.on('error', (err) => {
    console.error(`[${SERVICE_NAME}] Error de conexión: ${err.message}`);
});