// client/cli/usuarioCLI.js

const net = require('net');
const { v4: uuidv4 } = require('uuid');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const CLIENT_ID = uuidv4().substring(0, 5);

// --- Gestor Central de Respuestas y Socket Único ---
const pendingResponses = new Map();
const clientSocket = new net.Socket();
let buffer = '';

/**
 * Formatea y envía un mensaje a través del socket principal.
 */
function sendMessage(service, message) {
    const payload = service + message;
    const header = String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0');
    try {
        const parsed = JSON.parse(message);
        const target = parsed.correo || parsed.operation || parsed.query || 'N/A';
        console.log(`[Cliente] Enviando a '${service}': ${target}`);
    } catch (e) {
        console.log(`[Cliente] Enviando mensaje de sistema...`);
    }
    clientSocket.write(header + payload);
}

/**
 * Envía una petición y devuelve una promesa que espera la respuesta correspondiente.
 */
function sendRequestAndWait(service, requestData, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const correlationId = uuidv4();
        const timeout = setTimeout(() => {
            pendingResponses.delete(correlationId);
            reject(new Error(`Timeout esperando respuesta para la operación.`));
        }, timeoutMs);

        // Guardamos las funciones para resolver/rechazar la promesa, asociadas a su ID
        pendingResponses.set(correlationId, (error, response) => {
            clearTimeout(timeout);
            pendingResponses.delete(correlationId);
            if (error) {
                reject(error);
            } else if (response.status === 'error') {
                reject(new Error(response.message || 'Error desconocido del servicio'));
            } else {
                resolve(response);
            }
        });

        // Enviamos la petición usando el socket único, añadiendo los IDs
        sendMessage(service, JSON.stringify({ ...requestData, correlationId, clientId: CLIENT_ID }));
    });
}


// --- Funciones de Flujo de la Aplicación ---

async function handleAuthentication(inquirer, actionType) {
    const isLogin = actionType === 'login';
    const serviceToCall = isLogin ? 'logns' : 'auths';
    const promptTitle = isLogin ? '--- Iniciar Sesión ---' : '--- Registrar Nuevo Usuario ---';
    
    console.log(`\n${promptTitle}`);
    const credentials = await inquirer.prompt([
        { type: 'input', name: 'correo', message: 'Correo electrónico:' },
        { type: 'password', name: 'password', message: 'Contraseña:' }
    ]);
    return sendRequestAndWait(serviceToCall, credentials);
}

async function handleAdminTasks(inquirer, adminUser) {
    while (true) {
        const { adminAction } = await inquirer.prompt([{
            type: 'list',
            name: 'adminAction',
            message: 'Menú de Administrador:',
            choices: ['Crear Producto', 'Editar Producto', 'Eliminar Producto', 'Salir'],
        }]);
        if (adminAction === 'Salir') break;

        let operation = '';
        let payload = {};
        switch (adminAction) {
            case 'Crear Producto':
                operation = 'crearProducto';
                const pDetails = await inquirer.prompt([{ name: 'nombre', message: 'Nombre:' }, { name: 'marca', message: 'Marca:' }, { name: 'talla', message: 'Talla:' }, { name: 'color', message: 'Color:' }, { name: 'precio', message: 'Precio:', type: 'number' }, { name: 'stock', message: 'Stock:', type: 'number' }]);
                payload = { nombre: pDetails.nombre, marca: pDetails.marca, variaciones: [{ talla: pDetails.talla, color: pDetails.color, precio: pDetails.precio, stock: pDetails.stock }] };
                break;
            case 'Editar Producto':
                operation = 'editarProducto';
                const { productoId: editId } = await inquirer.prompt([{ name: 'productoId', message: 'ID del producto a editar:' }]);
                const { nuevoNombre } = await inquirer.prompt([{ name: 'nuevoNombre', message: 'Nuevo nombre:' }]);
                payload = { productoId: editId, updates: { nombre: nuevoNombre } };
                break;
            case 'Eliminar Producto':
                operation = 'eliminarProducto';
                const { productoId: deleteId } = await inquirer.prompt([{ name: 'productoId', message: 'ID del producto a eliminar:' }]);
                payload = { productoId: deleteId };
                break;
        }
        
        try {
            const adminResponse = await sendRequestAndWait('admin', { userId: adminUser._id, operation, payload });
            console.log('\n✅ Operación de Admin exitosa:', JSON.stringify(adminResponse.data, null, 2));
        } catch (e) {
            console.error(`\n❌ Error del servicio de Admin: ${e.message}`);
        }
    }
}

