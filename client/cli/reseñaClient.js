const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js');
const User = require('../../database/models/user.model.js');
const Order = require('../../database/models/order.model.js');
const Product = require('../../database/models/product.model.js'); 

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_TO_CALL = 'rview'; 

// Función para construir y enviar el mensaje según el protocolo del bus
function sendMessage(socket, serviceName, data) {
    const service = serviceName.padEnd(5, ' ');
    const payload = service + data;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;

    console.log(`[ReseñaCliente] -> Enviando a '${serviceName}': ${fullMessage.substring(0, 150)}...`); 
    socket.write(fullMessage);
}

// Función principal que controla el flujo de ejecución
async function startClient() {
    // 1. Conectar a la DB para obtener datos para las preguntas
    await connectDB();
    console.log('[ReseñaCliente] Conectado a la base de datos.');
    // 2. Iniciar la lógica interactiva
    await runInteractiveLogic();
    // Asegurar que la conexión DB se cierra después de que la lógica interactiva termine
    if (mongoose.connection.readyState === 1) {
        mongoose.connection.close();
        console.log('[ReseñaCliente] Conexión a la base de datos cerrada.');
    }
}

// Función que maneja toda la interacción con el usuario
async function runInteractiveLogic() {
    const inquirer = (await import('inquirer')).default;

    try {
        console.log('\n--- ✍️ Asistente para Crear Nueva Reseña ✍️ ---');

        // --- PASO 1: Identificar al Usuario ---
        const { userEmail } = await inquirer.prompt([{ type: 'input', name: 'userEmail', message: '👤 Introduce el correo del usuario:' }]);
        const usuario = await User.findOne({ correo: userEmail.toLowerCase().trim() });
        if (!usuario) {
            throw new Error(`Usuario con correo '${userEmail}' no encontrado.`);
        }
        console.log(`✅ Usuario encontrado: ${usuario.correo}`);

        // --- PASO 2: Mostrar Pedidos y Seleccionar Producto para Reseñar ---
        // Obtenemos las órdenes del usuario. Necesitamos los IDs de producto y variación de los ITEMS.
        // No populamos el producto entero aquí, solo listamos lo que hay en la orden.
        const orders = await Order.find({ user_id: usuario._id }).sort({ createdAt: -1 });

        if (!orders || orders.length === 0) {
            throw new Error("El usuario no tiene pedidos realizados.");
        }

        console.log('\n--- 📜 Tus Pedidos ---');
        const orderChoices = [];
        const itemDetailsMap = new Map(); // Para guardar los detalles del item seleccionado

        orders.forEach(order => {
            order.items.forEach(item => {
                const choiceName = `Pedido ${order._id.toString().substring(18)}... | ${item.cantidad}x ${item.nombre} (${item.talla}/${item.color}) | ID Variación: ${item.producto_variacion_id.toString().substring(18)}...`;
                const choiceValue = `${order._id.toString()}:${item.producto_variacion_id.toString()}`; // Usamos una clave compuesta
                orderChoices.push({ name: choiceName, value: choiceValue });
                // Guardamos los detalles del item para recuperarlos después
                itemDetailsMap.set(choiceValue, {
                    orderId: order._id.toString(),
                    productId: item.producto_id.toString(),
                    variationId: item.producto_variacion_id.toString(),
                    productName: item.nombre,
                    itemSnapshot: item // Guardamos todo el snapshot del item si es necesario
                });
            });
        });

        if (orderChoices.length === 0) {
             throw new Error("No hay productos en tus pedidos que puedan ser reseñados.");
        }

        const { selectedItemKey } = await inquirer.prompt([{
            type: 'list',
            name: 'selectedItemKey',
            message: '📦 Selecciona un producto de tus pedidos para reseñar:',
            choices: orderChoices
        }]);

        const selectedItem = itemDetailsMap.get(selectedItemKey);
        console.log(`✅ Producto seleccionado para reseñar: ${selectedItem.productName}`);

        // --- PASO 3: Capturar la Reseña ---
        console.log('\n--- ✨ Tu Reseña ---');
        const { puntuacion } = await inquirer.prompt([{
            type: 'number',
            name: 'puntuacion',
            message: '⭐ Puntuación (1-5):',
            default: 5,
            validate: (num) => (num >= 1 && num <= 5) || 'La puntuación debe ser entre 1 y 5.'
        }]);

        const { comentario } = await inquirer.prompt([{
            type: 'input',
            name: 'comentario',
            message: '💬 Comentario (opcional):'
        }]);


        // --- PASO 4: Construir y Enviar la Solicitud al Servicio Reseña ---
        const reviewRequest = {
            user_id: usuario._id.toString(),
            product_id: selectedItem.productId, // ID del producto maestro
            product_variation_id: selectedItem.variationId, // ID de la variación comprada (de la orden)
            puntuacion: puntuacion,
            comentario: comentario.trim()
        };

        const clientSocket = new net.Socket();
        clientSocket.connect(BUS_PORT, BUS_HOST, () => {
            console.log(`\n[ReseñaCliente] Conectado al bus en el puerto ${BUS_PORT}.`);
            sendMessage(clientSocket, SERVICE_TO_CALL, JSON.stringify(reviewRequest));
        });

        // --- PASO 5: Manejar la Respuesta del Servicio ---
        clientSocket.on('data', (data) => {
            const rawData = data.toString();
            console.log(`\n[ReseñaCliente] <- Respuesta cruda recibida: ${rawData}`);

            // El formato esperado de respuesta del bus es NNNNNSSSSS[OK/NK][DATOS_JSON]
            // Leemos los primeros 5 del header, luego 5 del service name, luego 2 del status.
            const serviceName = rawData.substring(5, 10).trim();
            const status = rawData.substring(10, 12).trim(); // 'OK' o 'NK'
            const message = rawData.substring(12); // El resto es el payload JSON

            console.log(`[ReseñaCliente] Respuesta de '${serviceName}' | Estado: ${status}`);

            if (status === 'OK') {
                try {
                    // El 'message' debería ser el JSON payload enviado por reseñaService
                    const responseData = JSON.parse(message);

                    // Verificamos si el JSON que recibimos es un error reportado por la lógica del servicio o un éxito
                    if (responseData.status === 'error') {
                        console.error(`❌ Error reportado por el servicio '${SERVICE_TO_CALL}': ${responseData.message}`);
                    } else {
                        console.log('✅ ¡ÉXITO! Reseña procesada correctamente:');
                        console.log(JSON.stringify(responseData, null, 2)); // Imprimimos la respuesta exitosa
                    }

                } catch (e) {
                    console.error("[ReseñaCliente] Error al parsear la respuesta JSON del servicio:", e.message);
                    console.error("Respuesta recibida:", message); // Mostrar el mensaje crudo que falló el parseo
                }
            } else { // 'NK' del bus - indica un problema en el bus o el servicio no respondió a tiempo
                console.error(`❌ El bus reportó un error (NK) al llamar a '${SERVICE_TO_CALL}': ${message}`);
            }
            clientSocket.end(); // Cerrar conexión después de recibir respuesta
        });

        clientSocket.on('close', () => {
            console.log('[ReseñaCliente] Conexión al bus cerrada.');
            // La conexión DB se cierra en startClient
        });

        clientSocket.on('error', (err) => {
            console.error('[ReseñaCliente] Error de conexión al bus:', err.message);
            // La conexión DB se cierra en startClient
            // Asegurarse de cerrar el socket si hay un error de conexión
            clientSocket.destroy();
        });

    } catch (error) {
        console.error("\n❌ Ha ocurrido un error en el cliente:", error.message);
    } finally {
        // El cierre de DB se maneja en startClient o en los handlers de socket/error.
        // No necesitamos cerrar aquí si startClient lo hace.
    }
}

startClient();