// services/adminService.js

const { connectDB, mongoose } = require('../../database/db.js');
const net = require('net');
const User = require('../../database/models/user.model');
const Product = require('../../database/models/product.model'); // Asegúrate de importar el modelo
const productService = require('./productLogic.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const ADMIN_SERVICE_NAME = 'admin';

async function verificarAdmin(userId) {
    // ... (esta función es correcta y no necesita cambios)
    const user = await User.findById(userId);
    if (!user || user.rol !== 'admin') {
        throw new Error('Acceso denegado. Se requiere rol de administrador.');
    }
    console.log(`[adminService] Usuario ${userId} verificado como administrador.`);
}

/**
 * Función que crea el worker para el servicio de administración.
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
        // Registrar el servicio en el bus
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
            console.log(`[Worker ${ADMIN_SERVICE_NAME}] Mensaje para destino: '${destination}', esperado: '${ADMIN_SERVICE_NAME}'`);

            // Manejar respuestas del bus para el registro
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

            // Procesar solicitudes de clientes solo si estamos registrados
            if (isRegistered && destination === ADMIN_SERVICE_NAME) {
                const messageContent = fullPayload.substring(5);
                console.log(`[Worker ${ADMIN_SERVICE_NAME}] Contenido del mensaje: ${messageContent.substring(0, 100)}...`);
                
                // Verificar si el mensaje es una respuesta del bus (OK/NK)
                if (messageContent === 'OK' || messageContent.startsWith('NK')) {
                    console.log(`[Worker ${ADMIN_SERVICE_NAME}] Respuesta del bus ignorada: ${messageContent}`);
                    continue;
                }
                
                // Procesar solo si parece ser una solicitud de cliente (debe ser JSON)
                try {
                    JSON.parse(messageContent);
                    console.log(`[Worker ${ADMIN_SERVICE_NAME}] Procesando petición de cliente...`);
                    await handleAdminRequest(workerSocket, messageContent);
                } catch (error) {
                    console.log(`[Worker ${ADMIN_SERVICE_NAME}] Mensaje no es JSON válido, ignorando: ${messageContent.substring(0, 50)}...`);
                }
            } else if (isRegistered) {
                console.log(`[Worker ${ADMIN_SERVICE_NAME}] Mensaje ignorado - destino no coincide: '${destination}' vs '${ADMIN_SERVICE_NAME}'`);
            }
        }
    });

    workerSocket.on('close', () => {
        console.log(`[Worker ${ADMIN_SERVICE_NAME}] Conexión de escucha cerrada. Reintentando en 5 segundos...`);
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
        console.log(`[adminService Handler] Procesando petición: ${messageContent.substring(0, 100)}...`);
        const requestData = JSON.parse(messageContent);
        responseClientId = requestData.clientId;
        correlationId = requestData.correlationId;
        const { userId, operation, payload } = requestData;

        if (!responseClientId || !userId || !operation || !payload) {
            throw new Error('Petición de admin inválida: falta clientId, userId, operation o payload.');
        }

        console.log(`[adminService Handler] Usuario: ${userId}, Operación: ${operation}`);
        await verificarAdmin(userId);

        let result;

        switch (operation) {
            case 'crearProducto':
                // payload: { nombre, marca, variaciones: [{ talla, color, precio, stock }] }
                const { nombre, marca, variaciones } = payload;
                if (!nombre || !marca || !variaciones || !Array.isArray(variaciones) || variaciones.length === 0) {
                    throw new Error('Faltan datos para crear el producto: nombre, marca y al menos una variación son requeridos.');
                }
                
                // Validar cada variación
                for (const variacion of variaciones) {
                    if (!variacion.talla || !variacion.color || typeof variacion.precio !== 'number' || typeof variacion.stock !== 'number') {
                        throw new Error('Cada variación debe tener talla, color, precio y stock válidos.');
                    }
                }

                console.log(`[adminService] Creando producto:`, { nombre, marca, variaciones });
                console.log(`[adminService] Estado de conexión MongoDB:`, mongoose.connection.readyState);
                
                try {
                    const newProduct = new Product({ nombre, marca, variaciones });
                    console.log(`[adminService] Producto antes de guardar:`, newProduct);
                    const savedProduct = await newProduct.save();
                    
                    // Respuesta simplificada
                    result = {
                        _id: savedProduct._id.toString(),
                        nombre: savedProduct.nombre,
                        marca: savedProduct.marca,
                        message: 'Producto creado exitosamente'
                    };
                    
                    console.log(`[adminService] Producto creado exitosamente con ID: ${savedProduct._id}`);
                } catch (saveError) {
                    console.error(`[adminService] Error al guardar producto:`, saveError);
                    throw new Error(`Error al guardar el producto: ${saveError.message}`);
                }
                break;

            case 'obtenerProducto':
                // payload: { productoId }
                const { productoId: getProductId } = payload;
                if (!getProductId) throw new Error('ID del producto es requerido.');
                
                const producto = await Product.findById(getProductId);
                if (!producto) throw new Error('Producto no encontrado.');
                
                // Simplificar la respuesta para evitar problemas de tamaño
                result = {
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
                console.log(`[adminService] Producto ${getProductId} obtenido exitosamente.`);
                break;

            case 'editarProducto':
                // payload: { productoId, updates }
                const { productoId, updates } = payload;
                if (!productoId || !updates) throw new Error('Faltan datos para editar el producto.');
                
                console.log(`[adminService] Editando producto ${productoId} con updates:`, updates);
                
                // Obtener el producto actual para validar
                const currentProduct = await Product.findById(productoId);
                if (!currentProduct) throw new Error('Producto no encontrado.');
                
                // Separar updates del producto principal de updates de variaciones
                const productUpdates = {};
                const variacionFields = ['talla', 'color', 'precio', 'stock'];
                const hasVariacionUpdates = variacionFields.some(field => updates[field] !== undefined);
                const variacionIndex = updates.variacionIndex;
                
                // Copiar campos del producto principal (nombre, marca)
                ['nombre', 'marca'].forEach(field => {
                    if (updates[field] !== undefined) {
                        productUpdates[field] = updates[field];
                    }
                });
                
                let finalUpdates = { ...productUpdates };
                
                // Si hay actualizaciones de variaciones específicas
                if (hasVariacionUpdates) {
                    // Si se especifica un índice de variación, usar ese índice, sino usar 0
                    const targetIndex = (variacionIndex !== undefined && variacionIndex !== null) ? variacionIndex : 0;
                    
                    console.log(`[adminService] Actualizando variación en índice ${targetIndex}`);
                    
                    // Validar que el índice existe
                    if (targetIndex < 0 || targetIndex >= currentProduct.variaciones.length) {
                        throw new Error(`Índice de variación ${targetIndex} no válido. El producto tiene ${currentProduct.variaciones.length} variaciones.`);
                    }
                    
                    // Construir updates específicos para la variación
                    variacionFields.forEach(field => {
                        if (updates[field] !== undefined) {
                            finalUpdates[`variaciones.${targetIndex}.${field}`] = updates[field];
                        }
                    });
                }
                
                console.log(`[adminService] Updates finales para producto:`, finalUpdates);
                
                const updated = await Product.findByIdAndUpdate(productoId, finalUpdates, { new: true });
                if (!updated) throw new Error('Error al actualizar el producto.');
                result = updated;
                console.log(`[adminService] Producto ${productoId} actualizado exitosamente.`);
                break;

            case 'eliminarProducto':
                // payload: { productoId }
                const { productoId: deleteId } = payload;
                if (!deleteId) throw new Error('ID del producto es requerido para eliminar.');
                
                const deleted = await Product.findByIdAndDelete(deleteId);
                if (!deleted) throw new Error('Producto no encontrado.');
                
                // Respuesta simplificada
                result = { 
                    message: `Producto eliminado exitosamente.`,
                    productId: deleteId,
                    productName: deleted.nombre
                };
                console.log(`[adminService] Producto ${deleteId} eliminado exitosamente.`);
                break;

            case 'listarProductos':
                // payload: { limit?, skip?, filtros? }
                let { limit = 5, skip = 0, filtros = {} } = payload;
                
                // Forzar límite máximo para evitar mensajes muy grandes
                limit = Math.min(limit, 6);
                
                console.log(`[adminService] Listando productos con parámetros: limit=${limit}, skip=${skip}, filtros=`, filtros);
                
                try {
                    const productos = await Product.find(filtros).limit(limit).skip(skip);
                    const total = await Product.countDocuments(filtros);
                    
                    // Respuesta ultra simplificada para evitar problemas de tamaño
                    const productosMinimos = productos.map(producto => ({
                        id: producto._id.toString(),
                        nombre: producto.nombre.substring(0, 30), // Limitar nombre a 30 caracteres
                        marca: producto.marca ? producto.marca.substring(0, 20) : '', // Limitar marca a 20 caracteres
                        vars: producto.variaciones.length
                    }));
                    
                    result = { 
                        productos: productosMinimos, 
                        total, 
                        limit, 
                        skip 
                    };
                    console.log(`[adminService] Listando ${productos.length} productos de ${total} totales.`);
                    console.log(`[adminService] Productos encontrados:`, productos.map(p => ({ 
                        id: p._id, 
                        nombre: p.nombre, 
                        marca: p.marca, 
                        variaciones: p.variaciones.length 
                    })));
                } catch (listError) {
                    console.error(`[adminService] Error al listar productos:`, listError);
                    throw new Error(`Error al listar productos: ${listError.message}`);
                }
                break;

            default:
                throw new Error(`Operación '${operation}' no reconocida. Operaciones válidas: crearProducto, editarProducto, eliminarProducto, listarProductos`);
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
    console.log(`[adminService] Preparando para enviar a destino: '${destination}'`);
    console.log(`[adminService] Tamaño del mensaje JSON: ${message.length} caracteres`);
    
    // The message format should be: destination(5) + serviceName(5) + status(2) + JSON
    const destinationFormatted = destination.padEnd(5, ' '); // Destino (clientId) para routing del bus
    const serviceNameFormatted = serviceName.padEnd(5, ' '); // Nombre del servicio - 5 bytes  
    const statusField = status.padEnd(2, ' '); // Campo de status - 2 bytes
    const fullMessage = destinationFormatted + serviceNameFormatted + statusField + message;
    const header = String(Buffer.byteLength(fullMessage, 'utf8')).padStart(5, '0');
    
    console.log(`[adminService] Tamaño total del mensaje: ${fullMessage.length} caracteres, ${Buffer.byteLength(fullMessage, 'utf8')} bytes`);
    console.log(`[adminService] Header calculado: ${header}`);
    
    socket.write(header + fullMessage);
    console.log(`[adminService] Mensaje completo enviado: '${fullMessage.substring(0, 30)}...'`);
}

async function startServer() {
    await connectDB();
    console.log('Iniciando servicios de administración...');
    createAdminWorker();
}

startServer();