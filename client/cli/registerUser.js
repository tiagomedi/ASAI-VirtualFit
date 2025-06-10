
const net = require('net');
const { v4: uuidv4 } = require('uuid');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
// ID único para este cliente, para que el servicio sepa a quién responder (5 caracteres)
const CLIENT_ID = uuidv4().substring(0, 5);
const SERVICE_TO_CALL = 'auths'; // El servicio de autenticación


function sendMessage(socket, service, message) {
    const payload = service + message;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`[Cliente] Enviando: ${fullMessage}`);
    socket.write(fullMessage);
}

const client = new net.Socket();

async function run() {
    const inquirer = (await import('inquirer')).default;

    client.connect(BUS_PORT, BUS_HOST, async () => {
        console.log('[Cliente] Conectado al bus.');

        try {
            
            sendMessage(client, 'sinit', CLIENT_ID);

            const answers = await inquirer.prompt([
                { type: 'input', name: 'correo', message: 'Introduce el correo electrónico:' },
                { type: 'password', name: 'password', message: 'Introduce la contraseña:' }
            ]);

            const requestPayload = {
                correo: answers.correo,
                password: answers.password,
                clientId: CLIENT_ID 
            };

            sendMessage(client, SERVICE_TO_CALL, JSON.stringify(requestPayload));
            console.log('\n[Cliente] Solicitud enviada. Esperando respuesta...');

        } catch (error) {
            console.error('Error durante la interacción:', error.message);
            client.end();
        }
    });


    client.on('data', (data) => {
        const rawData = data.toString();
        const length = parseInt(rawData.substring(0, 5), 10);
        const payload = rawData.substring(5, 5 + length);
        const sender = payload.substring(0, 5); 
        const message = payload.substring(5);

        if (sender === 'sinit') {
            console.log('[Cliente] Registro en el bus confirmado.');
            return;
        }

        console.log(`\n[Cliente] Respuesta recibida de '${sender}':`);
        const response = JSON.parse(message);

        if (response.status === 'success') {
            console.log('¡Éxito! Usuario creado correctamente:');
            console.log(`- ID: ${response.data._id}`);
            console.log(`- Correo: ${response.data.correo}`);
        } else {
            console.error(`Error del servicio: ${response.message}`);
        }

        client.end();
    });

    client.on('close', () => {
        console.log('[Cliente] Conexión cerrada.');
    });

    client.on('error', (err) => {
        console.error(`[Cliente] Error de conexión: ${err.message}`);
    });
}

run();
