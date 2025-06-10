// services/authService.js

require('../database/db.js'); // Conexión a la BD (sigue siendo necesaria)
const net = require('net');    // Usamos el módulo nativo 'net' para sockets TCP
const userService = require('./userService');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_NAME = 'auths'; // Nombre de nuestro servicio (5 caracteres)

// Función para formatear y enviar mensajes según el protocolo del bus
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
    // 1. Registrar el servicio en el bus
    sendMessage(client, 'sinit', SERVICE_NAME);
});

// Listener para los datos que llegan del bus
client.on('data', (data) => {
    // El bus nos envía los mensajes con el mismo protocolo (header + payload)
    const rawData = data.toString();
    console.log(`[authService] Datos crudos recibidos: ${rawData}`);
    
    // Suponemos que el bus envía un mensaje a la vez
    const length = parseInt(rawData.substring(0, 5), 10);
    const payload = rawData.substring(5, 5 + length);
    const sender = payload.substring(0, 5); // El servicio o cliente que envía
    const message = payload.substring(5);

    console.log(`[authService] Mensaje procesado: de='${sender}', mensaje='${message}'`);

    // Ignoramos la respuesta inicial de 'sinit'
    if (sender === 'sinit') {
        console.log('[authService] Registro en el bus confirmado.');
        return;
    }

    // Procesamos la solicitud de registro
    (async () => {
        try {
            // El mensaje del cliente será un JSON stringificado
            const { correo, password, clientId } = JSON.parse(message);

            if (!correo || !password || !clientId) {
                throw new Error('Payload inválido desde el cliente.');
            }
            
            const nuevoUsuario = await userService.crearUsuario(correo, password);
            
            const responsePayload = {
                status: 'success',
                data: nuevoUsuario
            };
            // Respondemos directamente al cliente (clientId) a través del bus
            sendMessage(client, clientId, JSON.stringify(responsePayload));

        } catch (error) {
            const { clientId } = JSON.parse(message); // Necesitamos el clientId para responder
            const errorPayload = {
                status: 'error',
                message: error.message
            };
            console.error(`[authService] Error al procesar: ${error.message}`);
            // Respondemos con el error al cliente
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