// services/adminService.js

const { connectDB, mongoose } = require('../../database/db.js');
const net = require('net');
const User = require('../../database/models/user.model');
const Product = require('../../database/models/product.model');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const ADMIN_SERVICE_NAME = 'admin';
const ADMIN_DIRECT_PORT = 5005; // Puerto directo para el admin

async function verificarAdmin(userId) {
    const user = await User.findById(userId);
    if (!user || user.rol !== 'admin') {
        throw new Error('Acceso denegado. Se requiere rol de administrador.');
    }
    console.log(`[adminService] Usuario ${userId} verificado como administrador.`);
}

/**
 * Maneja una conexión directa de un cliente admin.
 */
async function handleDirectConnection(socket) {
    const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[adminService] Cliente conectado DIRECTAMENTE (${clientAddress})`);
    
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
            
            console.log(`[adminService] <- Petición directa recibida: ${messageToProcess.substring(0, 100)}...`);

            (async () => {
                try {
                    const req = JSON.parse(messageToProcess);
                    const { userId, operation, payload: requestPayload } = req;

                    if (!userId || !operation || !payload) {
                        throw new Error('Petición de admin inválida: falta userId, operation o payload.');
                    }

                    await verificarAdmin(userId);
                    let result;

                    switch (operation) {
                        case 'crearProducto':
                            result = await handleCrearProducto(payload);
                            break;
                        case 'obtenerProducto':
                            result = await handleObtenerProducto(payload);
                            break;
                        case 'editarProducto':
                            result = await handleEditarProducto(payload);
                            break;
                        case 'eliminarProducto':
                            result = await handleEliminarProducto(payload);
                            break;
                        case 'listarProductos':
                            result = await handleListarProductos(payload);
                            break;
                        default:
                            throw new Error(`Operación '${operation}' no reconocida.`);
                    }
                    
                    const responsePayload = { status: 'success', data: result };
                    const payload = JSON.stringify(responsePayload);
                    const header = String(payload.length).padStart(5, '0');
                    socket.write(header + payload);

                } catch (error) {
                    console.error(`[adminService] ERROR en conexión directa:`, error.message);
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

    socket.on('error', (err) => console.log(`Error en socket directo admin (${clientAddress}): ${err.message}`));
    socket.on('close', () => console.log(`Conexión directa admin cerrada (${clientAddress}).`));
}

async function handleCrearProducto(payload) {
    const { nombre, marca, variaciones } = payload;
    if (!nombre || !marca || !variaciones || !Array.isArray(variaciones) || variaciones.length === 0) {
        throw new Error('Faltan datos para crear el producto: nombre, marca y al menos una variación son requeridos.');
    }
    
    for (const variacion of variaciones) {
        if (!variacion.talla || !variacion.color || typeof variacion.precio !== 'number' || typeof variacion.stock !== 'number') {
            throw new Error('Cada variación debe tener talla, color, precio y stock válidos.');
        }
    }

    const newProduct = new Product({ nombre, marca, variaciones });
    const savedProduct = await newProduct.save();
    
    return {
        _id: savedProduct._id.toString(),
        nombre: savedProduct.nombre,
        marca: savedProduct.marca,
        message: 'Producto creado exitosamente'
    };
}

async function handleObtenerProducto(payload) {
    const { productoId } = payload;
    if (!productoId) throw new Error('ID del producto es requerido.');
    
    const producto = await Product.findById(productoId);
    if (!producto) throw new Error('Producto no encontrado.');
    
    return {
        _id: producto._id.toString(),
        nombre: producto.nombre,
        marca: producto.marca,
        categoria: producto.categoria,
        variaciones: producto.variaciones.map(v => ({
            _id: v._id.toString(),
            talla: v.talla,
            color: v.color,
            precio: v.precio,
            stock: v.stock
        }))
    };
}

async function handleEditarProducto(payload) {
    const { productoId, updates } = payload;
    if (!productoId || !updates) throw new Error('Faltan datos para editar el producto.');
    
    const currentProduct = await Product.findById(productoId);
    if (!currentProduct) throw new Error('Producto no encontrado.');
    
    const productUpdates = {};
    const variacionFields = ['talla', 'color', 'precio', 'stock'];
    const hasVariacionUpdates = variacionFields.some(field => updates[field] !== undefined);
    const variacionIndex = updates.variacionIndex;
    
    ['nombre', 'marca'].forEach(field => {
        if (updates[field] !== undefined) {
            productUpdates[field] = updates[field];
        }
    });
    
    let finalUpdates = { ...productUpdates };
    
    if (hasVariacionUpdates) {
        const targetIndex = (variacionIndex !== undefined && variacionIndex !== null) ? variacionIndex : 0;
        
        if (targetIndex < 0 || targetIndex >= currentProduct.variaciones.length) {
            throw new Error(`Índice de variación ${targetIndex} no válido. El producto tiene ${currentProduct.variaciones.length} variaciones.`);
        }
        
        variacionFields.forEach(field => {
            if (updates[field] !== undefined) {
                finalUpdates[`variaciones.${targetIndex}.${field}`] = updates[field];
            }
        });
    }
    
    const updated = await Product.findByIdAndUpdate(productoId, finalUpdates, { new: true });
    if (!updated) throw new Error('Error al actualizar el producto.');
    
    return updated;
}

async function handleEliminarProducto(payload) {
    const { productoId } = payload;
    if (!productoId) throw new Error('ID del producto es requerido para eliminar.');
    
    const deleted = await Product.findByIdAndDelete(productoId);
    if (!deleted) throw new Error('Producto no encontrado.');
    
    return { 
        message: 'Producto eliminado exitosamente.',
        productId: productoId,
        productName: deleted.nombre
    };
}

async function handleListarProductos(payload) {
    const { limit = 10, skip = 0, filtros = {} } = payload;
    console.log(`[adminService] Listando productos con parámetros: limit=${limit}, skip=${skip}`);
    
    const productos = await Product.find(filtros).limit(limit).skip(skip);
    const total = await Product.countDocuments(filtros);
    
    // Respuesta simple y compatible
    const productosFormateados = productos.map(producto => ({
        id: producto._id.toString(),
        nombre: producto.nombre,
        marca: producto.marca,
        vars: producto.variaciones.length
    }));
    
    console.log(`[adminService] Retornando ${productos.length} productos de ${total} totales.`);
    
    return { 
        productos: productosFormateados, 
        total, 
        limit, 
        skip 
    };
}

/**
 * Función que crea el worker para el servicio de administración (bus).
 */
async function createAdminWorker() {
    const workerSocket = new net.Socket();
    let buffer = '';
    let isRegistered = false;

    const connectionOptions = {
        host: BUS_HOST,
        port: BUS_PORT
    };

    workerSocket.connect(connectionOptions, () => {
        console.log(`[Worker ${ADMIN_SERVICE_NAME}] Conectado al bus.`);
        const registerPayload = 'sinit' + ADMIN_SERVICE_NAME;
        const header = String(Buffer.byteLength(registerPayload, 'utf8')).padStart(5, '0');
        workerSocket.write(header + registerPayload);
        console.log(`[adminService] Registro enviado para '${ADMIN_SERVICE_NAME}'.`);
    });

    workerSocket.on('data', async (dataChunk) => {
        console.log(`[Worker ${ADMIN_SERVICE_NAME}] Datos recibidos: ${dataChunk.toString().substring(0, 50)}...`);
        buffer += dataChunk.toString();
        while (true) {
            if (buffer.length < 5) break;
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length) || buffer.length < 5 + length) break;
            
            const fullPayload = buffer.substring(5, 5 + length);
            buffer = buffer.substring(5 + length);
            const destination = fullPayload.substring(0, 5);

            if (!isRegistered && destination === 'sinit') {
                const response = fullPayload.substring(5);
                if (response.includes('OK' + ADMIN_SERVICE_NAME)) {
                    console.log(`[Worker ${ADMIN_SERVICE_NAME}] Registrado exitosamente en el bus`);
                    isRegistered = true;
                } else if (response.includes('NK')) {
                    console.error(`[Worker ${ADMIN_SERVICE_NAME}] Error de registro: ${response}`);
                    setTimeout(() => {
                        workerSocket.destroy();
                    }, 5000);
                }
                continue;
            }

            if (isRegistered && destination === ADMIN_SERVICE_NAME) {
                const messageContent = fullPayload.substring(5);
                
                if (messageContent === 'OK' || messageContent.startsWith('NK')) {
                    console.log(`[Worker ${ADMIN_SERVICE_NAME}] Respuesta del bus ignorada: ${messageContent}`);
                    continue;
                }
                
                try {
                    JSON.parse(messageContent);
                    console.log(`[Worker ${ADMIN_SERVICE_NAME}] Procesando petición de cliente...`);
                    await handleAdminRequest(workerSocket, messageContent);
                } catch (error) {
                    console.log(`[Worker ${ADMIN_SERVICE_NAME}] Mensaje no es JSON válido, ignorando`);
                }
            }
        }
    });

    workerSocket.on('close', () => {
        console.log(`[Worker ${ADMIN_SERVICE_NAME}] Conexión cerrada. Reintentando en 5 segundos...`);
        isRegistered = false;
        setTimeout(createAdminWorker, 5000);
    });

    workerSocket.on('error', (err) => {
        console.error(`[Worker ${ADMIN_SERVICE_NAME}] Error de socket: ${err.message}`);
        isRegistered = false;
    });
}

async function handleAdminRequest(socket, messageContent) {
    let responseClientId = null;
    let correlationId = null;
    try {
        const requestData = JSON.parse(messageContent);
        responseClientId = requestData.clientId;
        correlationId = requestData.correlationId;
        const { userId, operation, payload } = requestData;

        await verificarAdmin(userId);
        let result;

        switch (operation) {
            case 'crearProducto':
                result = await handleCrearProducto(payload);
                break;
            case 'obtenerProducto':
                result = await handleObtenerProducto(payload);
                break;
            case 'editarProducto':
                result = await handleEditarProducto(payload);
                break;
            case 'eliminarProducto':
                result = await handleEliminarProducto(payload);
                break;
            case 'listarProductos':
                result = await handleListarProductos(payload);
                break;
            default:
                throw new Error(`Operación '${operation}' no reconocida.`);
        }

        const successPayload = { status: 'success', correlationId, data: result };
        sendMessage(socket, responseClientId, JSON.stringify(successPayload), ADMIN_SERVICE_NAME, 'OK');

    } catch (error) {
        console.error(`[adminService Handler] Error: ${error.message}`);
        if (responseClientId) {
            const errorPayload = { status: 'error', correlationId, message: error.message };
            sendMessage(socket, responseClientId, JSON.stringify(errorPayload), ADMIN_SERVICE_NAME, 'NK');
        }
    }
}

function sendMessage(socket, destination, message, serviceName = ADMIN_SERVICE_NAME, status = 'OK') {
    const destinationFormatted = destination.padEnd(5, ' ');
    const serviceNameFormatted = serviceName.padEnd(5, ' ');
    const statusField = status.padEnd(2, ' ');
    const fullMessage = destinationFormatted + serviceNameFormatted + statusField + message;
    const header = String(Buffer.byteLength(fullMessage, 'utf8')).padStart(5, '0');
    socket.write(header + fullMessage);
}

async function startServer() {
    await connectDB();
    console.log('Iniciando servicios de administración...');
    
    // Servidor directo como catalogService
    const directServer = net.createServer(handleDirectConnection);
    directServer.listen(ADMIN_DIRECT_PORT, BUS_HOST, () => {
        console.log(`[adminService] Escuchando conexiones DIRECTAS en ${BUS_HOST}:${ADMIN_DIRECT_PORT}`);
    });

    directServer.on('error', (err) => {
        console.error(`[adminService] Error en el servidor directo:`, err);
    });
    
    // También mantener conexión al bus
    createAdminWorker();
}

startServer();