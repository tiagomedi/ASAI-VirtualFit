const net = require('net');
const { v4: uuidv4 } = require('uuid');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
// ID único para este cliente, para que el servicio sepa a quién responder
const CLIENT_ID = uuidv4().substring(0, 5);
const SERVICE_TO_CALL = 'prods'; // El servicio de productos/catálogo

/**
 * Envía un mensaje formateado al bus.
 * @param {net.Socket} socket - El socket del bus.
 * @param {string} service - El servicio de destino (5 chars).
 * @param {string} message - El contenido del mensaje.
 */
function sendMessage(socket, service, message) {
    const payload = service + message;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`[Cliente] Enviando: ${fullMessage}`);
    socket.write(fullMessage);
}

const client = new net.Socket();

function run() {
    client.connect(BUS_PORT, BUS_HOST, () => {
        console.log('[Cliente] Conectado al bus.');

        // 1. Se registra en el bus para recibir respuestas directas
        sendMessage(client, 'sinit', CLIENT_ID);

        // 2. Prepara la solicitud para el servicio de productos
        const requestPayload = {
            command: 'getCatalog', // El comando que el servicio de productos entenderá
            clientId: CLIENT_ID    // Incluye su ID para que el servicio sepa a quién responder
        };

        // 3. Envía la solicitud al servicio de productos
        sendMessage(client, SERVICE_TO_CALL, JSON.stringify(requestPayload));
        console.log('\n[Cliente] Solicitud de catálogo enviada. Esperando respuesta...');
    });

    client.on('data', (data) => {
        const rawData = data.toString();
        const length = parseInt(rawData.substring(0, 5), 10);
        const payload = rawData.substring(5, 5 + length);
        const sender = payload.substring(0, 5);
        const message = payload.substring(5);

        // Confirma el registro en el bus
        if (sender === 'sinit') {
            console.log('[Cliente] Registro en el bus confirmado.');
            return;
        }

        // Procesa la respuesta del servicio
        console.log(`\n[Cliente] Respuesta recibida de '${sender}':`);
        const response = JSON.parse(message);

        if (response.status === 'success') {
            console.log('--- CATÁLOGO DE PRODUCTOS VIRTUALFIT ---');
            if (response.data && response.data.length > 0) {
                response.data.forEach(producto => {
                    console.log(`\nID: ${producto._id}`);
                    console.log(`  Nombre: ${producto.nombre}`);
                    console.log(`  Marca: ${producto.marca}`);
                    console.log(`  Categoría: ${producto.categoria}`);
                    // Muestra un resumen de las variaciones
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

        client.end(); // Cierra la conexión tras recibir la respuesta
    });

    client.on('close', () => {
        console.log('[Cliente] Conexión cerrada.');
    });

    client.on('error', (err) => {
        console.error(`[Cliente] Error de conexión: ${err.message}`);
    });
}

run();