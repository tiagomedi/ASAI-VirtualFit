const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js'); 
const User = require('../../database/models/user.model.js');
const Product = require('../../database/models/product.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_TO_CALL = 'order';

// Función para construir y enviar el mensaje según el protocolo del bus
function sendMessage(socket, serviceName, data) {
    const service = serviceName.padEnd(5, ' ');
    const payload = service + data;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;

    console.log(`[Cliente] -> Enviando a '${serviceName}': ${fullMessage.substring(0, 150)}...`);
    socket.write(fullMessage);
}

// Función principal que controla el flujo de ejecución
async function startClient() {
    // 1. Conectar a la DB para obtener datos para las preguntas
    await connectDB();
    // 2. Iniciar la lógica interactiva
    await runInteractiveLogic();
}

// Función que maneja toda la interacción con el usuario
async function runInteractiveLogic() {
    const inquirer = (await import('inquirer')).default;

    try {
        console.log('\n--- 🛍️ Asistente para Crear Nueva Orden 🛍️ ---');

        // --- PASO 1: Identificar al Usuario ---
        const { userEmail } = await inquirer.prompt([{ type: 'input', name: 'userEmail', message: '👤 Introduce el correo del usuario:' }]);
        const usuario = await User.findOne({ correo: userEmail.toLowerCase().trim() });
        if (!usuario) throw new Error(`Usuario con correo '${userEmail}' no encontrado.`);
        console.log(`✅ Usuario encontrado: ${usuario.correo}`);

        // --- Validaciones de datos del usuario ---
        if (!usuario.direcciones || usuario.direcciones.length === 0) throw new Error("El usuario no tiene direcciones guardadas.");
        if (!usuario.metodos_pago || usuario.metodos_pago.length === 0) throw new Error("El usuario no tiene métodos de pago guardados.");

        // --- PASO 2: Seleccionar Dirección y Pago ---
        const { direccion_id } = await inquirer.prompt([{ type: 'list', name: 'direccion_id', message: '🚚 Selecciona la dirección de envío:', choices: usuario.direcciones.map(d => ({ name: `${d.nombre_direccion}: ${d.calle}`, value: d._id.toString() })) }]);
        const { metodo_pago_id } = await inquirer.prompt([{ type: 'list', name: 'metodo_pago_id', message: '💳 Selecciona el método de pago:', choices: usuario.metodos_pago.map(p => ({ name: `${p.tipo} - ${p.detalle}`, value: p._id.toString() })) }]);

        // --- PASO 3: Añadir Productos a la Orden (versión simplificada) ---
        const items_para_orden = [];
        let seguirAñadiendo = true;
        while (seguirAñadiendo) {
            console.log('\n--- 📦 Añadir Producto a la Orden ---');
            const { producto_id_str } = await inquirer.prompt([{ type: 'input', name: 'producto_id_str', message: 'Introduce el ID del producto:' }]);
            
            let producto;
            try {
                producto = await Product.findById(producto_id_str.trim());
            } catch (e) {
                console.log('❌ ID de producto inválido. Inténtalo de nuevo.');
                continue;
            }

            if (!producto) { console.log('❌ Producto no encontrado.'); continue; }

            const { cantidad } = await inquirer.prompt([{ type: 'number', name: 'cantidad', message: 'Introduce la cantidad:', default: 1, validate: (num) => num > 0 || `La cantidad debe ser mayor que cero.` }]);
            
            items_para_orden.push({ 
                producto_id: producto._id.toString(),
                cantidad: cantidad 
            });
            console.log(`👍 Añadido: ${cantidad} x ${producto.nombre}`);
            
            const { confirmar } = await inquirer.prompt([{ type: 'confirm', name: 'confirmar', message: '¿Deseas añadir otro producto?', default: false }]);
            seguirAñadiendo = confirmar;
        }

        if (items_para_orden.length === 0) throw new Error("No se añadieron productos. Proceso cancelado.");

        // --- PASO 4: Construir y Enviar la Solicitud ---
        const ordenRequest = { user_id: usuario._id.toString(), direccion_id, metodo_pago_id, items: items_para_orden };

        const clientSocket = new net.Socket();
        clientSocket.connect(BUS_PORT, BUS_HOST, () => {
            console.log(`\n[Cliente] Conectado al bus en el puerto ${BUS_PORT}.`);
            sendMessage(clientSocket, SERVICE_TO_CALL, JSON.stringify(ordenRequest));
        });

        // --- PASO 5: Manejar la Respuesta del Servicio (LÓGICA FINAL) ---
        clientSocket.on('data', (data) => {
            const rawData = data.toString();
            console.log(`\n[Cliente] <- Respuesta cruda recibida: ${rawData}`);
            
            const serviceName = rawData.substring(5, 10).trim();
            const status = rawData.substring(10, 12).trim(); // Leemos el OK/NK del bus
            const message = rawData.substring(12); // El resto debería ser el JSON

            console.log(`[Cliente] Respuesta de '${serviceName}' | Estado: ${status}`);
            
            if (status === 'OK') {
                try {
                    // El 'message' ahora debería ser un JSON limpio
                    const responseData = JSON.parse(message);

                    // Verificamos si el JSON que recibimos es un error o un éxito
                    if (responseData.status === 'error') {
                        console.error(`❌ Error reportado por el servicio: ${responseData.message}`);
                    } else {
                        console.log('✅ ¡ÉXITO! Orden creada y guardada en la base de datos:');
                        console.log(JSON.stringify(responseData, null, 2));
                    }

                } catch (e) {
                    console.error("Error al parsear la respuesta JSON:", e.message);
                }
            } else { // NK del bus
                console.error(`❌ El bus reportó un error (NK): ${message}`);
            }
            clientSocket.end();
        });

        clientSocket.on('close', () => {
            console.log('[Cliente] Conexión cerrada.');
            mongoose.connection.close();
        });

        clientSocket.on('error', (err) => {
            console.error('[Cliente] Error de conexión:', err.message);
            mongoose.connection.close();
        });

    } catch (error) {
        console.error("\n❌ Ha ocurrido un error en el cliente:", error.message);
        if(mongoose.connection.readyState === 1) {
            mongoose.connection.close();
        }
    }
}

startClient();