async function handleAsaiChat(inquirer, user) {
    console.log('\n--- Charlando con ASAI (escribe "salir" para terminar) ---');
    try {
        const welcomeResponse = await sendRequestAndWait('asais', { userId: user._id, query: '' });
        console.log(`ASAI: ${welcomeResponse.data.respuesta}`);

        while (true) {
            const { userQuery } = await inquirer.prompt([{ name: 'userQuery', message: `${user.correo}:` }]);
            if (userQuery.toLowerCase().trim() === 'salir') {
                console.log('ASAI: ¡Hasta pronto!');
                break;
            }
            const asaiResponse = await sendRequestAndWait('asais', { userId: user._id, query: userQuery });
            console.log(`ASAI: ${asaiResponse.data.respuesta}`);
        }
    } catch (e) {
        console.error(`\n❌ Error en la sesión con ASAI: ${e.message}`);
    }
}


// --- Función Principal ---

async function run() {
    const inquirer = (await import('inquirer')).default;
    
    // El listener de datos se activa para CUALQUIER mensaje que llegue al socket principal
    clientSocket.on('data', (dataChunk) => {
        buffer += dataChunk.toString('utf8');
        while (buffer.length >= 5) {
            const length = parseInt(buffer.substring(0, 5), 10);
            if (buffer.length < 5 + length) break;
            const fullPayload = buffer.substring(5, 5 + length);
            buffer = buffer.substring(5 + length);
            const destinationId = fullPayload.substring(0, 5);
            if (destinationId === CLIENT_ID) {
                try {
                    const response = JSON.parse(fullPayload.substring(5));
                    // Buscamos la promesa pendiente por su ID de correlación
                    if (pendingResponses.has(response.correlationId)) {
                        const handler = pendingResponses.get(response.correlationId);
                        handler(null, response); // Llamamos al handler con (error=null, respuesta)
                    }
                } catch (e) { 
                    console.error("Error procesando la respuesta del bus:", e); 
                }
            }
        }
    });

    clientSocket.on('error', (err) => {
        console.error(`[Cliente] Error de conexión: ${err.message}`);
        // Rechazar todas las promesas pendientes en caso de error de socket
        for (const [correlationId, handler] of pendingResponses.entries()) {
            handler(err, null);
            pendingResponses.delete(correlationId);
        }
    });

    try {
        await new Promise((resolve, reject) => {
            clientSocket.connect({ host: BUS_HOST, port: BUS_PORT }, resolve);
            clientSocket.once('error', reject);
        });
        console.log(`[Cliente] Conectado al bus. Mi ID es: ${CLIENT_ID}`);
        sendMessage('sinit', CLIENT_ID);

        let loggedInUser = null;
        while (!loggedInUser) {
            const { initialAction } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'initialAction',
                    message: 'Bienvenido a VirtualFit. ¿Qué deseas hacer?',
                    choices: ['Iniciar sesión', 'Registrar un nuevo usuario', 'Salir'],
                }
            ]);
            if (initialAction === 'Salir') return;

            try {
                const response = await handleAuthentication(inquirer, initialAction === 'Iniciar sesión' ? 'login' : 'register');
                loggedInUser = response.data;
            } catch (error) {
                console.error(`\n❌ Error: ${error.message}`);
                const { retry } = await inquirer.prompt([{ type: 'confirm', name: 'retry', message: '¿Volver al menú principal?', default: true }]);
                if (!retry) return;
            }
        }
        
        console.log(`\n✅ ¡Acción exitosa! Bienvenido, ${loggedInUser.correo}. (Rol: ${loggedInUser.rol})`);
        
        if (loggedInUser.rol === 'admin') {
            await handleAdminTasks(inquirer, loggedInUser);
        } else {
            const { clientAction } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'clientAction',
                    message: 'Menú de Cliente:',
                    choices: ['Charlar con ASAI', 'Salir'],
                },
            ]);
            if (clientAction === 'Charlar con ASAI') {
                await handleAsaiChat(inquirer, loggedInUser);
            }
        }
    } catch (error) {
        console.error('\n❌ Error crítico en el flujo principal:', error.message);
    } finally {
        if (clientSocket) clientSocket.destroy();
        console.log('\n[Cliente] Proceso finalizado.');
    }
}

run();