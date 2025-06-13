// client/cli/log-usuario.js

const net = require('net');
const { v4: uuidv4 } = require('uuid');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const CLIENT_ID = uuidv4().substring(0, 5);

function sendMessage(socket, service, message) {
    const payload = service + message;
    const header = String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0');
    const fullMessage = header + payload;
    if (service === 'auths' || service === 'logns') {
        const correo = JSON.parse(message).correo || 'N/A';
        console.log(`[Cliente] Enviando a '${service}': ${correo}`);
    } else {
        console.log(`[Cliente] Enviando mensaje de sistema: ${fullMessage}`);
    }
    socket.write(fullMessage);
}

/**
 * Función que devuelve una Promesa que se resuelve con la respuesta completa del servidor.
 * Internamente maneja el buffering, los chunks, los ecos y los timeouts.
 * @param {net.Socket} socket - El socket conectado.
 * @param {number} timeoutMs - Milisegundos de espera antes de fallar.
 * @returns {Promise<object>} La respuesta JSON parseada del servicio.
 */
function waitForResponse(socket, timeoutMs) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        let timeoutId = null;

        const dataListener = (dataChunk) => {
            buffer += dataChunk.toString();
            
            while (true) {
                if (buffer.length < 5) break;
                const length = parseInt(buffer.substring(0, 5), 10);
                if (isNaN(length) || buffer.length < 5 + length) break;
                
                const fullPayload = buffer.substring(5, 5 + length);
                buffer = buffer.substring(5 + length);

                const destinationId = fullPayload.substring(0, 5);
                const messageContent = fullPayload.substring(5);

                if (destinationId === CLIENT_ID) {
                    // ¡Mensaje para nosotros! Resolvemos la promesa.
                    clearTimeout(timeoutId); // Cancelar el timeout
                    socket.removeListener('data', dataListener); // Limpiar el listener
                    try {
                        resolve(JSON.parse(messageContent));
                    } catch (e) {
                        reject(new Error(`Error al parsear JSON: ${e.message}. Recibido: ${messageContent}`));
                    }
                    return; // Salir de la función
                } else {
                    console.log(`[Cliente] Mensaje ignorado (Destino: ${destinationId}, no es para mí).`);
                }
            }
        };

        const errorListener = (err) => {
            clearTimeout(timeoutId);
            reject(err);
        };

        // Configurar los listeners
        socket.on('data', dataListener);
        socket.on('error', errorListener);
        
        // Configurar el timeout
        timeoutId = setTimeout(() => {
            socket.removeListener('data', dataListener); // Limpiar listener al fallar
            socket.removeListener('error', errorListener);
            reject(new Error('Timeout: No se recibió respuesta del servicio a tiempo.'));
        }, timeoutMs);
    });
}

async function run() {
    const inquirer = (await import('inquirer')).default;
    const client = new net.Socket();
    
    try {
        await new Promise((resolve, reject) => {
            const options = { host: BUS_HOST, port: BUS_PORT };
            client.connect(options, resolve);
            client.once('error', reject);
        });

        console.log(`[Cliente] Conectado al bus. Mi ID es: ${CLIENT_ID}`);
        sendMessage(client, 'sinit', CLIENT_ID);

        // Pedimos la acción al usuario
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: '¿Qué deseas hacer?',
                choices: ['Registrar un nuevo usuario', 'Iniciar sesión'],
            }
        ]);

        const isLogin = action === 'Iniciar sesión';
        const serviceToCall = isLogin ? 'logns' : 'auths';

        // --- CORRECCIÓN FINAL Y DEFINITIVA ---
        // Aquí definimos explícitamente las preguntas para las credenciales.
        const credentials = await inquirer.prompt([
            {
                type: 'input',
                name: 'correo', // La clave será 'correo'
                message: 'Introduce tu correo electrónico:'
            },
            {
                type: 'password',
                name: 'password', // La clave será 'password'
                message: 'Introduce tu contraseña:'
            }
        ]);
        
        // El objeto 'credentials' ahora será: { correo: '...', password: '...' }
        const requestPayload = {
            correo: credentials.correo,
            password: credentials.password,
            clientId: CLIENT_ID
        };

        sendMessage(client, serviceToCall, JSON.stringify(requestPayload));
        console.log('\n[Cliente] Solicitud enviada. Esperando respuesta...');

        const response = await waitForResponse(client, 10000);

        if (response.status === 'success') {
            console.log('✅ ¡Éxito!');
            console.log('--- Datos del Usuario ---');
            console.log(JSON.stringify(response.data, null, 2));
        } else {
            console.error(`❌ Error del servicio: ${response.message}`);
        }

    } catch (error) {
        console.error('\nError en el proceso de registro:', error.message);
    } finally {
        if (client) client.end();
        console.log('[Cliente] Conexión cerrada.');
    }
}

run();