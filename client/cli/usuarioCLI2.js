const net = require('net');
const { v4: uuidv4 } = require('uuid');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const CLIENT_ID = uuidv4().substring(0, 5);

// --- Funciones Helper (sin cambios) ---

function sendMessage(socket, service, message) {
    const payload = service + message;
    const header = String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0');
    const fullMessage = header + payload;
    
    try {
        const parsed = JSON.parse(message);
        const target = parsed.correo || parsed.operation || 'N/A';
        console.log(`[Cliente] Enviando a '${service}': ${target}`);
    } catch (e) {
        console.log(`[Cliente] Enviando mensaje de sistema: ${fullMessage}`);
    }
    socket.write(fullMessage);
}

function waitForResponse(socket, timeoutMs) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        let timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('Timeout: No se recibió respuesta del servicio a tiempo.'));
        }, timeoutMs);

        const dataListener = (dataChunk) => {
            buffer += dataChunk.toString();
            while (true) {
                if (buffer.length < 5) break;
                const length = parseInt(buffer.substring(0, 5), 10);
                if (isNaN(length) || buffer.length < 5 + length) break;
                
                const fullPayload = buffer.substring(5, 5 + length);
                buffer = buffer.substring(5 + length);
                const destinationId = fullPayload.substring(0, 5);
                
                if (destinationId === CLIENT_ID) {
                    cleanup();
                    try { resolve(JSON.parse(fullPayload.substring(5))); } catch (e) { reject(e); }
                    return;
                }
            }
        };

        const errorListener = (err) => { cleanup(); reject(err); };
        function cleanup() {
            clearTimeout(timeoutId);
            socket.removeListener('data', dataListener);
            socket.removeListener('error', errorListener);
        }

        socket.on('data', dataListener);
        socket.on('error', errorListener);
    });
}

// --- Funciones de Flujo de la Aplicación ---

async function handleLogin(socket, inquirer) {
    console.log('\n--- Iniciar Sesión ---');
    const credentials = await inquirer.prompt([
        { type: 'input', name: 'correo', message: 'Correo electrónico:' },
        { type: 'password', name: 'password', message: 'Contraseña:' }
    ]);
    const requestPayload = { ...credentials, clientId: CLIENT_ID };
    sendMessage(socket, 'logns', JSON.stringify(requestPayload));
    return waitForResponse(socket, 10000);
}

async function handleRegister(socket, inquirer) {
    console.log('\n--- Registrar Nuevo Usuario ---');
    const credentials = await inquirer.prompt([
        { type: 'input', name: 'correo', message: 'Correo electrónico:' },
        { type: 'password', name: 'password', message: 'Contraseña:' }
    ]);
    // Por defecto, los usuarios se registran como 'cliente'.
    // La creación de administradores se hace con un script separado (create-admin.js).
    const requestPayload = { ...credentials, clientId: CLIENT_ID };
    sendMessage(socket, 'auths', JSON.stringify(requestPayload));
    return waitForResponse(socket, 10000);
}

