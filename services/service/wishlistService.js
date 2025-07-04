// services/service/wishlistService.js
// VERSIÓN FINAL Y CORRECTA - Servidor Autónomo
const { connectDB } = require('../../database/db.js');
const net = require('net');
const wishlistLogic = require('./wishlistLogic.js');

const SERVICE_NAME = 'deseo';
const DIRECT_HOST = 'localhost';
const DIRECT_PORT = 5003; // Puerto directo para el cliente

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
                            result = await wishlistLogic.verListaDeDeseos(req.user_id, req.page, req.limit);
                            break;
                        case 'add':
                            result = await wishlistLogic.agregarALista(req.user_id, req.producto_id);
                            break;
                        case 'remove':
                            result = await wishlistLogic.eliminarDeLista(req.user_id, req.producto_id);
                            break;
                        default:
                            throw new Error(`Acción directa desconocida: ${req.action}`);
                    }
                    
                    const payload = JSON.stringify(result);
                    const header = String(payload.length).padStart(5, '0');
                    socket.write(header + payload);

                } catch (error) {
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

    socket.on('error', (err) => {});
    socket.on('close', () => {});
}

async function startService() {
    await connectDB();
    
    const directServer = net.createServer(handleDirectConnection);
    directServer.listen(DIRECT_PORT, DIRECT_HOST, () => {
        console.log(`[${SERVICE_NAME}Service] ✅ Escuchando conexiones DIRECTAS en ${DIRECT_HOST}:${DIRECT_PORT}`);
    });

    directServer.on('error', (err) => {
        console.error(`[${SERVICE_NAME}Service] Error en el servidor principal:`, err);
    });
}

startService();