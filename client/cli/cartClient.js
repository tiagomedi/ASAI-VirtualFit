const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js');
const User = require('../../database/models/user.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;

let clientSocket;
let responsePromise = {};

function sendMessage(serviceName, data) {
    const service = serviceName.padEnd(5, ' ');
    const payload = service + data;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`\n[Cliente] -> Enviando a '${serviceName}': ${fullMessage.substring(0, 150)}...`);
    clientSocket.write(fullMessage);
}

function sendRequest(serviceName, requestPayload) {
    return new Promise((resolve, reject) => {
        responsePromise = { resolve, reject }; 
        sendMessage(serviceName, JSON.stringify(requestPayload));

        const timeout = setTimeout(() => {
            if (responsePromise.reject) {
                responsePromise.reject(new Error("Timeout: El servidor no respondió a tiempo (30s)."));
                responsePromise = {};
            }
        }, 1000);

        responsePromise.resolve = (value) => { clearTimeout(timeout); resolve(value); };
        responsePromise.reject = (err) => { clearTimeout(timeout); reject(err); };
    });
}

async function startClient() {
    await connectDB();
    const inquirer = (await import('inquirer')).default;
    clientSocket = new net.Socket();

    clientSocket.connect(BUS_PORT, BUS_HOST, () => {
        console.log(`[Cliente] Conectado al bus en ${BUS_PORT}.`);
        mainMenu(inquirer);
    });

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
            
            console.log(`\n[Cliente] <- Procesando mensaje: ${messageToProcess.substring(0, 200)}...`);
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
        const { userEmail } = await inquirer.prompt([{ type: 'input', name: 'userEmail', message: '👤 Introduce tu correo para gestionar el carrito:' }]);
        const usuario = await User.findOne({ correo: userEmail.toLowerCase().trim() });
        if (!usuario) throw new Error(`Usuario '${userEmail}' no encontrado.`);
        
        console.log(`✅ Bienvenido, ${usuario.correo}.`);

        let exit = false;
        while (!exit) {
            const { action } = await inquirer.prompt([{
                type: 'list', name: 'action', message: '¿Qué deseas hacer?',
                choices: [ { name: '➕ Añadir Producto al Carrito', value: 'add' }, { name: '👀 Ver y Gestionar mi Carrito', value: 'view' }, new inquirer.Separator(), { name: '🚪 Salir', value: 'exit' } ]
            }]);

            switch (action) {
                case 'add': await runAddLogic(inquirer, usuario._id.toString()); break;
                case 'view': 
                    const paymentSuccess = await manageCartMenu(inquirer, usuario);
                    if (paymentSuccess) {
                        exit = true; 
                    }
                    break;
                case 'exit': exit = true; break;
            }
        }
    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
    } finally {
        console.log("\n👋 ¡Hasta luego!");
        clientSocket.end();
    }
}

async function runAddLogic(inquirer, userId) {
    try {
        const { producto_id } = await inquirer.prompt([{ type: 'input', name: 'producto_id', message: 'Introduce el ID del producto a añadir:' }]);
        const { cantidad } = await inquirer.prompt([{ type: 'number', name: 'cantidad', message: 'Introduce la cantidad:', default: 1, validate: v => v > 0 || 'Debe ser > 0' }]);
        await sendRequest('carro', { action: 'add', user_id: userId, producto_id: producto_id.trim(), cantidad });
        console.log("✅ ¡Producto añadido al carrito!");
    } catch (error) {
        console.error(`\n❌ Error al añadir producto: ${error.message}`);
    }
}

function displayCart(cart) {
    console.log("\n--- 🛒 Tu Carrito de Compras ---");
    if (!cart || !cart.items || cart.items.length === 0) {
        console.log("El carrito está vacío.");
        return 0;
    }
    let total = 0;
    const cartObj = cart.toObject ? cart.toObject() : cart;
    cartObj.items.forEach((item, index) => {
        const subtotal = item.cantidad * item.precio_snapshot;
        total += subtotal;
        console.log(`${index + 1}. ${item.nombre_snapshot}\n   Cantidad: ${item.cantidad} x $${item.precio_snapshot.toFixed(2)} = $${subtotal.toFixed(2)}`);
    });
    console.log("---------------------------------");
    console.log(`TOTAL DEL CARRITO: $${total.toFixed(2)}`);
    return cartObj.items.length;
}

