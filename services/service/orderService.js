const { connectDB, mongoose } = require('../../database/db.js'); 
const net = require('net');    
const orderLogic = require('../orderLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'order';

function sendMessage(socket, service, message) {
    const payload = service + message;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`[orderService] Enviando a '${service}': ${fullMessage.substring(0, 150)}...`);
    socket.write(fullMessage);
}

async function startService() {
    // 1. Conectar a la DB PRIMERO
    await connectDB();

    // 2. Conectar al bus DESPUÉS
    const client = new net.Socket();

    client.connect(BUS_PORT, BUS_HOST, () => {
        console.log('[orderService] Conectado al bus.');
        sendMessage(client, 'sinit', SERVICE_NAME);
    });

    client.on('data', (data) => {
        const rawData = data.toString();
        console.log(`[orderService] Datos crudos recibidos: ${rawData}`);

        const length = parseInt(rawData.substring(0, 5), 10);
        const payload = rawData.substring(5, 5 + length);
        const sender = payload.substring(0, 5); 
        const message = payload.substring(5);

        console.log(`[orderService] Mensaje procesado: de='${sender}', mensaje='${message}'`);
        
        if (sender === 'sinit') {
            console.log('[orderService] Registro en el bus confirmado.');
            return;
        }

        (async () => {
            let requestData;
            try {
                requestData = JSON.parse(message);
                const nuevaOrden = await orderLogic.crearOrden(requestData);
                const responsePayload = { status: 'success', data: nuevaOrden };
                sendMessage(client, requestData.clientId, JSON.stringify(responsePayload));
            } catch (error) {
                const clientId = requestData ? requestData.clientId : null;
                const errorPayload = { status: 'error', message: error.message };
                console.error(`[orderService] Error al procesar: ${error.message}`);
                if (clientId) {
                    sendMessage(client, clientId, JSON.stringify(errorPayload));
                }
            }
        })();
    });

    client.on('close', () => console.log('[orderService] Conexión con el bus cerrada.'));
    client.on('error', (err) => console.error(`[orderService] Error de conexión: ${err.message}`));

    console.log(`🚀 Servicio '${SERVICE_NAME}' listo y esperando solicitudes.`);
}

startService();