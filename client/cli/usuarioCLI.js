const net = require('net');
const { v4: uuidv4 } = require('uuid');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const CLIENT_ID = uuidv4().substring(0, 5);

const pendingResponses = new Map();
const clientSocket = new net.Socket();
let buffer = Buffer.alloc(0);



clientSocket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    processBuffer();
});

clientSocket.on('close', () => {
    processBuffer(true); // Procesa lo que quede al cerrar
    console.log('[Cliente] Conexión con el bus cerrada.');
    // Limpia promesas pendientes
    for (const [correlationId, handler] of pendingResponses.entries()) {
        handler(new Error('La conexión con el bus se cerró inesperadamente.'), null);
    }
    pendingResponses.clear();
});

function processBuffer(force = false) {
    while (buffer.length >= 5) {
        const lengthStr = buffer.slice(0, 5).toString();
        const length = parseInt(lengthStr, 10);
        if (isNaN(length)) {
            buffer = Buffer.alloc(0);
            break;
        }
        if (buffer.length < 5 + length) {
            if (force && buffer.length > 5) {
                // Forzar procesamiento si el socket se cerró y hay datos
                const msg = buffer.slice(5).toString();
                handleMessage(msg);
                buffer = Buffer.alloc(0);
            }
            break;
        }
        const msg = buffer.slice(5, 5 + length).toString();
        handleMessage(msg);
        buffer = buffer.slice(5 + length);
    }
}

function handleMessage(fullPayload) {
    const destinationId = fullPayload.substring(0, 5);
    const responseJson = fullPayload.substring(5);

    if (destinationId !== CLIENT_ID) {
        return;
    }

    try {
        const response = JSON.parse(responseJson);
        if (response.correlationId && pendingResponses.has(response.correlationId)) {
            const handler = pendingResponses.get(response.correlationId);
            pendingResponses.delete(response.correlationId);
            handler(null, response);
        }
    } catch (e) {
        // Manejo de error de parseo
    }
}

// --- Envío de mensajes y promesas ---

function sendMessage(service, message) {
    const body = service + message;
    const header = String(Buffer.byteLength(body, 'utf8')).padStart(5, '0');
    clientSocket.write(header + body);
    console.log(`[Cliente] Enviando a '${service}'... (Header: ${header})`);
}

function sendRequestAndWait(service, requestData, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const correlationId = uuidv4();
        requestData.correlationId = correlationId;
        requestData.clientId = CLIENT_ID;
        pendingResponses.set(correlationId, (err, response) => {
            if (err) return reject(err);
            resolve(response);
        });
        sendMessage(service, JSON.stringify(requestData));
        setTimeout(() => {
            if (pendingResponses.has(correlationId)) {
                pendingResponses.delete(correlationId);
                reject(new Error(`Timeout esperando respuesta para la operación: ${service}`));
            }
        }, timeoutMs);
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
    while (true) {
        const { consulta } = await inquirer.prompt([{ type: 'input', name: 'consulta', message: 'Tú:' }]);
        if (consulta.trim().toLowerCase() === 'salir') break;

        try {
            const response = await sendRequestAndWait('asais', { userId: user._id, query: consulta });
            if (response.status === 'success') {
                console.log(`ASAI: ${response.data.respuesta}`);
            } else {
                console.log(`ASAI (error): ${response.message}`);
            }
        } catch (e) {
            console.log('❌ Error en la sesión con ASAI:', e.message);
            break;
        }
    }
}


// --- Función Principal ---

async function run() {
    const inquirer = (await import('inquirer')).default;

    try {
        await new Promise((resolve, reject) => {
            clientSocket.connect({ host: BUS_HOST, port: BUS_PORT }, resolve);
            clientSocket.once('error', reject);
        });
        console.log(`[Cliente] Conectado al bus. Mi ID es: ${CLIENT_ID}`);
        sendMessage('sinit', CLIENT_ID);
        await new Promise(r => setTimeout(r, 100)); // Pequeño delay para asegurar registro

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
                console.error(`\n❌ Error de autenticación: ${error.message}`);
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
        if (!clientSocket.destroyed) clientSocket.destroy();
        console.log('\n[Cliente] Proceso finalizado.');
    }
}

/* HABLAR CON ASAI:
"buscar zapatillas"
"mostrar productos nike"
"tienes algo de color azul"
"muéstrame poleras adidas"
"estado de mi pedido"
*/

run();