// services/catalogService.js
const { connectDB } = require('../../database/db.js');
const net = require('net');
const catalogLogic = require('../service/catalogLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'catal'; // Nombre del servicio (5 caracteres)

// Función para registrar el servicio en el bus
function registerService(socket) {
    const service = 'sinit'.padEnd(5, ' ');
    const data = SERVICE_NAME.padEnd(5, ' ');
    const payload = service + data;
    const header = String(payload.length).padStart(5, '0');
    socket.write(header + payload);
    console.log(`[${SERVICE_NAME}Service] -> Registrando servicio...`);
}

// Función para enviar respuestas al bus
function sendResponse(socket, data) {
    const service = SERVICE_NAME.padEnd(5, ' ');
    const payload = data;
    const messageLength = service.length + payload.length;
    const header = String(messageLength).padStart(5, '0');
    const fullMessage = header + service + payload;
    console.log(`[${SERVICE_NAME}Service] -> Enviando respuesta: ${fullMessage.substring(0, 150)}...`);
    socket.write(fullMessage);
}

// Función principal del servicio
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
        const message = rawData.substring(10); // Los datos empiezan después de NNNNNSSSSS

        (async () => {
            try {
                const requestData = JSON.parse(message);
                let result;

                // Decidimos qué acción tomar basándonos en el payload
                switch (requestData.action) {
                    case 'list_all':
                        result = await catalogLogic.listarTodosLosProductos();
                        break;
                    case 'search':
                        result = await catalogLogic.buscarProductos(requestData.term);
                        break;
                    case 'filter':
                        result = await catalogLogic.filtrarProductos(requestData.criteria);
                        break;
                    default:
                        throw new Error(`Acción desconocida: ${requestData.action}`);
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
        console.log(`[${SERVICE_NAME}Service] Conexión cerrada. Reintentando en 5 segundos...`);
        isInitialized = false;
        setTimeout(connectToBus, 5000);
    });

    serviceSocket.on('error', (err) => console.error(`[${SERVICE_NAME}Service] Error de conexión:`, err.message));

    connectToBus();
}

startService();