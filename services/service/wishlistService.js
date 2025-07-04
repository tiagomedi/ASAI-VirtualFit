// services/service/wishlistService.js

const { connectDB } = require('../../database/db.js');
const net = require('net');
const wishlistLogic = require('./wishlistLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'deseo';

// --- Funciones de Comunicación Profesionales y Estandarizadas ---
function header(n) { return String(n).padStart(5, '0'); }

function registerService(socket) {
    const registerMessage = header(10) + 'sinit'.padEnd(5) + SERVICE_NAME.padEnd(5);
    socket.write(registerMessage);
}

function sendResponse(socket, data) {
    const resPayload = JSON.stringify(data);
    const serviceHeader = SERVICE_NAME.padEnd(5, ' ');
    const fullMessage = header(serviceHeader.length + resPayload.length) + serviceHeader + resPayload;
    socket.write(fullMessage);
}

function sendError(socket, errorMessage) {
    const errPayload = JSON.stringify({ error: errorMessage });
    const serviceHeader = SERVICE_NAME.padEnd(5, ' ');
    const fullMessage = header(serviceHeader.length + errPayload.length) + serviceHeader + errPayload;
    socket.write(fullMessage);
}
// --- Función Principal del Servicio (ya robusta) ---
async function startService() {
    await connectDB();
    const serviceSocket = new net.Socket();
    const connectToBus = () => serviceSocket.connect(BUS_PORT, BUS_HOST);

    serviceSocket.on('connect', () => {
        registerService(serviceSocket);
    });

    let buffer = '';
    serviceSocket.on('data', (data) => {
        buffer += data.toString();
        while (true) {
            if (buffer.length < 5) break;
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length)) { buffer = ''; break; }
            const totalMessageLength = 5 + length;
            if (buffer.length < totalMessageLength) break;
            
            const messageToProcess = buffer.substring(0, totalMessageLength);
            buffer = buffer.substring(totalMessageLength);
            // Ignorar respuestas OK/NK del bus (confirmaciones de registro)
            const statusCheck = messageToProcess.substring(10, 12);
            if (statusCheck === 'OK' || statusCheck === 'NK') {
                continue;
            }

            // Verificar si es un mensaje válido de solicitud
            if (messageToProcess.length < 15) {
                continue;
            }

            const messageContent = messageToProcess.substring(10);
            (async () => {
                try {
                    const req = JSON.parse(messageContent);
                    let result;
                    switch (req.action) {
                        case 'view':
                            result = await wishlistLogic.verListaDeDeseos(req.user_id, req.page, req.limit);
                            break;
                        case 'add':
                            result = await wishlistLogic.agregarALista(req.user_id, req.producto_id);
                            break;
                        case 'remove':
                            result = await wishlistLogic.eliminarDeLista(req.user_id, req.producto_id);
                            break;
                        default:
                            throw new Error(`Acción desconocida en wishlistService: ${req.action}`);
                    }
                    sendResponse(serviceSocket, result);
                } catch (error) {
                    sendError(serviceSocket, error.message);
                }
            })();
        }
    });

    serviceSocket.on('close', () => { buffer = ''; setTimeout(connectToBus, 5000); });
    serviceSocket.on('error', (err) => {});

    connectToBus();
}

startService();