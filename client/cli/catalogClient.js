// catalogClient.js

const net = require('net');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001; // Puerto donde opera el bus
const SERVICE_TO_CALL = 'prods'; // Servicio de productos (5 caracteres)

/**
 * Construye un mensaje de solicitud formateado para el bus.
 * @param {string} serviceName - El nombre del servicio de destino (5 chars).
 * @param {string} data - El contenido del mensaje (usualmente un string JSON).
 * @returns {string} El mensaje completo listo para ser enviado.
 */
function buildRequestMessage(serviceName, data) {
    if (serviceName.length !== 5) {
        throw new Error("El nombre del servicio debe tener exactamente 5 caracteres.");
    }
    const payload = serviceName + data;
    const header = String(payload.length).padStart(5, '0');
    return header + payload;
}

const client = new net.Socket();

function run() {
    client.connect(BUS_PORT, BUS_HOST, () => {
        console.log(`[Cliente] Conectado al bus en el puerto ${BUS_PORT}.`);

        const requestData = JSON.stringify({ command: 'getCatalog' });
        const fullMessage = buildRequestMessage(SERVICE_TO_CALL, requestData);

        console.log(`[Cliente] Enviando: ${fullMessage}`);
        client.write(fullMessage);
        console.log('\n[Cliente] Solicitud de catálogo enviada. Esperando respuesta...');
    });

    let buffer = '';

    client.on('data', (data) => {
        buffer += data.toString();
        
        while (true) {
            if (buffer.length < 5) break;
            const messageLength = parseInt(buffer.substring(0, 5), 10);
            if (buffer.length < 5 + messageLength) break;

            const payload = buffer.substring(5, 5 + messageLength);
            buffer = buffer.substring(5 + messageLength); // Acortar el buffer

            // --- INICIO DE LA CORRECCIÓN LÓGICA ---

            // Extraer las partes clave del payload
            const serviceSender = payload.substring(0, 5);
            const status = payload.substring(5, 7); // Potencialmente 'OK' o 'NK'

            // Si el mensaje no viene del servicio que esperamos, O si no tiene un estado OK/NK,
            // lo consideramos un eco de nuestra propia petición y lo ignoramos.
            if (serviceSender !== SERVICE_TO_CALL || (status !== 'OK' && status !== 'NK')) {
                console.log(`[Cliente] Mensaje ignorado (probablemente un eco): ${payload.substring(0, 50)}...`);
                continue; // Saltar al siguiente mensaje en el buffer
            }

            // Si llegamos aquí, es una respuesta válida del servicio.
            const messageContent = payload.substring(7);

            console.log(`\n[Cliente] Respuesta válida recibida de '${serviceSender}' con estado '${status}'`);
            
            if (status === 'OK') {
                try {
                    const response = JSON.parse(messageContent);
                    console.log('--- CATÁLOGO DE PRODUCTOS VIRTUALFIT ---');
                    if (response.data && response.data.length > 0) {
                        response.data.forEach(producto => {
                            console.log(`- ${producto.nombre} (Marca: ${producto.marca})`);
                        });
                    } else {
                        console.log('El catálogo está vacío.');
                    }
                    console.log('\n--- FIN DEL CATÁLOGO ---');
                } catch (e) {
                    console.error(`[Cliente] Error al parsear la respuesta JSON del servicio: ${e.message}`);
                    console.error(`[Cliente] Datos recibidos: ${messageContent}`);
                }
            } else { // status === 'NK'
                console.error(`Error del servicio: ${messageContent}`);
            }
            
            // Cerrar la conexión SÓLO después de procesar una respuesta válida.
            client.end();
            // --- FIN DE LA CORRECCIÓN LÓGICA ---
        }
    });

    client.on('close', () => console.log('[Cliente] Conexión cerrada.'));
    client.on('error', (err) => console.error(`[Cliente] Error de conexión: ${err.message}`));
}

run();