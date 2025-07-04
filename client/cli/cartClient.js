const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js');
const User = require('../../database/models/user.model.js');

const CART_HOST = 'localhost';
const CART_DIRECT_PORT = 5004;

function sendRequest(requestPayload) {
    return new Promise((resolve, reject) => {
        const clientSocket = new net.Socket();
        clientSocket.setEncoding('utf8');
        
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout de 10s para la operación con el carrito en el puerto ${CART_DIRECT_PORT}`));
            clientSocket.destroy();
        }, 10000);

        clientSocket.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`Error de conexión al carrito en ${CART_HOST}:${CART_DIRECT_PORT} - ${err.message}`));
        });
        
        clientSocket.connect(CART_DIRECT_PORT, CART_HOST, () => {
            const payload = JSON.stringify(requestPayload);
            const fullMessage = String(payload.length).padStart(5, '0') + payload;
            clientSocket.write(fullMessage);
        });

        let responseBuffer = '';
        let processingComplete = false;
        
        clientSocket.on('data', (data) => {
            if (processingComplete) return;
            
            responseBuffer += data;
            const headerSize = 5;

            if (responseBuffer.length >= headerSize) {
                const expectedLength = parseInt(responseBuffer.substring(0, headerSize), 10);

                if (!isNaN(expectedLength) && responseBuffer.length >= headerSize + expectedLength) {
                    processingComplete = true;
                    const jsonString = responseBuffer.substring(headerSize, headerSize + expectedLength);

                    try {
                        const jsonData = JSON.parse(jsonString);
                        clearTimeout(timeout);
                        clientSocket.end();
                        
                        // Verificar si es un error
                        if (jsonData.status === 'error') {
                            reject(new Error(jsonData.message || 'Error del servicio de carrito'));
                        } else {
                            resolve(jsonData);
                        }
                    } catch (e) {
                        clearTimeout(timeout);
                        clientSocket.end();
                        reject(new Error(`Error al parsear JSON de respuesta: ${e.message}`));
                    }
                }
            }
        });
    });
}

async function startClient() {
    try {
        await connectDB();
        const inquirer = (await import('inquirer')).default;
        await mainMenu(inquirer);
    } catch (error) {
        console.error(`\n❌ Error durante la inicialización del cliente: ${error.message}`);
        process.exit(1);
    }
}

async function mainMenu(inquirer) {
    try {
        const { userEmail } = await inquirer.prompt([{ type: 'input', name: 'userEmail', message: '👤 Introduce tu correo para gestionar el carrito:' }]);

        const usuario = await User.findOne({ correo: userEmail.toLowerCase().trim() });
        
        if (!usuario) throw new Error(`Usuario '${userEmail}' no encontrado.`);
        
        console.log(`✅ Bienvenido, ${usuario.correo}. Tienes ${usuario.asai_points} ASAIpoints.`);

        let exit = false;
        while (!exit) {
            const { action } = await inquirer.prompt([{
                type: 'list', name: 'action', message: '¿Qué deseas hacer?',
                choices: [ 
                    { name: '🛒 Ver y Gestionar mi Carrito', value: 'view' }, 
                    new inquirer.Separator(), 
                    { name: '🚪 Salir', value: 'exit' } 
                ]
            }]);

            switch (action) {
                case 'view': 
                    const paymentSuccess = await manageCartMenu(inquirer, usuario);
                    if (paymentSuccess) {
                        exit = true; 
                    }
                    break;
                case 'exit': 
                    exit = true; 
                    break;
            }
        }
    } catch (error) {
        console.error(`\n❌ Error en el menú principal: ${error.message}`);
    } finally {
        console.log("\n👋 ¡Hasta luego!");
        if (mongoose.connection.readyState === 1) mongoose.connection.close();
        process.exit(0);
    }
}

function displayCart(cart) {
    console.log("\n--- 🛒 Tu Carrito de Compras ---");
    if (!cart || !cart.items || cart.items.length === 0) {
        console.log("El carrito está vacío.");
        return { itemCount: 0, total: 0 };
    }
    let total = 0;
    const cartObj = cart.toObject ? cart.toObject() : cart;
    
    cartObj.items.forEach((item, index) => {
        const subtotal = item.cantidad * item.precio_snapshot;
        total += subtotal;
        console.log(`${index + 1}. ${item.nombre_snapshot} (Var: ${item.talla}/${item.color})\n   Cantidad: ${item.cantidad} x $${item.precio_snapshot.toFixed(2)} = $${subtotal.toFixed(2)}`);
    });
    console.log("---------------------------------");
    console.log(`TOTAL DEL CARRITO: $${total.toFixed(2)}`);
    return { itemCount: cartObj.items.length, total: total };
}

// Función para enviar request al servicio de pagos usando el bus
function sendPaymentRequest(requestPayload) {
    return new Promise((resolve, reject) => {
        const clientSocket = new net.Socket();
        clientSocket.setEncoding('utf8');
        
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout de 10s para la operación con pagos en el puerto 5001`));
            clientSocket.destroy();
        }, 10000);

        clientSocket.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`Error de conexión al bus en localhost:5001 - ${err.message}`));
        });
        
        clientSocket.connect(5001, 'localhost', () => {
            const service = 'pagos'.padEnd(5, ' ');
            const payload = service + JSON.stringify(requestPayload);
            const fullMessage = String(payload.length).padStart(5, '0') + payload;
            clientSocket.write(fullMessage);
        });

        let responseBuffer = '';
        let processingComplete = false;
        
        clientSocket.on('data', (data) => {
            if (processingComplete) return;
            
            responseBuffer += data;
            const headerSize = 5;

            if (responseBuffer.length >= headerSize) {
                const expectedLength = parseInt(responseBuffer.substring(0, headerSize), 10);

                if (!isNaN(expectedLength) && responseBuffer.length >= headerSize + expectedLength) {
                    processingComplete = true;
                    const fullResponse = responseBuffer.substring(headerSize, headerSize + expectedLength);
                    // Formato del bus: [servicio 5 chars][status 2 chars][JSON]
                    const serviceFromResponse = fullResponse.substring(0, 5);
                    const statusFromResponse = fullResponse.substring(5, 7);
                    const jsonString = fullResponse.substring(7);

                    try {
                        clearTimeout(timeout);
                        clientSocket.end();
                        
                        if (statusFromResponse !== 'OK' && statusFromResponse.trim() !== 'OK') {
                            const errorData = JSON.parse(jsonString);
                            const errorMessage = errorData.error || errorData.message || `Error del servicio de pagos (Status: ${statusFromResponse})`;
                            reject(new Error(errorMessage));
                        } else {
                            const jsonData = JSON.parse(jsonString);
                            resolve(jsonData);
                        }
                    } catch (e) {
                        reject(new Error(`Error al parsear JSON de respuesta: ${e.message}`));
                    }
                }
            }
        });
    });
}

