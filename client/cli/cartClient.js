const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js');
const User = require('../../database/models/user.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;

let clientSocket;
let responsePromise = {}; 
function header(n) { return String(n).padStart(5, '0'); }

function sendMessage(serviceName, data) {
    const service = serviceName.padEnd(5, ' ');
    const fullMessage = header(service.length + data.length) + service + data;
    console.log(`\n[Cliente] -> Enviando a '${serviceName}' (${fullMessage.length} bytes)`);
    clientSocket.write(fullMessage);
}

// Función que envía una solicitud y devuelve una promesa
function sendRequest(serviceName, requestPayload) {
    return new Promise((resolve, reject) => {
        if (responsePromise && responsePromise.reject) {
            console.warn("[Cliente] Cancelando promesa anterior antes de enviar nueva solicitud.");
            responsePromise.reject(new Error("Solicitud cancelada por envío de nueva solicitud."));
            responsePromise = {}; // Limpiar inmediatamente
        }

        // Almacenamos las funciones de resolución/rechazo para usarlas en el 'data' handler
        responsePromise = { resolve, reject, serviceName: serviceName }; // Guardar el nombre del servicio esperado
        
        // Convertimos el payload a JSON string antes de enviarlo
        const payloadString = JSON.stringify(requestPayload);
        
        // Enviamos el mensaje formateado
        sendMessage(serviceName, payloadString);

        const timeoutDuration = 5000; // 5 segundos 
        const timeout = setTimeout(() => {
            if (responsePromise && responsePromise.reject && responsePromise.serviceName === serviceName) {
                console.error(`[Cliente] Timeout de ${timeoutDuration}ms alcanzado para servicio '${serviceName}'.`);
                responsePromise.reject(new Error(`Timeout: El servidor ${serviceName} no respondió a tiempo (${timeoutDuration}ms).`));
                responsePromise = {}; 
            }
        }, timeoutDuration); 

        const originalResolve = resolve;
        const originalReject = reject;
        
        responsePromise.resolve = (value) => { 
            clearTimeout(timeout); 
            originalResolve(value); 
            responsePromise = {}; 
        };
        responsePromise.reject = (err) => { 
            clearTimeout(timeout); 
            originalReject(err); 
            responsePromise = {}; 
        };
    });
}

async function startClient() {
    try {
        await connectDB();
        const inquirer = (await import('inquirer')).default;
        clientSocket = new net.Socket();

        // Conectar el socket al bus
        clientSocket.connect(BUS_PORT, BUS_HOST, () => {
            console.log(`✅ [Cliente] Conectado al bus en ${BUS_PORT}.`);
            // Una vez conectado, mostramos el menú principal al usuario
            mainMenu(inquirer);
        });

        // --- MANEJADOR CENTRALIZADO DE DATOS ---
        let buffer = '';
        clientSocket.on('data', (data) => {
            buffer += data.toString();

            while (buffer.length >= 5) {
                const header = buffer.substring(0, 5);
                const length = parseInt(header, 10);

                if (isNaN(length) || length <= 0 || length > 100000) { 
                    console.error(`❌ [Cliente] Invalid or negative header length "${header}" (Parsed: ${length}). Clearing buffer.`);
                    buffer = ''; 
                    break;
                }

                const totalMessageLength = 5 + length;
                if (length > 100000) { 
                    console.error(`❌ [Cliente] Excessive message length ${length}. Possible buffer corruption. Clearing buffer.`);
                    buffer = '';
                    break;
                }


                if (buffer.length < totalMessageLength) {
                    break;
                }
                const fullMessage = buffer.substring(0, totalMessageLength);
                buffer = buffer.slice(totalMessageLength); 

                if (fullMessage.length < 12) { 
                    console.warn(`[Cliente] Message too short (${fullMessage.length} bytes) to contain service name and status. Ignoring.`);
                    continue; 
                }

                const serviceName = fullMessage.substring(5, 10).trim(); 
                const status = fullMessage.substring(10, 12).trim(); 
                const messageContent = fullMessage.substring(12);
                if (responsePromise && responsePromise.resolve && responsePromise.reject && serviceName === responsePromise.serviceName) {

                    try {
                        const responseData = JSON.parse(messageContent);
                        if (status === 'OK') {
                            if (responseData && responseData.error) {
                                responsePromise.reject(new Error(responseData.error));
                            } else {
                                responsePromise.resolve(responseData);
                            }
                        } else if (status === 'NK') { 
                            const errorMessage = (responseData && responseData.error) ? responseData.error : messageContent;
                            responsePromise.reject(new Error(`El bus/servicio ${serviceName} reportó un error (NK): ${errorMessage}`));
                        } else {
                            console.warn(`[Cliente] Message received with unknown status ('${status}') from service '${serviceName}'. Ignoring.`);
                        }
                    } catch (e) {
                        responsePromise.reject(new Error(`Error al procesar respuesta JSON del servidor '${serviceName}': ${e.message}. Mensaje original: ${messageContent}`));
                    }
                } else {
                    console.log(`[Cliente] -> Message received for service '${serviceName}' with status '${status}' but no matching promise pending. Ignoring.`);
                }
            }
        });

        clientSocket.on('close', () => {
            console.log('\n[Cliente] Conexión cerrada.');
            if (responsePromise && responsePromise.reject) {
                responsePromise.reject(new Error("Conexión cerrada inesperadamente por el servidor."));
                responsePromise = {};
            }
            if (mongoose.connection.readyState === 1) mongoose.connection.close();
            process.exit(0);
        });

        clientSocket.on('error', (err) => {
            console.error('\n❌ [Cliente] Error de conexión:', err.message);
            if (responsePromise && responsePromise.reject) {
                responsePromise.reject(new Error(`Error de conexión de socket: ${err.message}`));
                responsePromise = {};
            }
            if (mongoose.connection.readyState === 1) mongoose.connection.close();
            process.exit(1);
        });

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
        setTimeout(() => {
            if (clientSocket && !clientSocket.destroyed) {
                clientSocket.end();
            }
        }, 500); 
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

async function manageCartMenu(inquirer, usuario) {
    let goBack = false;
    let paymentSuccess = false; 

    while (!goBack && !paymentSuccess) {
        try { 
            console.log("Consultando carrito...");
            const cart = await sendRequest('carro', { action: 'view', user_id: usuario._id.toString() });
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
                // --- End Logic for 20% discount ---


                console.log("\nProcesando pago...");
                const ordenCreada = await sendRequest('pagos', { 
                    action: 'procesar_pago', 
                    payload: { 
                        user_id: usuario._id.toString(), 
                        direccion_id, 
                        metodo_pago_id,
                        pointsToUse: pointsToUse // Send 0 or 100
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
                    console.log("Enviando solicitud al servicio 'carro' para actualizar cantidad...");
                    await sendRequest('carro', { action: 'update', user_id: usuario._id.toString(), producto_variacion_id: itemToModify, nueva_cantidad: parseInt(newQty, 10) });
                    console.log("✅ Cantidad actualizada.");
                } else if (cartAction === 'remove') {
                    console.log("Enviando solicitud al servicio 'carro' para eliminar ítem...");
                    await sendRequest('carro', { action: 'remove', user_id: usuario._id.toString(), producto_variacion_id: itemToModify });
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