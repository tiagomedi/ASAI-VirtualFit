// services/service/pagosService.js

const { connectDB, mongoose } = require('../../database/db.js');
const net = require('net');
const { procesarPago } = require('../service/pagosLogic.js'); 

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'pagos';

function header(n) { return String(n).padStart(5, '0'); }

async function startService() {
    await connectDB();
    const serviceSocket = new net.Socket();
    const connectToBus = () => serviceSocket.connect(BUS_PORT, BUS_HOST);

    serviceSocket.on('connect', () => {
        console.log(`[pagosService] Conectado al bus en ${BUS_PORT}.`);
        const registerMessage = header(10) + 'sinit'.padEnd(5) + SERVICE_NAME.padEnd(5);
        serviceSocket.write(registerMessage);
    });

    let buffer = '';
    serviceSocket.on('data', (data) => {
        buffer += data.toString();
        while (true) {
            if (buffer.length < 5) break;
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length) || buffer.length < 5 + length) {
                // Buffer posiblemente incompleto, esperamos más datos.
                // Si el length es erróneo, podría causar un bucle, pero es la lógica del golden code.
                // En un sistema en producción se podría añadir un límite al buffer para evitar DoS.
                break; 
            }
            const messageToProcess = buffer.substring(0, 5 + length);
            buffer = buffer.substring(5 + length);
            const statusCheck = messageToProcess.substring(10, 12);
            if (statusCheck === 'OK' || statusCheck === 'NK') continue;
            
            console.log(`[pagosService] Solicitud de cliente recibida: ${messageToProcess}`);
            const messageContent = messageToProcess.substring(10);
            
            (async () => {
                const session = await mongoose.connection.startSession();
                try {
                    const requestData = JSON.parse(messageContent);
                    let resultado;

                    if (requestData.action === 'procesar_pago') {
                        session.startTransaction();
                        // <-- MODIFICADO: Pasamos el 'serviceSocket' a la lógica de negocio
                        resultado = await procesarPago(requestData.payload, session, serviceSocket);
                        await session.commitTransaction();
                    } else {
                        throw new Error(`Acción no reconocida: '${requestData.action}'`);
                    }
                    
                    const resPayload = JSON.stringify(resultado);
                    const serviceHeader = SERVICE_NAME.padEnd(5, ' ');
                    const fullMessage = header(serviceHeader.length + resPayload.length) + serviceHeader + resPayload;
                    console.log(`[pagosService] -> Enviando respuesta al cliente original: ${fullMessage.substring(0, 150)}...`);
                    serviceSocket.write(fullMessage);

                } catch (error) {
                    console.error("[pagosService] ERROR:", error.message);
                    if (session.inTransaction()) await session.abortTransaction();
                    
                    const errPayload = JSON.stringify({ error: error.message });
                    const serviceHeader = SERVICE_NAME.padEnd(5, ' ');
                    const fullMessage = header(serviceHeader.length + errPayload.length) + serviceHeader + errPayload;
                    serviceSocket.write(fullMessage);
                } finally {
                    await session.endSession();
                }
            })();
        }
    });

    serviceSocket.on('close', () => { console.log('[pagosService] Conexión cerrada. Reintentando...'); buffer = ''; setTimeout(connectToBus, 5000); });
    serviceSocket.on('error', (err) => console.error('[pagosService] Error de socket:', err.message));
    
    connectToBus();
}

startService();