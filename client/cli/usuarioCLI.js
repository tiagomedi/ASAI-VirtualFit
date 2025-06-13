// client/cli/log-usuario.js

const net = require('net');
const { v4: uuidv4 } = require('uuid');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const CLIENT_ID = uuidv4().substring(0, 5);

// --- Funciones Helper ---

/**
 * Formatea y envía un mensaje al bus a través de un socket.
 * @param {net.Socket} socket - El socket para enviar el mensaje.
 * @param {string} service - El nombre del servicio destino (5 caracteres).
 * @param {string} message - El contenido del mensaje (usualmente un JSON stringificado).
 */
function sendMessage(socket, service, message) {
    const payload = service + message;
    const header = String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0');
    const fullMessage = header + payload;
    
    try {
        const parsed = JSON.parse(message);
        const target = parsed.correo || parsed.operation || parsed.query || 'N/A';
        console.log(`[Cliente] Enviando a '${service}': ${target}`);
    } catch (e) {
        console.log(`[Cliente] Enviando mensaje de sistema...`);
    }
    
    socket.write(fullMessage);
}

/**
 * Devuelve una Promesa que espera una respuesta dirigida a nuestro CLIENT_ID.
 * Maneja fragmentación TCP, ecos del bus y timeouts.
 * @param {number} timeoutMs - Milisegundos de espera antes de fallar.
 * @returns {Promise<object>} La respuesta JSON parseada del servicio.
 */
function waitForResponse(timeoutMs) {
    return new Promise((resolve, reject) => {
        const subSocket = new net.Socket();
        let buffer = '';
        let timeoutId = null;

        const dataListener = (dataChunk) => {
            buffer += dataChunk.toString('utf8');
            processBuffer();
        };

        const errorListener = (err) => cleanup(err);
        const closeListener = () => cleanup(new Error('Socket de escucha cerrado inesperadamente.'));

        function processBuffer() {
            while (buffer.length >= 5) {
                const header = buffer.substring(0, 5);
                const expectedLength = parseInt(header, 10);
                
                if (isNaN(expectedLength)) {
                    return cleanup(new Error(`Buffer corrupto, cabecera inválida: "${header}"`));
                }

                const totalMessageLength = 5 + expectedLength;
                if (buffer.length < totalMessageLength) {
                    return; // Mensaje incompleto, esperar más datos.
                }

                const fullPayload = buffer.substring(5, totalMessageLength);
                buffer = buffer.substring(totalMessageLength);
                
                const destinationId = fullPayload.substring(0, 5);
                
                if (destinationId === CLIENT_ID) {
                    try {
                        const messageContent = fullPayload.substring(5);
                        cleanup(null, JSON.parse(messageContent));
                    } catch (e) {
                        cleanup(new Error(`Error al parsear JSON: ${e.message}. Recibido: ${fullPayload.substring(5)}`));
                    }
                    return; // Terminamos.
                } else {
                    // Ignorar ecos u otros mensajes y seguir procesando el buffer.
                }
            }
        }

        function cleanup(error = null, value = null) {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
                subSocket.destroy();
                if (error) reject(error);
                else resolve(value);
            }
        }
        
        subSocket.on('data', dataListener);
        subSocket.on('error', errorListener);
        subSocket.on('close', closeListener);
        
        subSocket.connect({ host: BUS_HOST, port: BUS_PORT }, () => {
            sendMessage(subSocket, 'sinit', CLIENT_ID);
        });

        timeoutId = setTimeout(() => {
            cleanup(new Error('Timeout: No se recibió respuesta del servicio a tiempo.'));
        }, timeoutMs);
    });
}

/**
 * Envía una petición única al bus y cierra la conexión.
 * @param {string} service - El nombre del servicio destino.
 * @param {object} payload - El objeto de datos a enviar.
 */
async function sendRequest(service, payload) {
    const pubSocket = new net.Socket();
    // Envolvemos la conexión en una promesa para asegurar que se complete antes de enviar.
    await new Promise(resolve => pubSocket.connect({ host: BUS_HOST, port: BUS_PORT }, resolve));
    sendMessage(pubSocket, service, JSON.stringify(payload));
    pubSocket.end();
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
    
    const requestPayload = { ...credentials, clientId: CLIENT_ID };
    
    // Escuchar la respuesta y enviar la petición simultáneamente
    const responsePromise = waitForResponse(10000);
    await sendRequest(serviceToCall, requestPayload);
    
    return responsePromise;
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
        
        const adminRequestPayload = { clientId: CLIENT_ID, userId: adminUser._id, operation, payload };
        try {
            const responsePromise = waitForResponse(10000);
            await sendRequest('admin', adminRequestPayload);
            const adminResponse = await responsePromise;
            
            if (adminResponse.status === 'success') {
                console.log('\n✅ Operación de Admin exitosa:', JSON.stringify(adminResponse.data, null, 2));
            } else {
                console.error(`\n❌ Error del servicio de Admin: ${adminResponse.message}`);
            }
        } catch (e) {
            console.error(`\n❌ Error de comunicación con Admin: ${e.message}`);
        }
    }
}

async function handleAsaiChat(inquirer, user) {
    console.log('\n--- Charlando con ASAI (escribe "salir" para terminar) ---');
    console.log('ASAI: ¡Hola! Soy tu asistente personal.');
    while (true) {
        const { userQuery } = await inquirer.prompt([{ name: 'userQuery', message: `${user.correo}:` }]);
        if (userQuery.toLowerCase() === 'salir') {
            console.log('ASAI: ¡Hasta pronto!');
            break;
        }

        const requestPayload = { clientId: CLIENT_ID, userId: user._id, query: userQuery };
        try {
            const responsePromise = waitForResponse(10000);
            await sendRequest('asais', requestPayload);
            const asaiResponse = await responsePromise;

            if (asaiResponse.status === 'success') {
                console.log(`ASAI: ${asaiResponse.data.respuesta}`);
            } else {
                console.error(`ASAI: Hubo un error: ${asaiResponse.message}`);
            }
        } catch (e) {
            console.error(`❌ Error de comunicación con ASAI: ${e.message}`);
        }
    }
}

// --- Función Principal ---

async function run() {
    const inquirer = (await import('inquirer')).default;
    
    try {
        let loggedInUser = null;

        // Bucle principal de autenticación
        while (!loggedInUser) {
            const { initialAction } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'initialAction',
                    message: 'Bienvenido a VirtualFit. ¿Qué deseas hacer?',
                    choices: ['Iniciar sesión', 'Registrar un nuevo usuario', 'Salir'],
                }
            ]);

            if (initialAction === 'Salir') {
                return;
            }

            try {
                const response = await handleAuthentication(inquirer, initialAction === 'Iniciar sesión' ? 'login' : 'register');
                
                if (response.status === 'success') {
                    loggedInUser = response.data;
                } else {
                    console.error(`\n❌ Error: ${response.message}`);
                    console.log('Por favor, inténtalo de nuevo.\n');
                }

            } catch (error) {
                console.error(`\n❌ Error de comunicación: ${error.message}`);
                const { retry } = await inquirer.prompt([{ type: 'confirm', name: 'retry', message: 'No se pudo completar la operación. ¿Deseas volver al menú principal?', default: true }]);
                if (!retry) return;
            }
        }
        
        // --- Flujo Post-Autenticación ---
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
        console.log('\n[Cliente] Proceso finalizado.');
    }
}

run();