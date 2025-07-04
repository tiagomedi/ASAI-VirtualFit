// notif1Client.js
const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js');
const crypto = require('crypto'); // Módulo nativo de Node para generar IDs

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_TO_CALL = 'notif'; // Nombre de servicio de 5 caracteres

let clientSocket;
let responsePromise = {};
// Generamos un ID único para esta sesión del cliente
const CLIENT_ID = crypto.randomBytes(4).toString('hex').padEnd(10, ' ');

// Función de bajo nivel para enviar el mensaje formateado
function sendMessage(serviceName, data) {
    const service = serviceName.padEnd(5, ' ');
    // Incluimos el CLIENT_ID en el payload
    const payload = service + CLIENT_ID + data; 
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`[Cliente] -> Enviando a '${serviceName}' (ID: ${CLIENT_ID.trim()}): ${fullMessage.substring(0, 200)}...`);
    clientSocket.write(fullMessage);
}

// Función que envía una solicitud y devuelve una promesa
function sendRequest(requestPayload) {
    return new Promise((resolve, reject) => {
        responsePromise.resolve = resolve;
        responsePromise.reject = reject;
        
        // La función sendMessage ahora incluye el ID automáticamente
        sendMessage(SERVICE_TO_CALL, JSON.stringify(requestPayload)); 
        
        const timeout = setTimeout(() => {
            if (responsePromise.reject) {
                responsePromise.reject(new Error("Timeout: El servicio no respondió en 5 segundos."));
                responsePromise = {}; // Limpiar para evitar memory leaks
            }
        }, 5000);
        
        // Guardamos el timeout para poder limpiarlo
        responsePromise.timeout = timeout; 
    });
}

// --- FUNCIÓN PRINCIPAL DE ARRANQUE ---
async function startClient() {
    await connectDB();
    clientSocket = new net.Socket();
    
    clientSocket.connect(BUS_PORT, BUS_HOST, () => {
        console.log(`[Cliente] Conectado al bus en ${BUS_PORT}.`);
        runMenu();
    });

    // --- MANEJADOR CENTRALIZADO DE DATOS ---
    let buffer = '';
    clientSocket.on('data', (data) => {
        buffer += data.toString();
        while (buffer.length >= 5) {
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length) || buffer.length < 5 + length) break;
            
            const fullMessage = buffer.substring(0, 5 + length);
            buffer = buffer.substring(5 + length);
            
            console.log(`\n[Cliente] <- Respuesta recibida: ${fullMessage.substring(0, 200)}...`);
            // El formato de respuesta del bus es: [len 5][service 5][status 2][payload]
            const status = fullMessage.substring(10, 12).trim();
            const messageContent = fullMessage.substring(12);

            if (responsePromise.resolve) { // Verificamos si hay una promesa esperando
                clearTimeout(responsePromise.timeout); // Limpiamos el timeout
                try {
                    const responseData = JSON.parse(messageContent);
                    if (status === 'OK') {
                        if (responseData.error) { // Error lógico del servicio
                            responsePromise.reject(new Error(responseData.error));
                        } else {
                            responsePromise.resolve(responseData);
                        }
                    } else { // NK del bus o error del servicio
                        responsePromise.reject(new Error(`Error del servicio (NK): ${responseData.message || messageContent}`));
                    }
                } catch (e) {
                    responsePromise.reject(new Error(`Error al procesar respuesta del servidor: ${e.message}`));
                }
                // Limpiamos la promesa para la siguiente solicitud
                responsePromise = {};
            }
        }
    });

    clientSocket.on('close', () => {
        console.log('\n[Cliente] Conexión cerrada.');
        if (mongoose.connection.readyState === 1) {
            mongoose.connection.close().then(() => process.exit(0));
        } else {
            process.exit(0);
        }
    });

    clientSocket.on('error', (err) => {
        console.error('\n[Cliente] Error de conexión:', err.message);
        if (mongoose.connection.readyState === 1) {
            mongoose.connection.close().then(() => process.exit(1));
        } else {
            process.exit(1);
        }
    });
}

// --- MENÚ Y LÓGICA DE LA ACCIÓN ---
async function runMenu() {
    const inquirer = (await import('inquirer')).default;
    try {
        console.log('\n--- 📧 Cliente de Prueba de Notificaciones 📧 ---');
        const { email } = await inquirer.prompt([
            { type: 'input', name: 'email', message: 'Introduce el correo del destinatario:', default: 'cliente.prueba@email.com' }
        ]);
        
        // Creamos un payload de prueba con datos ficticios
        const testPayload = {
            action: 'send_email',
            payload: {
                to: email,
                order_id: 'TEST-12345',
                order_date: new Date().toISOString(),
                address: {
                    nombre_direccion: 'Casa de Prueba',
                    calle: 'Avenida Ficticia 123',
                    ciudad: 'Ciudad Demo',
                    region: 'Estado Ejemplo',
                    codigo_postal: '00000'
                },
                products: [
                    { nombre: 'Producto A', talla: 'M', color: 'Azul', cantidad: 1, precio_unitario: 25.50 },
                    { nombre: 'Producto B', talla: 'L', color: 'Rojo', cantidad: 2, precio_unitario: 15.00 }
                ],
                total_pagado: 55.50,
                mensaje: "Este es un correo de prueba generado por el cliente de notificaciones."
            }
        };

        console.log("\nEnviando solicitud para enviar correo de prueba...");
        const response = await sendRequest(testPayload);
        
        console.log('\n✅ ¡ÉXITO! El servicio de notificaciones respondió:');
        console.log(JSON.stringify(response, null, 2));

    } catch (error) {
        console.error(`\n❌ Error en el cliente: ${error.message}`);
    } finally {
        clientSocket.end();
    }
}

startClient();