// catalogClient.js

const net = require('net');
const { v4: uuidv4 } = require('uuid');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const CLIENT_ID = uuidv4().substring(0, 5);
const SERVICE_TO_CALL = 'prods';

// --- ESTADO DEL CLIENTE ---
let isRegistered = false;

/**
 * Envía un mensaje formateado al bus.
 * @param {net.Socket} socket - El socket del bus.
 * @param {string} destination - El servicio de destino (5 chars).
 * @param {string} message - El contenido del mensaje.
 */
function sendMessage(socket, destination, message) {
    const payload = destination + message;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`[Cliente] Enviando a '${destination}': ${fullMessage}`);
    socket.write(fullMessage);
}

const client = new net.Socket();

function run() {
    client.connect(BUS_PORT, BUS_HOST, () => {
        console.log('[Cliente] Conectado al bus. Registrando cliente...');
        // 1. Al conectar, solo se envía la solicitud de registro.
        sendMessage(client, 'sinit', CLIENT_ID);
    });

    let buffer = '';

    client.on('data', (data) => {
        buffer += data.toString();

        while (buffer.length >= 5) {
            const messageLength = parseInt(buffer.substring(0, 5), 10);
            if (buffer.length < 5 + messageLength) {
                // Mensaje incompleto, esperar más datos.
                break;
            }

            const payload = buffer.substring(5, 5 + messageLength);
            buffer = buffer.substring(5 + messageLength);

            const sender = payload.substring(0, 5);
            const messageContent = payload.substring(5);

            // 2. Comprobar si es la confirmación de registro
            if (sender === 'sinit' && !isRegistered) {
                isRegistered = true;
                console.log('[Cliente] Registro en el bus confirmado.');
                
                // 3. Introducir un retardo antes de enviar la siguiente petición.
                // Esto le da tiempo al bus para procesar el registro y estar listo.
                console.log('\n[Cliente] Esperando 100ms para que el bus se estabilice...');
                setTimeout(() => {
                    console.log('[Cliente] Solicitando catálogo al servicio "prods"...');
                    const requestPayload = { command: 'getCatalog', clientId: CLIENT_ID };
                    sendMessage(client, SERVICE_TO_CALL, JSON.stringify(requestPayload));
                }, 100); // Retardo de 100 milisegundos

            } else {
                // 4. Si ya estamos registrados, este debe ser el mensaje con los datos del catálogo.
                const response = JSON.parse(messageContent);
                const serviceSender = response.from || sender; // Usar el nombre del servicio si está en el JSON

                console.log(`\n[Cliente] Respuesta recibida de '${serviceSender}':`);

                if (response.status === 'success') {
                    console.log('--- CATÁLOGO DE PRODUCTOS VIRTUALFIT ---');
                    if (response.data && response.data.length > 0) {
                        response.data.forEach(producto => {
                            console.log(`\nID: ${producto._id}`);
                            console.log(`  Nombre: ${producto.nombre}`);
                            console.log(`  Marca: ${producto.marca}`);
                            console.log(`  Categoría: ${producto.categoria}`);
                            if (producto.variaciones && producto.variaciones.length > 0) {
                                const precios = producto.variaciones.map(v => v.precio);
                                const minPrecio = Math.min(...precios);
                                const maxPrecio = Math.max(...precios);
                                console.log(`  Precio: $${minPrecio === maxPrecio ? minPrecio : `${minPrecio} - $${maxPrecio}`}`);
                                console.log(`  Variaciones disponibles: ${producto.variaciones.length}`);
                            } else {
                                console.log('  (Sin variaciones de precio/talla/color)');
                            }
                        });
                    } else {
                        console.log('El catálogo está vacío en este momento.');
                    }
                    console.log('\n--- FIN DEL CATÁLOGO ---');
                } else {
                    console.error(`Error del servicio: ${response.message}`);
                }

                // La interacción ha terminado, cerramos la conexión.
                client.end();
            }
        }
    });

    client.on('close', () => {
        console.log('[Cliente] Conexión cerrada.');
    });

    client.on('error', (err) => {
        console.error(`[Cliente] Error de conexión: ${err.message}`);
    });
}

run();