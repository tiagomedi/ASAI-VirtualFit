// services/service/pointService.js

const { connectDB, mongoose } = require('../../database/db.js');
const net = require('net');
const { agregarPuntos } = require('../service/pointLogic.js'); // Importa la nueva lógica

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'point'; // Nombre de nuestro nuevo servicio

// Función helper para crear el header de longitud, idéntica al Golden Code.
function header(n) { return String(n).padStart(5, '0'); }

async function startService() {
    await connectDB();
    const serviceSocket = new net.Socket();
    const connectToBus = () => serviceSocket.connect(BUS_PORT, BUS_HOST);

    serviceSocket.on('connect', () => {
        console.log(`[pointService] Conectado al bus en ${BUS_PORT}.`);
        // Mensaje de registro para el servicio 'sinit'
        const registerMessage = header(10) + 'sinit'.padEnd(5) + SERVICE_NAME.padEnd(5);
        serviceSocket.write(registerMessage);
        console.log(`[pointService] Enviando mensaje de registro: ${registerMessage}`);
    });

    let buffer = '';
    serviceSocket.on('data', (data) => {
        buffer += data.toString();
        while (true) {
            if (buffer.length < 5) break;
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length) || buffer.length < 5 + length) {
                break; 
            }
            
            const messageToProcess = buffer.substring(0, 5 + length);
            buffer = buffer.substring(5 + length);
            
            // Ignorar respuestas OK/NK del bus (por ejemplo, del registro sinit)
            const statusCheck = messageToProcess.substring(10, 12);
            if (statusCheck === 'OK' || statusCheck === 'NK') continue;
            
            console.log(`[pointService] Solicitud de cliente recibida: ${messageToProcess}`);
            const messageContent = messageToProcess.substring(10);
            
            (async () => {
                try {
                    const requestData = JSON.parse(messageContent);
                    let resultado;

                    // Enrutamiento de la acción
                    if (requestData.action === 'add_points') {
                        // No se necesita una transacción de Mongoose aquí, ya que la lógica solo
                        // actualiza un único documento, lo cual es una operación atómica.
                        resultado = await agregarPuntos(requestData.payload);
                    } else {
                        throw new Error(`Acción no reconocida en servicio 'point': '${requestData.action}'`);
                    }
                    
                    const resPayload = JSON.stringify(resultado);
                    const serviceHeader = SERVICE_NAME.padEnd(5, ' ');
                    const fullMessage = header(serviceHeader.length + resPayload.length) + serviceHeader + resPayload;
                    console.log(`[pointService] -> Enviando respuesta: ${fullMessage.substring(0, 150)}...`);
                    serviceSocket.write(fullMessage);

                } catch (error) {
                    console.error("[pointService] ERROR:", error.message);
                    
                    const errPayload = JSON.stringify({ error: error.message });
                    const serviceHeader = SERVICE_NAME.padEnd(5, ' ');
                    // El bus añadirá 'NK' al principio, nosotros solo enviamos el payload de error.
                    const fullMessage = header(serviceHeader.length + errPayload.length) + serviceHeader + errPayload;
                    serviceSocket.write(fullMessage);
                }
            })();
        }
    });

    serviceSocket.on('close', () => { 
        console.log('[pointService] Conexión cerrada. Reintentando en 5 segundos...'); 
        buffer = ''; 
        setTimeout(connectToBus, 5000); 
    });
    serviceSocket.on('error', (err) => console.error('[pointService] Error de socket:', err.message));
    
    connectToBus();
}

startService();