async function handleAdminTasks(socket, inquirer, adminUser) {
    while (true) {
        const { adminAction } = await inquirer.prompt([
            {
                type: 'list',
                name: 'adminAction',
                message: 'Menú de Administrador:',
                choices: ['Crear Producto', 'Editar Producto', 'Eliminar Producto', 'Salir'],
            },
        ]);

        if (adminAction === 'Salir') break;

        let operation = '';
        let payload = {};

        switch (adminAction) {
            case 'Crear Producto':
                operation = 'crearProducto';
                
                // --- CORRECCIÓN CLAVE ---
                // Pedimos todos los datos en un solo prompt
                const productDetails = await inquirer.prompt([
                    { name: 'nombre', message: 'Nombre del producto:' },
                    { name: 'marca', message: 'Marca:' },
                    { name: 'talla', message: 'Talla de la variación (ej. M):' },
                    { name: 'color', message: 'Color de la variación (ej. Rojo):' },
                    { name: 'precio', message: 'Precio (ej. 19.99):', type: 'number' },
                    { name: 'stock', message: 'Stock inicial:', type: 'number' },
                ]);

                // Construimos el payload en el formato correcto que espera el productService
                payload = {
                    nombre: productDetails.nombre,
                    marca: productDetails.marca,
                    variaciones: [
                        {
                            talla: productDetails.talla,
                            color: productDetails.color,
                            precio: productDetails.precio,
                            stock: productDetails.stock
                        }
                    ]
                };
                break;
            
            case 'Editar Producto':
                // ... (esta lógica ya es correcta)
                operation = 'editarProducto';
                const { productoId: editId } = await inquirer.prompt([{ name: 'productoId', message: 'ID del producto a editar:' }]);
                const { nuevoNombre } = await inquirer.prompt([{ name: 'nuevoNombre', message: 'Nuevo nombre:' }]);
                payload = { 
                    productoId: editId, 
                    updates: { nombre: nuevoNombre }
                };
                break;

            case 'Eliminar Producto':
                // ... (esta lógica ya es correcta)
                operation = 'eliminarProducto';
                const { productoId: deleteId } = await inquirer.prompt([{ name: 'productoId', message: 'ID del producto a eliminar:' }]);
                payload = { productoId: deleteId };
                break;
        }

        const adminRequestPayload = {
            clientId: CLIENT_ID,
            userId: adminUser._id,
            operation: operation,
            payload: payload
        };

        try {
            sendMessage(socket, 'admin', JSON.stringify(adminRequestPayload));
            const adminResponse = await waitForResponse(socket, 10000);
            
            if (adminResponse.status === 'success') {
                console.log('\n✅ Operación de Admin exitosa:');
                console.log(JSON.stringify(adminResponse.data, null, 2));
            } else {
                console.error(`\n❌ Error del servicio de Admin: ${adminResponse.message}`);
            }
        } catch (e) {
            console.error(`\n❌ Error en la comunicación con el servicio de admin: ${e.message}`);
        }
    }
}
// --- Función Principal ---

async function run() {
    const inquirer = (await import('inquirer')).default;
    const client = new net.Socket();
    
    try {
        await new Promise((resolve, reject) => {
            client.connect({ host: BUS_HOST, port: BUS_PORT }, resolve);
            client.once('error', reject);
        });
        console.log(`[Cliente] Conectado al bus. Mi ID es: ${CLIENT_ID}`);
        sendMessage(client, 'sinit', CLIENT_ID);

        // --- FLUJO PRINCIPAL MODIFICADO ---

        // 1. Preguntar la acción inicial
        const { initialAction } = await inquirer.prompt([
            {
                type: 'list',
                name: 'initialAction',
                message: 'Bienvenido a VirtualFit. ¿Qué deseas hacer?',
                choices: ['Iniciar sesión', 'Registrar un nuevo usuario'],
            }
        ]);

        let response;
        if (initialAction === 'Iniciar sesión') {
            response = await handleLogin(client, inquirer);
        } else {
            response = await handleRegister(client, inquirer);
        }
        
        // 2. Comprobar el resultado de la acción
        if (response.status !== 'success') {
            throw new Error(response.message);
        }

        const loggedInUser = response.data;
        console.log(`✅ ¡Acción exitosa! Bienvenido, ${loggedInUser.correo}.`);
        console.log(`   Tu rol es: ${loggedInUser.rol}`);

        // 3. Flujo condicional basado en el rol
        if (loggedInUser.rol === 'admin') {
            await handleAdminTasks(client, inquirer, loggedInUser);
        } else {
            console.log('\n--- ¡Bienvenido a la tienda! ---');
            console.log('(Aquí iría la funcionalidad para clientes: ver catálogo, comprar, etc.)');
        }

    } catch (error) {
        console.error('\n❌ Error en el flujo principal:', error.message);
    } finally {
        if (client) client.end();
        console.log('[Cliente] Conexión cerrada.');
    }
}

run();