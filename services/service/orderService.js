const { connectDB } = require('../../database/db.js'); 
const net = require('net');
const orderLogic = require('../service/orderLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'order';

// Función para registrar el servicio
function registerService(socket) {
    const service = 'sinit'.padEnd(5, ' ');
    const data = SERVICE_NAME.padEnd(5, ' ');
    const payload = service + data;
    const header = String(payload.length).padStart(5, '0');
    socket.write(header + payload);
}

// Función para enviar respuestas
function sendResponse(socket, data) {
    const service = SERVICE_NAME.padEnd(5, ' ');
    
    // El payload ahora es DIRECTAMENTE los datos
    const payload = data; 
    
    // La longitud es del servicio + los datos
    const messageLength = service.length + payload.length;
    const header = String(messageLength).padStart(5, '0');
    
    const fullMessage = header + service + payload;
    console.log(`[orderService] -> Enviando respuesta: ${fullMessage}`);
    socket.write(fullMessage);
}


async function startService() {
    await connectDB();
    const serviceSocket = new net.Socket();
    
    const connectToBus = () => serviceSocket.connect(BUS_PORT, BUS_HOST);

    serviceSocket.on('connect', () => {
        console.log(`[orderService] Conectado al bus en ${BUS_PORT}.`);
        registerService(serviceSocket);
    });

    let isInitialized = false;
    serviceSocket.on('data', (data) => {
        const rawData = data.toString();
        console.log(`[orderService] <- Datos recibidos: ${rawData}`);
        
        if (!isInitialized) {
            console.log('[orderService] Registro confirmado.');
            isInitialized = true;
            return;
        }

        const message = rawData.substring(10); // Los datos empiezan después de NNNNNSSSSS

        (async () => {
            try {
                const requestData = JSON.parse(message);
                const nuevaOrden = await orderLogic.crearOrden(requestData);
                
                // Enviamos directamente el JSON de la nueva orden
                sendResponse(serviceSocket, JSON.stringify(nuevaOrden));

            } catch (error) {
                console.error("[orderService] ERROR:", error.message);
                // Para los errores, enviamos un objeto JSON con el error
                const errorResponse = { status: 'error', message: error.message };
                sendResponse(serviceSocket, JSON.stringify(errorResponse));
            }
        })();
    });

    serviceSocket.on('close', () => {
        console.log('[orderService] Conexión cerrada. Reintentando...');
        isInitialized = false;
        setTimeout(connectToBus, 5000);
    });
    
    serviceSocket.on('error', (err) => console.error('[orderService] Error:', err.message));
    
    connectToBus();
}

startService();