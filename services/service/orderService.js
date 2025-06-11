const { connectDB } = require('../../database/db.js'); 
const net = require('net');    
const orderLogic = require('../orderLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'order';

function sendMessage(socket, service, message) {
    const payload = service + message;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`[orderService] -> Enviando a '${service}': ${fullMessage.substring(0, 100)}...`);
    socket.write(fullMessage);
}

async function startService() {
    await connectDB();

    const client = new net.Socket();
    
    const connectToBus = () => {
        console.log('[orderService] Intentando conectar al bus SOA...');
        client.connect(BUS_PORT, BUS_HOST);
    };

    client.on('connect', () => {
        console.log('[orderService] Conexión con el bus establecida.');
        sendMessage(client, 'sinit', SERVICE_NAME);
    });

    client.on('data', (data) => {
        console.log(`[orderService] <- Datos crudos recibidos: ${data.toString()}`);

        const rawData = data.toString();
        const length = parseInt(rawData.substring(0, 5), 10);
        const payload = rawData.substring(5, 5 + length);
        const sender = payload.substring(0, 5); 
        const message = payload.substring(5);

        console.log(`[orderService] Mensaje procesado: de='${sender}', contenido='${message.substring(0, 100)}...'`);
        
        if (sender.trim() === 'sinit') {
            console.log('[orderService] Registro en el bus confirmado.');
            return;
        }

        (async () => {
            let requestData;
            try {
                requestData = JSON.parse(message);
                const nuevaOrden = await orderLogic.crearOrden(requestData);
                
                if (!nuevaOrden) {
                    throw new Error("La orden no pudo ser creada, la transacción falló.");
                }

                const responsePayload = { status: 'success', data: nuevaOrden };
                sendMessage(client, requestData.clientId, JSON.stringify(responsePayload));
            } catch (error) {
                const clientId = requestData ? requestData.clientId : null;
                const errorPayload = { status: 'error', message: error.message };
                console.error(`[orderService] Error al procesar la orden: ${error.message}`);
                if (clientId) {
                    sendMessage(client, clientId, JSON.stringify(errorPayload));
                }
            }
        })();
    });

    client.on('close', () => {
        console.log('[orderService] Conexión con el bus cerrada. Reintentando en 5 segundos...');
        setTimeout(connectToBus, 5000);
    });

    client.on('error', (err) => {
        console.error(`[orderService] Error de conexión: ${err.message}.`);
    });

    connectToBus();
    console.log(`🚀 Servicio '${SERVICE_NAME}' inicializado y listo.`);
}

startService();