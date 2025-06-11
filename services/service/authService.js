require('../../database/db.js'); 
const net = require('net');    
const userService = require('./userService.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'auths'; 


function sendMessage(socket, service, message) {
    const payload = service + message;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`[authService] Enviando: ${fullMessage}`);
    socket.write(fullMessage);
}

const client = new net.Socket();

client.connect(BUS_PORT, BUS_HOST, () => {
    console.log('[authService] Conectado al bus.');

    sendMessage(client, 'sinit', SERVICE_NAME);
});


client.on('data', (data) => {


    const rawData = data.toString();
    console.log(`[authService] Datos crudos recibidos: ${rawData}`);

    const length = parseInt(rawData.substring(0, 5), 10);
    const payload = rawData.substring(5, 5 + length);
    const sender = payload.substring(0, 5); 
    const message = payload.substring(5);

    console.log(`[authService] Mensaje procesado: de='${sender}', mensaje='${message}'`);

    
    if (sender === 'sinit') {
        console.log('[authService] Registro en el bus confirmado.');
        return;
    }


    (async () => {
        try {

            const { correo, password, clientId } = JSON.parse(message);

            if (!correo || !password || !clientId) {
                throw new Error('Payload inválido desde el cliente.');
            }
            
            const nuevoUsuario = await userService.crearUsuario(correo, password);
            
            const responsePayload = {
                status: 'success',
                data: nuevoUsuario
            };


            sendMessage(client, clientId, JSON.stringify(responsePayload));

        } catch (error) {
            const { clientId } = JSON.parse(message); 
            const errorPayload = {
                status: 'error',
                message: error.message
            };
            console.error(`[authService] Error al procesar: ${error.message}`);

            sendMessage(client, clientId, JSON.stringify(errorPayload));
        }
    })();
});

client.on('close', () => {
    console.log('[authService] Conexión con el bus cerrada.');
});

client.on('error', (err) => {
    console.error(`[authService] Error de conexión: ${err.message}`);
});