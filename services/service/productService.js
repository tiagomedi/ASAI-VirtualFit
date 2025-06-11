// productService.js

require('../../database/db.js');
const net = require('net');
const Product = require('../../database/models/product.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001; // Puerto corregido
const SERVICE_NAME = 'prods'; // El nombre de este servicio (5 caracteres)

/**
 * Construye un mensaje de respuesta formateado para el bus.
 * @param {string} serviceName - El nombre de este servicio (5 chars).
 * @param {'OK'|'NK'} status - El estado de la operación.
 * @param {string} data - El contenido de la respuesta (usualmente un string JSON).
 * @returns {string} El mensaje completo listo para ser enviado.
 */
function buildResponseMessage(serviceName, status, data) {
    if (serviceName.length !== 5) {
        throw new Error("El nombre del servicio debe tener exactamente 5 caracteres.");
    }
    const payload = serviceName + status + data;
    const header = String(payload.length).padStart(5, '0');
    return header + payload;
}

const server = net.createServer((socket) => {
    console.log(`[${SERVICE_NAME}] Cliente conectado al servicio desde el bus.`);
    
    let buffer = ''; // Buffer por cada conexión del bus

    socket.on('data', (data) => {
        buffer += data.toString();

        while (true) {
            if (buffer.length < 5) break;

            const messageLength = parseInt(buffer.substring(0, 5), 10);
            if (buffer.length < 5 + messageLength) break;

            const payload = buffer.substring(5, 5 + messageLength);
            buffer = buffer.substring(5 + messageLength);

            const requestedService = payload.substring(0, 5);
            const messageContent = payload.substring(5);

            // Ignorar si el mensaje no es para este servicio
            if (requestedService !== SERVICE_NAME) {
                console.warn(`[${SERVICE_NAME}] Mensaje recibido para otro servicio ('${requestedService}'). Ignorando.`);
                continue;
            }

            console.log(`[${SERVICE_NAME}] Petición recibida: ${messageContent}`);

            // Procesar la solicitud de forma asíncrona
            (async () => {
                try {
                    const request = JSON.parse(messageContent);
                    if (request.command === 'getCatalog') {
                        const productos = await Product.find({}).lean();
                        const responseData = JSON.stringify({ data: productos });
                        
                        // Construir y enviar respuesta de éxito
                        const fullResponse = buildResponseMessage(SERVICE_NAME, 'OK', responseData);
                        console.log(`[${SERVICE_NAME}] Enviando respuesta OK: ${fullResponse.substring(0,100)}...`);
                        socket.write(fullResponse);
                    } else {
                        throw new Error(`Comando desconocido: ${request.command}`);
                    }
                } catch (error) {
                    // Construir y enviar respuesta de error
                    const errorMsg = JSON.stringify({ message: error.message });
                    const fullResponse = buildResponseMessage(SERVICE_NAME, 'NK', errorMsg);
                    console.error(`[${SERVICE_NAME}] Enviando respuesta NK: ${fullResponse}`);
                    socket.write(fullResponse);
                }
            })();
        }
    });

    socket.on('close', () => {
        console.log(`[${SERVICE_NAME}] Conexión del bus cerrada.`);
    });
    
    socket.on('error', (err) => {
        console.error(`[${SERVICE_NAME}] Error en el socket del bus: ${err.message}`);
    });
});

// El servicio ahora se conecta directamente al bus.
// A diferencia del modelo anterior, no necesita ser un "cliente" del bus,
// sino que el bus se conecta a él. Por lo tanto, el servicio debe escuchar.
// EDIT: Re-evaluando. El bus docker es una caja negra. Es más probable que
// TODOS los componentes (clientes y servicios) sean clientes del bus.
// Vamos a mantener la estructura de cliente.

// -- CÓDIGO FINAL CORRECTO (TODOS SON CLIENTES DEL BUS) --
const busClient = new net.Socket();

busClient.connect(BUS_PORT, BUS_HOST, () => {
    console.log(`[${SERVICE_NAME}] Servicio conectado al bus en el puerto ${BUS_PORT}. Esperando peticiones.`);
    // No hay registro, solo se queda a la escucha de datos.
});

let serviceBuffer = ''; // Buffer para el cliente del servicio
busClient.on('data', (data) => {
    serviceBuffer += data.toString();

    while (true) {
        if (serviceBuffer.length < 5) break;
        const messageLength = parseInt(serviceBuffer.substring(0, 5), 10);
        if (serviceBuffer.length < 5 + messageLength) break;

        const payload = serviceBuffer.substring(5, 5 + messageLength);
        serviceBuffer = serviceBuffer.substring(5 + messageLength);

        const requestedService = payload.substring(0, 5);
        const messageContent = payload.substring(5);

        if (requestedService !== SERVICE_NAME) {
            return; // Ignorar silenciosamente mensajes para otros servicios
        }

        console.log(`[${SERVICE_NAME}] Petición recibida: ${messageContent}`);

        (async () => {
            try {
                const request = JSON.parse(messageContent);
                if (request.command === 'getCatalog') {
                    const productos = await Product.find({}).lean();
                    const responseData = JSON.stringify({ data: productos });
                    const fullResponse = buildResponseMessage(SERVICE_NAME, 'OK', responseData);
                    console.log(`[${SERVICE_NAME}] Enviando respuesta OK...`);
                    busClient.write(fullResponse);
                } else { throw new Error(`Comando desconocido: ${request.command}`); }
            } catch (error) {
                const errorMsg = JSON.stringify({ message: error.message });
                const fullResponse = buildResponseMessage(SERVICE_NAME, 'NK', errorMsg);
                console.error(`[${SERVICE_NAME}] Enviando respuesta NK: ${fullResponse}`);
                busClient.write(fullResponse);
            }
        })();
    }
});

busClient.on('close', () => console.log(`[${SERVICE_NAME}] Conexión con el bus cerrada.`));
busClient.on('error', (err) => console.error(`[${SERVICE_NAME}] Error de conexión con el bus: ${err.message}`));