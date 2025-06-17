// services/catalogService.js
// VERSIÓN FINAL Y CORRECTA - Servidor Autónomo
const { connectDB } = require('../../database/db.js');
const net = require('net');
const catalogLogic = require('./catalogLogic.js');

const SERVICE_NAME = 'catal';
const DIRECT_HOST = 'localhost';
const DIRECT_PORT = 5002; // Puerto directo para el cliente

/**
 * Maneja una conexión directa de un cliente.
 * @param {net.Socket} socket El socket del cliente conectado.
 */
async function handleDirectConnection(socket) {
    const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[${SERVICE_NAME}Service] Cliente conectado DIRECTAMENTE (${clientAddress})`);
    
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
            
            console.log(`[${SERVICE_NAME}Service] <- Petición directa recibida: ${messageToProcess}`);

            (async () => {
                try {
                    const req = JSON.parse(messageToProcess);
                    let result;
                    switch (req.action) {
                        case 'list_all':
                            result = await catalogLogic.listarTodosLosProductos(req.page, req.limit);
                            break;
                        case 'search':
                            result = await catalogLogic.buscarProductos(req.term);
                            break;
                        case 'filter':
                            result = await catalogLogic.filtrarProductos(req.criteria);
                            break;
                        default:
                            throw new Error(`Acción directa desconocida: ${req.action}`);
                    }
                    
                    const payload = JSON.stringify(result);
                    const header = String(payload.length).padStart(5, '0');
                    socket.write(header + payload);

                } catch (error) {
                    console.error(`[${SERVICE_NAME}Service] ERROR en conexión directa:`, error.message);
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

    socket.on('error', (err) => console.log(`Error en socket directo (${clientAddress}): ${err.message}`));
    socket.on('close', () => console.log(`Conexión directa cerrada (${clientAddress}).`));
}

async function startService() {
    await connectDB();
    
    const directServer = net.createServer(handleDirectConnection);
    directServer.listen(DIRECT_PORT, DIRECT_HOST, () => {
        console.log(`[${SERVICE_NAME}Service] Escuchando conexiones DIRECTAS en ${DIRECT_HOST}:${DIRECT_PORT}`);
    });

    directServer.on('error', (err) => {
        console.error(`[${SERVICE_NAME}Service] Error en el servidor principal:`, err);
    });
}

startService();