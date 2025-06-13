const { connectDB } = require('../../database/db.js');
const net = require('net');
const reseñaLogic = require('../service/reseñaLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'rview'; 

// Función para registrar el servicio
function registerService(socket) {
    const service = 'sinit'.padEnd(5, ' ');
    const data = SERVICE_NAME.padEnd(5, ' ');
    const payload = service + data;
    const header = String(payload.length).padStart(5, '0');
    socket.write(header + payload);
    console.log(`[${SERVICE_NAME}Service] -> Enviando registro: ${header}${payload}`);
}

// Función para enviar respuestas
function sendResponse(socket, data) {
    const service = SERVICE_NAME.padEnd(5, ' ');

    // El payload es directamente los datos (JSON string)
    const payload = data;

    // La longitud es del servicio + los datos
    const messageLength = service.length + payload.length;
    const header = String(messageLength).padStart(5, '0');

    const fullMessage = header + service + payload;
    console.log(`[${SERVICE_NAME}Service] -> Enviando respuesta: ${fullMessage.substring(0, 150)}...`); // Loguea parcial si es muy largo
    socket.write(fullMessage);
}

async function startService() {
    // Conectar a la DB antes de conectar al bus
    await connectDB();
    console.log(`[${SERVICE_NAME}Service] Conectado a la base de datos.`);

    const serviceSocket = new net.Socket();

    const connectToBus = () => serviceSocket.connect(BUS_PORT, BUS_HOST);

    serviceSocket.on('connect', () => {
        console.log(`[${SERVICE_NAME}Service] Conectado al bus en ${BUS_PORT}.`);
        registerService(serviceSocket);
    });

    let isInitialized = false;
    serviceSocket.on('data', (data) => {
        const rawData = data.toString();
        console.log(`[${SERVICE_NAME}Service] <- Datos recibidos: ${rawData.substring(0, 150)}...`); // Loguea parcial

        // La primera respuesta del bus después del registro es una confirmación simple.
        if (!isInitialized) {
            console.log(`[${SERVICE_NAME}Service] Registro confirmado.`);
            isInitialized = true;
            return;
        }

        const messagePayload = rawData.substring(10);

        (async () => {
            try {
                const requestData = JSON.parse(messagePayload);
                console.log(`[${SERVICE_NAME}Service] Recibida solicitud:`, requestData);

                // Llamar a la lógica de negocio
                const result = await reseñaLogic.procesarReseña(requestData);

                // Enviar la respuesta de éxito (objeto JSON)
                sendResponse(serviceSocket, JSON.stringify(result));

            } catch (error) {
                console.error(`[${SERVICE_NAME}Service] ERROR procesando solicitud:`, error.message);
                // Para los errores, enviamos un objeto JSON con el error
                const errorResponse = { status: 'error', message: error.message };
                sendResponse(serviceSocket, JSON.stringify(errorResponse));
            }
        })();
    });

    serviceSocket.on('close', () => {
        console.log(`[${SERVICE_NAME}Service] Conexión cerrada. Reintentando en 5s...`);
        isInitialized = false; 
        setTimeout(connectToBus, 5000);
    });

    serviceSocket.on('error', (err) => {
        console.error(`[${SERVICE_NAME}Service] Error de conexión o socket:`, err.message);
    });

    // Iniciar la conexión al bus
    connectToBus();
}

startService();