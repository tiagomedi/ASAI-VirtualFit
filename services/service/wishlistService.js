// services/wishlistService.js
const { connectDB } = require('../../database/db.js');
const net = require('net');
const wishlistLogic = require('../service/wishlistLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'deseo'; // Nombre del servicio (5 caracteres)

function registerService(socket) {
    const service = 'sinit'.padEnd(5, ' ');
    const data = SERVICE_NAME.padEnd(5, ' ');
    const payload = service + data;
    const header = String(payload.length).padStart(5, '0');
    socket.write(header + payload);
    console.log(`[${SERVICE_NAME}Service] -> Registrando servicio...`);
}

function sendResponse(socket, data) {
    const service = SERVICE_NAME.padEnd(5, ' ');
    const payload = data;
    const messageLength = service.length + payload.length;
    const header = String(messageLength).padStart(5, '0');
    const fullMessage = header + service + payload;
    console.log(`[${SERVICE_NAME}Service] -> Enviando respuesta: ${fullMessage.substring(0, 150)}...`);
    socket.write(fullMessage);
}

async function startService() {
    await connectDB();
    const serviceSocket = new net.Socket();

    const connectToBus = () => serviceSocket.connect(BUS_PORT, BUS_HOST);

    serviceSocket.on('connect', () => {
        console.log(`[${SERVICE_NAME}Service] Conectado al bus en ${BUS_PORT}.`);
        registerService(serviceSocket);
    });

    let isInitialized = false;
    serviceSocket.on('data', (data) => {
        const rawData = data.toString();
        
        if (!isInitialized && rawData.includes('sinitOK')) {
            console.log(`[${SERVICE_NAME}Service] Registro en el bus confirmado.`);
            isInitialized = true;
            return;
        }

        console.log(`[${SERVICE_NAME}Service] <- Datos recibidos: ${rawData}`);
        const message = rawData.substring(10);

        (async () => {
            try {
                const req = JSON.parse(message);
                let result;

                switch (req.action) {
                    case 'view':
                        result = await wishlistLogic.verListaDeDeseos(req.user_id);
                        break;
                    case 'add':
                        result = await wishlistLogic.agregarALista(req.user_id, req.producto_id);
                        break;
                    case 'remove':
                        result = await wishlistLogic.eliminarDeLista(req.user_id, req.producto_id);
                        break;
                    default:
                        throw new Error(`Acción desconocida: ${req.action}`);
                }
                
                sendResponse(serviceSocket, JSON.stringify(result));

            } catch (error) {
                console.error(`[${SERVICE_NAME}Service] ERROR procesando solicitud:`, error.message);
                const errorResponse = { status: 'error', message: error.message };
                sendResponse(serviceSocket, JSON.stringify(errorResponse));
            }
        })();
    });

    serviceSocket.on('close', () => {
        console.log(`[${SERVICE_NAME}Service] Conexión cerrada. Reintentando...`);
        isInitialized = false;
        setTimeout(connectToBus, 5000);
    });

    serviceSocket.on('error', (err) => console.error(`[${SERVICE_NAME}Service] Error de conexión:`, err.message));

    connectToBus();
}

startService();