// clients/pointClient.js

const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js');
const User = require('../../database/models/user.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;

let clientSocket;
let responsePromise = {}; // Variable global para manejar la promesa de respuesta

// --- FUNCIONES DE COMUNICACIÓN (Copiadas del Golden Code) ---

function sendMessage(serviceName, data) {
    const service = serviceName.padEnd(5, ' ');
    const payload = service + data;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`\n[Cliente] -> Enviando a '${serviceName}': ${fullMessage}`);
    clientSocket.write(fullMessage);
}

function sendRequest(serviceName, requestPayload) {
    return new Promise((resolve, reject) => {
        responsePromise = { resolve, reject }; 
        sendMessage(serviceName, JSON.stringify(requestPayload));

        const timeout = setTimeout(() => {
            if (responsePromise.reject) {
                responsePromise.reject(new Error("Timeout: El servicio no respondió a tiempo (30s)."));
                responsePromise = {};
            }
        }, 30000);

        responsePromise.resolve = (value) => { clearTimeout(timeout); resolve(value); };
        responsePromise.reject = (err) => { clearTimeout(timeout); reject(err); };
    });
}

// --- LÓGICA DEL CLIENTE ---

async function startClient() {
    await connectDB();
    const inquirer = (await import('inquirer')).default;
    clientSocket = new net.Socket();

    clientSocket.connect(BUS_PORT, BUS_HOST, () => {
        console.log(`[Cliente] Conectado al bus en ${BUS_PORT}.`);
        mainMenu(inquirer); // Inicia el menú interactivo
    });

    // Manejador de datos entrantes (Copiado del Golden Code)
    let buffer = '';
    clientSocket.on('data', (data) => {
        buffer += data.toString();
        while (buffer.length >= 5) {
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length) || buffer.length < 5 + length) {
                break;
            }
            const totalMessageLength = 5 + length;
            const messageToProcess = buffer.substring(0, totalMessageLength);
            buffer = buffer.substring(totalMessageLength);
            
            console.log(`\n[Cliente] <- Procesando respuesta del bus: ${messageToProcess}`);
            const status = messageToProcess.substring(10, 12).trim();
            const messageContent = messageToProcess.substring(12);

            if (Object.keys(responsePromise).length > 0) {
                try {
                    const responseData = JSON.parse(messageContent);
                    if (status === 'OK') {
                        if (responseData.error) {
                            responsePromise.reject(new Error(responseData.error));
                        } else {
                            responsePromise.resolve(responseData);
                        }
                    } else { 
                        responsePromise.reject(new Error(`El bus reportó un error (NK): ${responseData.error || messageContent}`));
                    }
                } catch (e) {
                    responsePromise.reject(new Error(`Error al procesar JSON de respuesta: ${e.message}`));
                }
                responsePromise = {};
            }
        }
    });

    clientSocket.on('close', () => {
        console.log('\n[Cliente] Conexión cerrada.');
        if (mongoose.connection.readyState === 1) mongoose.connection.close();
        process.exit(0);
    });

    clientSocket.on('error', (err) => {
        console.error('\n[Cliente] Error de conexión:', err.message);
        if (mongoose.connection.readyState === 1) mongoose.connection.close();
        process.exit(1);
    });
}

async function mainMenu(inquirer) {
    try {
        let exit = false;
        while (!exit) {
            const { userEmail } = await inquirer.prompt([{
                type: 'input',
                name: 'userEmail',
                message: '👤 Introduce el correo del usuario para añadir puntos (o escribe "salir"):',
            }]);

            if (userEmail.toLowerCase() === 'salir') {
                exit = true;
                continue;
            }

            const usuario = await User.findOne({ correo: userEmail.toLowerCase().trim() });
            if (!usuario) {
                console.error(`\n❌ Usuario '${userEmail}' no encontrado. Inténtalo de nuevo.`);
                continue;
            }
            
            console.log(`✅ Usuario encontrado: ${usuario.correo}. Puntos actuales: ${usuario.asai_points}`);

            const { totalPago } = await inquirer.prompt([{
                type: 'number',
                name: 'totalPago',
                message: '💰 Introduce el total del pago para calcular los puntos:',
                validate: (value) => value > 0 || 'El valor debe ser un número positivo.'
            }]);

            console.log(`\nEnviando solicitud al servicio 'point'...`);
            
            const resultado = await sendRequest('point', {
                action: 'add_points',
                payload: {
                    user_id: usuario._id.toString(),
                    total_pago: totalPago
                }
            });

            console.log('\n✅ ¡Respuesta recibida del servicio!');
            console.log(JSON.stringify(resultado, null, 2));
            
            const { again } = await inquirer.prompt([{
                type: 'confirm',
                name: 'again',
                message: '¿Deseas probar con otro usuario?',
                default: true
            }]);

            if (!again) {
                exit = true;
            }
        }
    } catch (error) {
        console.error(`\n❌ Error General: ${error.message}`);
    } finally {
        console.log("\n👋 ¡Hasta luego!");
        clientSocket.end();
    }
}

startClient();