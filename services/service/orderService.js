const { connectDB } = require('../../database/db.js'); 
const net = require('net');
const { crearOrden, buscarOrdenesPorUsuario } = require('../service/orderLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'order';

function header(n) { return String(n).padStart(5, '0'); }

function sendResponse(socket, data) {
    const service = SERVICE_NAME.padEnd(5, ' ');
    const payload = JSON.stringify(data);
    // La longitud en el header debe ser la del payload + la del nombre del servicio
    const fullMessage = header(service.length + payload.length) + service + payload;
    console.log(`[orderService] -> Enviando respuesta: ${fullMessage.substring(0, 150)}...`);
    socket.write(fullMessage);
}

function sendError(socket, errorMessage) {
    const service = SERVICE_NAME.padEnd(5, ' ');
    const payload = JSON.stringify({ error: errorMessage });
    const fullMessage = header(service.length + payload.length) + service + payload;
    console.log(`[orderService] -> Enviando ERROR: ${fullMessage}`);
    socket.write(fullMessage);
}

async function startService() {
    await connectDB();
    const serviceSocket = new net.Socket();
    const connectToBus = () => serviceSocket.connect(BUS_PORT, BUS_HOST);

    serviceSocket.on('connect', () => {
        console.log(`[orderService] Conectado al bus en ${BUS_PORT}.`);
        const registerMessage = header(10) + 'sinit'.padEnd(5) + SERVICE_NAME.padEnd(5);
        serviceSocket.write(registerMessage);
    });

    let buffer = '';
    serviceSocket.on('data', (data) => {
        buffer += data.toString();
        while (true) {
            if (buffer.length < 5) break;
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length) || buffer.length < 5 + length) break;
            
            const messageToProcess = buffer.substring(0, 5 + length);
            buffer = buffer.substring(5 + length);

            const serviceName = messageToProcess.substring(5, 10).trim();
            const statusCheck = messageToProcess.substring(10, 12);

            if (statusCheck === 'OK' || statusCheck === 'NK') {
                console.log(`[orderService] Ignorando mensaje de bus: ${messageToProcess}`);
                continue;
            }

            console.log(`[orderService] Solicitud de cliente recibida: ${messageToProcess}`);
            const messageContent = messageToProcess.substring(10);
            (async () => {
                try {
                    const requestData = JSON.parse(messageContent);
                    let resultado;

                    // --- LÓGICA DE ENRUTAMIENTO DE ACCIONES ---
                    if (requestData.action === 'create_order') {
                        resultado = await crearOrden(requestData.payload);
                    } else if (requestData.action === 'find_orders') {
                        resultado = await buscarOrdenesPorUsuario(requestData.payload.email);
                    } else {
                        throw new Error("Acción no reconocida.");
                    }
                    sendResponse(serviceSocket, resultado);
                } catch (error) {
                    console.error("[orderService] ERROR:", error.message);
                    sendError(serviceSocket, error.message);
                }
            })();
        }
    });

    serviceSocket.on('close', () => { console.log('Conexión cerrada. Reintentando...'); buffer = ''; setTimeout(connectToBus, 5000); });
    serviceSocket.on('error', (err) => console.error('Error de socket:', err.message));
    connectToBus();
}

startService();