async function manageCartMenu(inquirer, usuario) {
    let goBack = false;
    let paymentSuccess = false; 

    while (!goBack && !paymentSuccess) {
        try { 
            console.log("Consultando carrito...");
            const cart = await sendRequest({ action: 'view', user_id: usuario._id.toString() });
            const { itemCount, total: currentCartTotal } = displayCart(cart); 

            if (itemCount === 0) {
                console.log("No hay productos en el carrito para gestionar o pagar.");
                goBack = true; 
                continue;
            }

            const { cartAction } = await inquirer.prompt([{
                type: 'list', name: 'cartAction', message: 'Opciones del carrito:',
                choices: [
                    { name: '💳 Proceder al Pago', value: 'pay', disabled: itemCount === 0 ? 'El carrito está vacío' : false }, 
                    new inquirer.Separator(),
                    { name: '✏️ Modificar cantidad de un ítem', value: 'update' },
                    { name: '❌ Eliminar un ítem', value: 'remove' }, 
                    new inquirer.Separator(),
                    { name: '↩️ Volver al menú principal', value: 'back' }
                ]
            }]);
            
            if (cartAction === 'pay') {
                if (!usuario.direcciones?.length) throw new Error("No tienes direcciones guardadas para el envío. Por favor, añade una antes de proceder al pago.");
                if (!usuario.metodos_pago?.length) throw new Error("No tienes métodos de pago guardados. Por favor, añade uno antes de proceder al pago.");

                const dirChoices = usuario.direcciones.map(d => ({ name: `${d.nombre_direccion}: ${d.calle}, ${d.ciudad}, ${d.region || ''} CP:${d.codigo_postal}`, value: d._id.toString() }));
                const metodoChoices = usuario.metodos_pago.map(p => ({ name: `${p.tipo} - ${p.detalle}`, value: p._id.toString() }));

                const { direccion_id } = await inquirer.prompt([{ type: 'list', name: 'direccion_id', message: '🚚 Selecciona la dirección de envío:', choices: dirChoices }]);
                const { metodo_pago_id } = await inquirer.prompt([{ type: 'list', name: 'metodo_pago_id', message: '💳 Selecciona el método de pago:', choices: metodoChoices }]);

                let pointsToUse = 0; 
                const POINTS_FOR_20_PERCENT_DISCOUNT = 100; 
                const DISCOUNT_PERCENTAGE = 0.20;

                if (usuario.asai_points >= POINTS_FOR_20_PERCENT_DISCOUNT && currentCartTotal > 0) {
                     const calculatedDiscountAmount = currentCartTotal * DISCOUNT_PERCENTAGE;
                    const { useDiscount } = await inquirer.prompt([{
                        type: 'confirm', name: 'useDiscount',
                        message: `Tienes ${usuario.asai_points} ASAIpoints. ¿Deseas usar ${POINTS_FOR_20_PERCENT_DISCOUNT} de ellos para obtener un 20% de descuento ($${calculatedDiscountAmount.toFixed(2)}) en tu compra ($${currentCartTotal.toFixed(2)})?`,
                        default: true
                    }]);

                    if (useDiscount) {
                        pointsToUse = POINTS_FOR_20_PERCENT_DISCOUNT; 
                        console.log(`✨ Decidiste usar ${pointsToUse} ASAIpoints para el descuento.`);
                    } else {
                        console.log('🚫 Decidiste no usar puntos para el descuento.');
                        pointsToUse = 0; 
                    }
                } else if (usuario.asai_points > 0) {
                    console.log(`ℹ️ Tienes ${usuario.asai_points} ASAIpoints, pero necesitas EXACTAMENTE ${POINTS_FOR_20_PERCENT_DISCOUNT} para el descuento del 20%.`);
                    pointsToUse = 0; 
                } else {
                    console.log('\nℹ️ No tienes ASAIpoints disponibles para usar.');
                    pointsToUse = 0; 
                }

                console.log("\nProcesando pago...");
                const ordenCreada = await sendPaymentRequest({ 
                    action: 'procesar_pago', 
                    payload: { 
                        user_id: usuario._id.toString(), 
                        direccion_id, 
                        metodo_pago_id,
                        pointsToUse: pointsToUse
                    } 
                });
                
                console.log('\n✅ ¡PAGO EXITOSO! Se ha creado la siguiente orden:');
                console.log(JSON.stringify(ordenCreada, null, 2));
                
                paymentSuccess = true; 
                goBack = true; 

                const updatedUsuario = await User.findById(usuario._id); 
                if(updatedUsuario) {
                    usuario.asai_points = updatedUsuario.asai_points; 
                    console.log(`\n✨ Tu nuevo saldo de ASAIpoints es: ${updatedUsuario.asai_points}`); 
                }

            } else if (cartAction === 'back') { 
                goBack = true; 
                continue; 
            } else if (cartAction === 'update' || cartAction === 'remove') {
                const cartObj = cart.toObject ? cart.toObject() : cart;
                if (cartObj.items.length === 0) {
                    console.log("No hay items en el carrito para realizar esta acción.");
                    continue; 
                }

                const { itemToModify } = await inquirer.prompt([{
                    type: 'list', name: 'itemToModify', message: `Selecciona el ítem a ${cartAction === 'update' ? 'modificar' : 'eliminar'}:`,
                    choices: cartObj.items.map((item, i) => ({ name: `${i + 1}. ${item.nombre_snapshot} (${item.cantidad} en carrito)`, value: item.producto_variacion_id.toString() }))
                }]);

                if (cartAction === 'update') {
                    const { newQty } = await inquirer.prompt([{ 
                        type: 'number', name: 'newQty', message: 'Ingresa la nueva cantidad:', 
                        validate: input => {
                            if (isNaN(input) || input <= 0) return 'La cantidad debe ser un número positivo.';
                            return true;
                        }
                    }]);
                    console.log("Enviando solicitud al servicio de carrito para actualizar cantidad...");
                    await sendRequest({ action: 'update', user_id: usuario._id.toString(), producto_variacion_id: itemToModify, nueva_cantidad: parseInt(newQty, 10) });
                    console.log("✅ Cantidad actualizada.");
                } else if (cartAction === 'remove') {
                    console.log("Enviando solicitud al servicio de carrito para eliminar ítem...");
                    await sendRequest({ action: 'remove', user_id: usuario._id.toString(), producto_variacion_id: itemToModify });
                    console.log("✅ Ítem eliminado.");
                }
            }
        } catch (error) { 
            console.error("\n❌ Error en la gestión del carrito:", error.message);
            goBack = true;
            paymentSuccess = false; 
        } 
    } 
    return paymentSuccess;
}

startClient();