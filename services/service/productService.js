// productService.js

// 1. Importamos la PROMESA de conexión a la base de datos.
const dbConnectionPromise = require('../../database/db.js'); 
const net = require('net');
const Product = require('../../database/models/product.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'prods';

let isRegistered = false;

function sendMessage(socket, destination, message) {
    const payload = destination + message;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`[${SERVICE_NAME}] Enviando a '${destination}': ${fullMessage.substring(0, 100)}...`);
    socket.write(fullMessage);
}

// Se envuelve toda la lógica en una función asíncrona para poder usar 'await'
async function startService() {
    try {
        // 2. Esperar a que la conexión a la base de datos se complete.
        // El código no continuará de aquí hasta que la promesa se resuelva.
        console.log(`[${SERVICE_NAME}] Esperando conexión a la base de datos...`);
        await dbConnectionPromise;
        console.log(`[${SERVICE_NAME}] Conexión a la base de datos confirmada.`);

        // 3. Ahora que la BD está lista, conectar al bus de mensajes.
        const client = new net.Socket();
        client.connect(BUS_PORT, BUS_HOST, () => {
            console.log(`[${SERVICE_NAME}] Conectado al bus. Registrando servicio...`);
            sendMessage(client, 'sinit', SERVICE_NAME);
        });

        let buffer = '';
        client.on('data', (data) => {
            buffer += data.toString();

            while (buffer.length >= 5) {
                const messageLength = parseInt(buffer.substring(0, 5), 10);
                if (buffer.length < 5 + messageLength) break;

                const payload = buffer.substring(5, 5 + messageLength);
                buffer = buffer.substring(5 + messageLength);
                
                const sender = payload.substring(0, 5);
                const messageContent = payload.substring(5);

                if (sender === 'sinit') {
                    console.log(`[${SERVICE_NAME}] Registro en el bus confirmado. ¡Servicio totalmente operativo!`);
                    isRegistered = true;
                    continue;
                }

                if (!isRegistered) {
                    console.warn(`[${SERVICE_NAME}] Recibido mensaje antes de estar listo. Descartando.`);
                    continue;
                }
                
                (async () => {
                    let request;
                    try {
                        request = JSON.parse(messageContent);
                        const { command, clientId } = request;

                        if (!command || !clientId) throw new Error('Payload inválido.');

                        console.log(`[${SERVICE_NAME}] Petición recibida para '${command}' de '${clientId}'`);
                        
                        let responsePayload;
                        if (command === 'getCatalog') {
                            const productos = await Product.find({}).lean();
                            responsePayload = { status: 'success', from: SERVICE_NAME, data: productos };
                        } else {
                            throw new Error(`Comando desconocido: ${command}`);
                        }
                        sendMessage(client, clientId, JSON.stringify(responsePayload));
                    } catch (error) {
                        const clientId = request ? request.clientId : 'unknown';
                        console.error(`[${SERVICE_NAME}] Error procesando la petición de '${clientId}':`, error.message);
                        const errorPayload = { status: 'error', from: SERVICE_NAME, message: error.message };
                        sendMessage(client, clientId, JSON.stringify(errorPayload));
                    }
                })();
            }
        });

        client.on('close', () => {
            console.log(`[${SERVICE_NAME}] Conexión con el bus cerrada.`);
            isRegistered = false;
        });

        client.on('error', (err) => {
            console.error(`[${SERVICE_NAME}] Error de conexión con el bus: ${err.message}`);
        });

    } catch (error) {
        console.error(`[${SERVICE_NAME}] FALLO CRÍTICO AL INICIAR: No se pudo conectar a la base de datos.`, error);
        process.exit(1); // El servicio no puede funcionar sin BD, así que salimos.
    }
}

// Ejecutar la función principal para iniciar el servicio.
startService();