async function manageCartMenu(inquirer, usuario) {
    let goBack = false;
    let paymentSuccess = false;
    while (!goBack) {
        try {
            const cart = await sendRequest('carro', { action: 'view', user_id: usuario._id.toString() });
            const itemCount = displayCart(cart);

            if (itemCount === 0) {
                goBack = true;
                continue;
            }

            const { cartAction } = await inquirer.prompt([{
                type: 'list', name: 'cartAction', message: 'Opciones del carrito:',
                choices: [
                    { name: '💳 Proceder al Pago', value: 'pay' }, new inquirer.Separator(),
                    { name: '✏️ Modificar cantidad de un ítem', value: 'update' },
                    { name: '❌ Eliminar un ítem', value: 'remove' }, new inquirer.Separator(),
                    { name: '↩️ Volver al menú principal', value: 'back' }
                ]
            }]);
            
            if (cartAction === 'pay') {
                if (!usuario.direcciones?.length) throw new Error("No tienes direcciones guardadas para el envío.");
                if (!usuario.metodos_pago?.length) throw new Error("No tienes métodos de pago guardados.");

                const { direccion_id } = await inquirer.prompt([{ type: 'list', name: 'direccion_id', message: '🚚 Selecciona la dirección de envío:', choices: usuario.direcciones.map(d => ({ name: `${d.nombre_direccion}: ${d.calle}`, value: d._id.toString() })) }]);
                const { metodo_pago_id } = await inquirer.prompt([{ type: 'list', name: 'metodo_pago_id', message: '💳 Selecciona el método de pago:', choices: usuario.metodos_pago.map(p => ({ name: `${p.tipo} - ${p.detalle}`, value: p._id.toString() })) }]);

                console.log("Procesando pago...");
                const ordenCreada = await sendRequest('pagos', { action: 'procesar_pago', payload: { user_id: usuario._id.toString(), direccion_id, metodo_pago_id } });
                
                console.log('\n✅ ¡PAGO EXITOSO! Se ha creado la siguiente orden:');
                console.log(JSON.stringify(ordenCreada, null, 2));
                
                paymentSuccess = true;
                goBack = true;
                continue;
            }

            if (cartAction === 'back') { goBack = true; continue; }
            
            const cartObj = cart.toObject ? cart.toObject() : cart;
            const { itemToModify } = await inquirer.prompt([{
                type: 'list', name: 'itemToModify', message: `Selecciona el ítem a ${cartAction === 'update' ? 'modificar' : 'eliminar'}:`,
                choices: cartObj.items.map((item, i) => ({ name: `${i + 1}. ${item.nombre_snapshot}`, value: item.producto_variacion_id }))
            }]);

            if (cartAction === 'update') {
                const { newQty } = await inquirer.prompt([{ type: 'number', name: 'newQty', message: 'Ingresa la nueva cantidad:', validate: input => input > 0 || 'La cantidad debe ser > 0.' }]);
                await sendRequest('carro', { action: 'update', user_id: usuario._id.toString(), producto_variacion_id: itemToModify, nueva_cantidad: newQty });
                console.log("✅ Cantidad actualizada.");
            } else if (cartAction === 'remove') {
                await sendRequest('carro', { action: 'remove', user_id: usuario._id.toString(), producto_variacion_id: itemToModify });
                console.log("✅ Ítem eliminado.");
            }
        } catch (error) {
        console.error("\n❌ Error en la gestión del carrito:", error.message);
        paymentSuccess = true; // Indica al menú principal que debe salir.
        goBack = true; // Sale del menú del carrito.
        }
    }
    return paymentSuccess;
}
startClient();