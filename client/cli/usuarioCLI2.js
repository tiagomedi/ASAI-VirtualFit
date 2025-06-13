const { execSync } = require('child_process');
const net = require('net');
const { v4: uuidv4 } = require('uuid');
const { connectDB, mongoose } = require('../../database/db.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const CLIENT_ID = uuidv4().substring(0, 5);

// Función de comunicación simplificada para login/registro
function sendAuthRequest(socket, service, credentials) {
    return new Promise((resolve, reject) => {
        const message = JSON.stringify({ ...credentials, clientId: CLIENT_ID });
        const payload = service.padEnd(5, ' ') + message;
        const header = String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0');
        const fullMessage = header + payload;

        socket.write(fullMessage);
        
        let buffer = '';
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error(`Timeout esperando respuesta de '${service}'.`));
        }, 5000);

        const dataListener = (dataChunk) => {
            buffer += dataChunk.toString();
            if (buffer.length < 5) return;
            const length = parseInt(buffer.substring(0, 5), 10);
            if (buffer.length < 5 + length) return;

            const responsePayload = buffer.substring(5, 5 + length);
            const destinationId = responsePayload.substring(0, 5);

            if (destinationId === CLIENT_ID) {
                cleanup();
                const status = responsePayload.substring(5, 7).trim();
                const data = responsePayload.substring(7);
                try {
                    const jsonData = JSON.parse(data);
                    if (status === 'OK' && jsonData.status === 'success') {
                        resolve(jsonData.data);
                    } else {
                        reject(new Error(jsonData.message || 'Error desconocido de autenticación.'));
                    }
                } catch (e) {
                    reject(e);
                }
            }
        };

        const errorListener = (err) => { cleanup(); reject(err); };
        const cleanup = () => {
            clearTimeout(timeoutId);
            socket.removeListener('data', dataListener);
            socket.removeListener('error', errorListener);
        };

        socket.on('data', dataListener);
        socket.on('error', errorListener);
    });
}

/**
 * Lanza un script cliente como un subproceso.
 * @param {string} scriptPath - Ruta al script del cliente.
 * @param {object} user - El objeto del usuario logueado.
 */
function launchModule(scriptPath, user) {
    console.log(`\n--- Lanzando módulo: ${scriptPath} ---`);
    try {
        execSync(`node ${scriptPath} "${user._id}" "${user.correo}"`, { stdio: 'inherit' });
    } catch (error) {
        console.error(`\n❌ El módulo '${scriptPath}' ha finalizado con un error.`);
    }
    console.log(`\n--- Módulo '${scriptPath}' finalizado. Volviendo al menú principal. ---`);
}


async function run() {
    await connectDB();
    const inquirer = (await import('inquirer')).default;
    const clientSocket = new net.Socket();

    try {
        await new Promise((resolve, reject) => {
            clientSocket.connect({ host: BUS_HOST, port: BUS_PORT }, resolve);
            clientSocket.once('error', reject);
        });
        
        // Registrar este cliente en el bus
        clientSocket.write(String(CLIENT_ID.length).padStart(5, '0') + 'sinit' + CLIENT_ID);

        // --- Flujo de Autenticación ---
        const { initialAction } = await inquirer.prompt([{
            type: 'list', name: 'initialAction', message: 'Bienvenido a VirtualFit',
            choices: ['Iniciar sesión', 'Registrar nuevo usuario']
        }]);

        const credentials = await inquirer.prompt([
            { type: 'input', name: 'correo', message: 'Correo electrónico:' },
            { type: 'password', name: 'password', message: 'Contraseña:' }
        ]);

        const service = initialAction === 'Iniciar sesión' ? 'logns' : 'auths';
        const user = await sendAuthRequest(clientSocket, service, credentials);

        // Cerramos la conexión del socket de autenticación, ya que cada módulo abrirá la suya.
        clientSocket.end();

        // --- Menú Principal Post-Login ---
        let exit = false;
        while (!exit) {
            const choices = [
                { name: 'Ver Perfil', value: 'profile' },
                { name: 'Catálogo de Productos', value: 'catalog' },
                { name: 'Carrito de Compras', value: 'cart' },
                { name: 'Lista de Deseos', value: 'wishlist' },
                { name: 'Mis Órdenes', value: 'orders' },
                { name: 'Escribir una Reseña', value: 'review' },
                { name: 'Asistente ASAI (Próximamente)', value: 'asai', disabled: true },
                new inquirer.Separator(),
                { name: 'Salir', value: 'exit' },
            ];

            if (user.rol === 'admin') {
                choices.splice(7, 0, { name: 'Gestión de Productos (Admin)', value: 'admin' });
            }

            const { action } = await inquirer.prompt([{
                type: 'list', name: 'action', message: `Bienvenido, ${user.correo}. ¿Qué deseas hacer?`,
                choices: choices
            }]);

            switch (action) {
                case 'profile':
                    console.log('\n--- Tu Perfil ---');
                    console.log(JSON.stringify(user, null, 2));
                    break;
                case 'catalog':
                    // Asumimos que has modificado catalogClient.js para aceptar args
                    launchModule('client/cli/catalogClient.js', user);
                    break;
                case 'cart':
                    launchModule('client/cli/cartClient.js', user);
                    break;
                case 'wishlist':
                    // Necesitarás crear un wishlistClient.js separado
                    launchModule('client/cli/wishlistClient.js', user);
                    break;
                case 'orders':
                    launchModule('client/cli/orderClient.js', user);
                    break;
                case 'review':
                    launchModule('client/cli/reseñaClient.js', user);
                    break;
                case 'admin':
                    // El admin no necesita un cliente separado, su lógica es única aquí
                    launchModule('client/cli/adminProductClient.js', user); // Sería mejor separar esta lógica.
                    break;
                case 'exit':
                    exit = true;
                    break;
            }
            if (!exit && action !== 'profile') {
                await inquirer.prompt([{ type: 'input', name: 'continue', message: '\nPresiona ENTER para volver al menú principal...' }]);
            }
        }

    } catch (error) {
        console.error('\n❌ Error en el flujo principal:', error.message);
    } finally {
        if (clientSocket && !clientSocket.destroyed) clientSocket.end();
        if (mongoose.connection.readyState === 1) await mongoose.connection.close();
        console.log('\n👋 ¡Hasta luego!');
    }
}

run();