// client/cli/usuarioCLI.js

const net = require('net');
const { v4: uuidv4 } = require('uuid');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
// Usamos CLIENT_ID como el nombre oficial para el ID de esta instancia.
const CLIENT_ID = uuidv4().substring(0, 5);

// --- Funciones Helper de Sockets ---

/**
 * Formatea y envía un mensaje a través de un socket ya conectado.
 */
function sendMessage(socket, service, message) {
    const payload = service + message;
    const header = String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0');
    try {
        const parsed = JSON.parse(message);
        const target = parsed.correo || parsed.operation || parsed.query || 'N/A';
        console.log(`[Cliente] Enviando a '${service}': ${target}`);
    } catch (e) {
        console.log(`[Cliente] Enviando mensaje de sistema...`);
    }
    socket.write(header + payload);
}

/**
 * Devuelve una Promesa que espera una respuesta dirigida a nuestro ID.
 * Usa un socket de escucha dedicado y maneja fragmentación TCP, ecos y timeouts.
 */
function waitForResponse(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const subSocket = new net.Socket();
        let buffer = '';
        let timeoutId = null;

        const dataListener = (dataChunk) => {
            buffer += dataChunk.toString('utf8');
            processBuffer();
        };

        const errorListener = (err) => cleanup(err);
        const closeListener = () => {
            if (timeoutId) cleanup(new Error('Socket de escucha cerrado inesperadamente.'));
        };

        function processBuffer() {
            while (buffer.length >= 5) {
                const header = buffer.substring(0, 5);
                const expectedLength = parseInt(header, 10);
                if (isNaN(expectedLength)) return cleanup(new Error(`Buffer corrupto: "${header}"`));
                if (buffer.length < 5 + expectedLength) return; // Mensaje incompleto, esperar más datos

                const fullPayload = buffer.substring(5, 5 + expectedLength);
                buffer = buffer.substring(5 + expectedLength);
                const destinationId = fullPayload.substring(0, 5);
                
                if (destinationId === CLIENT_ID) {
                    try {
                        cleanup(null, JSON.parse(fullPayload.substring(5)));
                    } catch (e) {
                        cleanup(new Error(`Error al parsear JSON: ${e.message}. Recibido: ${fullPayload.substring(5)}`));
                    }
                    return; // Terminamos al recibir nuestro mensaje
                } else {
                    // Ignorar ecos o mensajes sinit y seguir procesando el buffer
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
 * Envía una petición única al bus usando un socket de corta duración.
 */
async function sendRequest(service, payload) {
    const pubSocket = new net.Socket();
    await new Promise((resolve, reject) => {
        pubSocket.connect({ host: BUS_HOST, port: BUS_PORT }, resolve);
        pubSocket.once('error', reject); // Manejar errores de conexión aquí
    });
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
        {
            type: 'input',
            name: 'correo',
            message: 'Correo electrónico:',
            validate: (value) => value.includes('@') ? true : 'Por favor, introduce un correo válido.'
        },
        {
            type: 'password',
            name: 'password',
            message: 'Contraseña:',
            mask: '*'
            // Se ha eliminado la validación de longitud de la contraseña
        }
    ]);
    
    const requestPayload = { ...credentials, clientId: CLIENT_ID };
    
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
    
    const askAsai = async (query) => {
        const requestPayload = { clientId: CLIENT_ID, userId: user._id, query };
        const responsePromise = waitForResponse(10000);
        await sendRequest('asais', requestPayload);
        return responsePromise;
    };

    try {
        const welcomeResponse = await askAsai('');
        if (welcomeResponse.status === 'success') {
            console.log(`ASAI: ${welcomeResponse.data.respuesta}`);
        } else {
            throw new Error(welcomeResponse.message);
        }

        while (true) {
            const { userQuery } = await inquirer.prompt([{ name: 'userQuery', message: `${user.correo}:` }]);
            const query = userQuery.toLowerCase().trim();
            if (query === 'salir') {
                console.log('ASAI: ¡Hasta pronto!');
                break;
            }

            const response = await askAsai(query);
            if (response.status === 'success') {
                console.log(`ASAI: ${response.data.respuesta}`);
            } else {
                console.error(`ASAI: Hubo un error: ${response.message}`);
            }
        }
    } catch (e) {
        console.error(`\n❌ Error en la sesión con ASAI: ${e.message}`);
    }
}


// --- Función Principal ---

async function run() {
    const inquirer = (await import('inquirer')).default;
    
    try {
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
                if (response.status === 'success') {
                    loggedInUser = response.data;
                } else {
                    console.error(`\n❌ Error: ${response.message}\n`);
                }
            } catch (error) {
                console.error(`\n❌ Error de comunicación: ${error.message}`);
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
        console.log('\n[Cliente] Proceso finalizado.');
    }
}

run();