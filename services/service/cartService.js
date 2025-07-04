// services/service/cartService.js
// VERSIÓN FINAL Y CORRECTA - Servidor Autónomo
const { connectDB } = require('../../database/db.js');
const net = require('net');
const cartLogic = require('./cartLogic.js');

const SERVICE_NAME = 'carro';
const DIRECT_HOST = 'localhost';
const DIRECT_PORT = 5004; // Puerto directo para el cliente

/**
 * Maneja una conexión directa de un cliente.
 * @param {net.Socket} socket El socket del cliente conectado.
 */
async function handleDirectConnection(socket) {
    const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    
    let buffer = '';
    socket.setEncoding('utf8');

    socket.on('data', (data) => {
        buffer += data;
        while (true) {
            if (buffer.length < 5) break; 
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length)) { buffer = ''; socket.end(); break; }
            const totalMessageLength = 5 + length;
            if (buffer.length < totalMessageLength) break;
            
            const messageToProcess = buffer.substring(5, totalMessageLength);
            buffer = buffer.substring(totalMessageLength);

            (async () => {
                try {
                    const req = JSON.parse(messageToProcess);
                    let result;
                    switch (req.action) {
                        case 'view':
                            result = await cartLogic.verCarrito(req.user_id);
                            break;
                        case 'add':
                            result = await cartLogic.agregarAlCarrito(req.user_id, req.producto_id, req.cantidad);
                            break;
                        case 'update':
                            result = await cartLogic.modificarCantidad(req.user_id, req.producto_variacion_id, req.nueva_cantidad);
                            break;
                        case 'remove':
                            result = await cartLogic.eliminarDelCarrito(req.user_id, req.producto_variacion_id);
                            break;
                        default:
                            throw new Error(`Acción directa desconocida: ${req.action}`);
                    }
                    
                    const payload = JSON.stringify(result);
                    const header = String(payload.length).padStart(5, '0');
                    socket.write(header + payload);
                    console.log(`[${SERVICE_NAME}Service] ✅ Respuesta enviada exitosamente`);

                } catch (error) {
                    console.error(`[${SERVICE_NAME}Service] ❌ Error procesando solicitud:`, error.message);
                    const errorResponse = { status: 'error', message: error.message };
                    const payload = JSON.stringify(errorResponse);
                    const header = String(payload.length).padStart(5, '0');
                    socket.write(header + payload);
                } finally {
                    socket.end();
                }
            })();
        }
    });

    socket.on('error', (err) => {
        console.error(`[${SERVICE_NAME}Service] Error en socket:`, err.message);
    });
    
    socket.on('close', () => {
        console.log(`[${SERVICE_NAME}Service] Cliente desconectado: ${clientAddress}`);
    });
}

async function startService() {
    await connectDB();
    console.log(`[${SERVICE_NAME}Service] Conectado a la base de datos.`);
    
    const directServer = net.createServer(handleDirectConnection);
    directServer.listen(DIRECT_PORT, DIRECT_HOST, () => {
        console.log(`[${SERVICE_NAME}Service] ✅ Escuchando conexiones DIRECTAS en ${DIRECT_HOST}:${DIRECT_PORT}`);
    });

    directServer.on('error', (err) => {
        console.error(`[${SERVICE_NAME}Service] Error en el servidor principal:`, err.message);
    });
}

startService();