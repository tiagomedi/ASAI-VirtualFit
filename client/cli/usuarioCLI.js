const net = require('net');
const { v4: uuidv4 } = require('uuid');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const CLIENT_ID = uuidv4().substring(0, 5);

const pendingResponses = new Map();
const clientSocket = new net.Socket();
let buffer = ''; // Cambiar a string como otros archivos del proyecto

clientSocket.on('data', (chunk) => {
    buffer += chunk.toString();
    processBuffer();
});

clientSocket.on('close', () => {
    console.log('[Cliente] Conexión con el bus cerrada.');
    // Limpia promesas pendientes
    for (const [correlationId, handler] of pendingResponses.entries()) {
        handler(new Error('La conexión con el bus se cerró inesperadamente.'), null);
    }
    pendingResponses.clear();
});

function processBuffer() {
    while (buffer.length >= 5) {
        const lengthStr = buffer.substring(0, 5);
        const length = parseInt(lengthStr, 10);
        if (isNaN(length)) {
            console.error('[Cliente] Error en el header del mensaje, limpiando buffer');
            buffer = '';
            break;
        }
        if (buffer.length < 5 + length) {
            break; // Esperar más datos
        }
        const fullMessage = buffer.substring(0, 5 + length);
        buffer = buffer.substring(5 + length);
        
        console.log(`[Cliente] DEBUG - Full message: '${fullMessage}'`);
        console.log(`[Cliente] DEBUG - Message content: '${fullMessage.substring(5)}'`);
        
        // Procesar el mensaje completo
        handleMessage(fullMessage);
    }
}

function handleMessage(fullMessage) {
    // El mensaje viene en formato: [header 5 bytes][destino 5 bytes][servicio 5 bytes][status 2 bytes][JSON]
    if (fullMessage.length < 17) {
        console.error('[Cliente] Mensaje muy corto, ignorando');
        return;
    }
    
    const messageContent = fullMessage.substring(5); // Quitamos el header
    const destination = messageContent.substring(0, 5).trim(); // Destino (debería ser nuestro CLIENT_ID)
    const serviceName = messageContent.substring(5, 10).trim(); // Nombre del servicio
    const status = messageContent.substring(10, 12).trim(); // Status
    const responseJson = messageContent.substring(12); // JSON content
    
    console.log(`[Cliente] DEBUG - Dest: '${destination}', Service: '${serviceName}', Status: '${status}', JSON: '${responseJson.substring(0, 50)}...'`);

    try {
        const response = JSON.parse(responseJson);
        
        if (response.correlationId && pendingResponses.has(response.correlationId)) {
            const handler = pendingResponses.get(response.correlationId);
            pendingResponses.delete(response.correlationId);
            
            if (status === 'OK') {
                handler(null, response);
            } else {
                handler(new Error(`Error del servicio ${serviceName}: ${response.message || 'Error desconocido'}`), null);
            }
        }
    } catch (e) {
        console.error(`[Cliente] Error al procesar mensaje JSON: ${e.message}`);
        console.error(`[Cliente] Mensaje problemático: ${responseJson.substring(0, 200)}...`);
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
                // Puedes pedir más campos aquí:
                const updates = await inquirer.prompt([
                    { name: 'nombre', message: 'Nuevo nombre (deja vacío para no cambiar):' },
                    { name: 'marca', message: 'Nueva marca (deja vacío para no cambiar):' },
                    { name: 'talla', message: 'Nueva talla (deja vacío para no cambiar):' },
                    { name: 'color', message: 'Nuevo color (deja vacío para no cambiar):' },
                    { name: 'precio', message: 'Nuevo precio (deja vacío para no cambiar):', type: 'number' },
                    { name: 'stock', message: 'Nuevo stock (deja vacío para no cambiar):', type: 'number' }
                ]);
                // Elimina campos vacíos
                Object.keys(updates).forEach(k => { if (!updates[k]) delete updates[k]; });
                payload = { productoId: editId, updates };
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
    console.log('PREGUNTAS SUGERIDAS: \n"buscar zapatillas", "mostrar productos nike", "tienes algo de color azul", "muéstrame poleras adidas", \n"estado de mi pedido", "mostrar precios entre (precio min) y (precio max)"\n');

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
"buscar productos nike"
"buscar polera azul"
"muéstrame poleras adidas"
"estado de mi pedido"
*/

run();