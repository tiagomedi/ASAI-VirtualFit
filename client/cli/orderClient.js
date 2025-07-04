const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js'); 
const User = require('../../database/models/user.model.js');
const Product = require('../../database/models/product.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_TO_CALL = 'order';

let clientSocket;
let responsePromise = {};

// Función de bajo nivel para enviar el mensaje formateado
function sendMessage(serviceName, data) {
    const service = serviceName.padEnd(5, ' ');
    const payload = service + data;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`[Cliente] -> Enviando a '${serviceName}': ${fullMessage.substring(0, 150)}...`);
    clientSocket.write(fullMessage);
}

// Función que envía una solicitud y devuelve una promesa
function sendRequest(requestPayload) {
    return new Promise((resolve, reject) => {
        responsePromise.resolve = resolve;
        responsePromise.reject = reject;
        sendMessage(SERVICE_TO_CALL, JSON.stringify(requestPayload));
        
        // Timeout para evitar que el cliente espere indefinidamente
        setTimeout(() => {
            if (responsePromise.reject) { // Verificamos si la promesa no ha sido resuelta/rechazada aún
                responsePromise.reject(new Error("No se encontro el usuario"));
            }
        }, 1000);
    });
}

// Función principal exportada que recibe el usuario logueado
async function startOrderClient(loggedInUser) {
    try {
        await connectDB();
        clientSocket = new net.Socket();
        
        // Conectamos el socket al bus
        clientSocket.connect(BUS_PORT, BUS_HOST, () => {
            console.log(`[Cliente] Conectado al bus en ${BUS_PORT}.`);
            // Una vez conectado, mostramos el menú principal al usuario
            runMenu(loggedInUser);
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
                const status = fullMessage.substring(10, 12).trim();
                const messageContent = fullMessage.substring(12);

                try {
                    const responseData = JSON.parse(messageContent);
                    if (status === 'OK') {
                        // Si el servicio nos devolvió un error lógico, lo rechazamos
                        if (responseData.error) {
                            responsePromise.reject(new Error(responseData.error));
                        } else {
                            // Si todo está bien, resolvemos la promesa con los datos
                            responsePromise.resolve(responseData);
                        }
                    } else { // NK del bus
                        responsePromise.reject(new Error(`El bus reportó un error (NK): ${messageContent}`));
                    }
                } catch (e) {
                    responsePromise.reject(new Error(`Error al procesar respuesta del servidor: ${e.message}`));
                }
                // Limpiamos la promesa para la siguiente solicitud
                responsePromise = {};
            }
        });

        clientSocket.on('close', () => {
            console.log('\n[Cliente] Conexión cerrada.');
            if (mongoose.connection.readyState === 1) mongoose.connection.close();
        });

        clientSocket.on('error', (err) => {
            console.error('\n[Cliente] Error de conexión:', err.message);
            if (mongoose.connection.readyState === 1) mongoose.connection.close();
        });
    } catch (error) {
        console.error(`\n❌ Error en el cliente de órdenes: ${error.message}`);
    }
}

// --- MENÚ Y LÓGICA DE LAS ACCIONES ---
async function runMenu(loggedInUser) {
    const inquirer = (await import('inquirer')).default;
    try {
        console.log(`\n✅ Accediendo a órdenes de ${loggedInUser.correo}!`);
        const { accion } = await inquirer.prompt([{ 
            type: 'list', 
            name: 'accion', 
            message: '¿Qué deseas hacer?', 
            choices: [ 
                { name: '🛍️ Crear una nueva orden', value: 'create' }, 
                { name: '📦 Ver mis órdenes', value: 'find' }, 
                new inquirer.Separator(), 
                { name: '↩️ Volver al menú principal', value: 'exit' } 
            ] 
        }]);
        
        if (accion === 'create') await runCreateOrderLogic(loggedInUser);
        else if (accion === 'find') await runFindOrdersLogic(loggedInUser);
        // else clientSocket.end(); // Cierra la conexión y sale

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        clientSocket.end();
    }
}

async function runCreateOrderLogic(loggedInUser) {
    const inquirer = (await import('inquirer')).default;
    try {
        console.log('\n--- 🛍️ Creando Nueva Orden Manualmente 🛍️ ---');
        
        if (!loggedInUser.direcciones?.length) throw new Error("No tienes direcciones.");
        if (!loggedInUser.metodos_pago?.length) throw new Error("No tienes métodos de pago.");

        const { direccion_id } = await inquirer.prompt([{ type: 'list', name: 'direccion_id', message: '🚚 Selecciona la dirección:', choices: loggedInUser.direcciones.map(d => ({ name: `${d.nombre_direccion}: ${d.calle}`, value: d._id.toString() })) }]);
        const { metodo_pago_id } = await inquirer.prompt([{ type: 'list', name: 'metodo_pago_id', message: '💳 Selecciona el pago:', choices: loggedInUser.metodos_pago.map(p => ({ name: `${p.tipo} - ${p.detalle}`, value: p._id.toString() })) }]);

        const items_para_orden = [];
        while (true) {
            console.log('\n--- 📦 Añadir Producto a la Orden ---');
            const { producto_id_str } = await inquirer.prompt([{ type: 'input', name: 'producto_id_str', message: 'Introduce el ID del producto:' }]);
            const producto = await Product.findById(producto_id_str.trim()).catch(() => null);
            if (!producto) { console.log('❌ Producto no encontrado.'); continue; }
            const { cantidad } = await inquirer.prompt([{ type: 'number', name: 'cantidad', message: 'Introduce la cantidad:', default: 1, validate: (n) => n > 0 || `Debe ser > 0` }]);
            items_para_orden.push({ producto_id: producto._id.toString(), cantidad: cantidad });
            console.log(`👍 Añadido: ${cantidad} x ${producto.nombre}`);
            const { confirmar } = await inquirer.prompt([{ type: 'confirm', name: 'confirmar', message: '¿Añadir otro producto?', default: false }]);
            if (!confirmar) break;
        }

        if (items_para_orden.length === 0) throw new Error("No se añadieron productos.");
        
        const ordenRequest = { action: 'create_order', payload: { user_id: loggedInUser._id.toString(), direccion_id, metodo_pago_id, items: items_para_orden } };
        
        console.log("\nEnviando solicitud para crear orden...");
        const responseData = await sendRequest(ordenRequest);
        
        console.log('\n✅ ¡ÉXITO! Orden creada y guardada en la base de datos:');
        console.log(JSON.stringify(responseData, null, 2));

        // Añadir menú después de crear la orden
        const { nextAction } = await inquirer.prompt([{
            type: 'list',
            name: 'nextAction',
            message: '¿Qué deseas hacer ahora?',
            choices: [
                { name: '🛍️ Crear otra orden', value: 'create' },
                { name: '📦 Ver mis órdenes', value: 'find' },
                new inquirer.Separator(),
                { name: '↩️ Volver al menú principal', value: 'main_menu' }
            ]
        }]);

        if (nextAction === 'create') {
            await runCreateOrderLogic(loggedInUser);
        } else if (nextAction === 'find') {
            await runFindOrdersLogic(loggedInUser);
        } else {
            // Volver al menú principal - cerrar conexión
            clientSocket.end();
        }

    } catch (error) {
        console.error(`\n❌ Error al crear la orden: ${error.message}`);
        clientSocket.end();
    }
}

async function runFindOrdersLogic(loggedInUser) {
    const inquirer = (await import('inquirer')).default;
    try {
        console.log('\n--- 🔍 Buscando Tus Órdenes 🔍 ---');
        const findRequest = { action: 'find_orders', payload: { email: loggedInUser.correo } };
        
        console.log("\nEnviando solicitud para buscar órdenes...");
        const responseData = await sendRequest(findRequest);
        
        if (responseData.length === 0) {
            console.log("\n✅ No tienes órdenes registradas.");
        } else {
            console.log(`\n✅ Se encontraron ${responseData.length} órdenes:`);
            responseData.forEach(orden => {
                console.log("\n=============================================");
                console.log(`  Orden ID:     ${orden._id}`);
                console.log(`  Fecha:        ${new Date(orden.createdAt).toLocaleString('es-ES')}`);
                console.log(`  Estado:       ${orden.estado}`);
                console.log(`  Total Pagado: $${(orden.total_pago || 0).toLocaleString('es-ES')}`);
                console.log(`  Nº de Items:  ${orden.itemCount}`);
                console.log("=============================================");
            });
        }

        // Añadir menú para volver al menú principal
        const { nextAction } = await inquirer.prompt([{
            type: 'list',
            name: 'nextAction',
            message: '¿Qué deseas hacer ahora?',
            choices: [
                { name: '🔄 Crear una nueva orden', value: 'create' },
                { name: '🔍 Buscar órdenes nuevamente', value: 'find' },
                new inquirer.Separator(),
                { name: '↩️ Volver al menú principal', value: 'main_menu' }
            ]
        }]);

        if (nextAction === 'create') {
            await runCreateOrderLogic(loggedInUser);
        } else if (nextAction === 'find') {
            await runFindOrdersLogic(loggedInUser);
        } else {
            // Volver al menú principal - cerrar conexión
            clientSocket.end();
        }
    } catch (error) {
        console.error(`\n❌ Error al buscar órdenes: ${error.message}`);
        clientSocket.end();
    }
}

// Exportar la función principal
module.exports = { startOrderClient };

// --- FUNCIÓN PRINCIPAL DE ARRANQUE ANTIGUA ---
async function oldStartClient() {
    await connectDB();
    clientSocket = new net.Socket();
    
    // Conectamos el socket al bus
    clientSocket.connect(BUS_PORT, BUS_HOST, () => {
        console.log(`[Cliente] Conectado al bus en ${BUS_PORT}.`);
        // Una vez conectado, mostramos el menú principal al usuario
        oldRunMenu();
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
            const status = fullMessage.substring(10, 12).trim();
            const messageContent = fullMessage.substring(12);

            try {
                const responseData = JSON.parse(messageContent);
                if (status === 'OK') {
                    // Si el servicio nos devolvió un error lógico, lo rechazamos
                    if (responseData.error) {
                        responsePromise.reject(new Error(responseData.error));
                    } else {
                        // Si todo está bien, resolvemos la promesa con los datos
                        responsePromise.resolve(responseData);
                    }
                } else { // NK del bus
                    responsePromise.reject(new Error(`El bus reportó un error (NK): ${messageContent}`));
                }
            } catch (e) {
                responsePromise.reject(new Error(`Error al procesar respuesta del servidor: ${e.message}`));
            }
            // Limpiamos la promesa para la siguiente solicitud
            responsePromise = {};
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

async function oldRunMenu() {
    const inquirer = (await import('inquirer')).default;
    try {
        const { accion } = await inquirer.prompt([{ type: 'list', name: 'accion', message: '¿Qué deseas hacer?', choices: [ { name: 'Crear una nueva orden', value: 'create' }, { name: 'Ver órdenes de un usuario', value: 'find' }, new inquirer.Separator(), { name: 'Salir', value: 'exit' } ] }]);
        
        if (accion === 'create') await oldRunCreateOrderLogic();
        else if (accion === 'find') await oldRunFindOrdersLogic();
        else clientSocket.end(); // Cierra la conexión y sale

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        clientSocket.end();
    }
}

async function oldRunCreateOrderLogic() {
    const inquirer = (await import('inquirer')).default;
    try {
        console.log('\n--- 🛍️ Creando Nueva Orden Manualmente 🛍️ ---');
        const { userEmail } = await inquirer.prompt([{ type: 'input', name: 'userEmail', message: '👤 Introduce el correo del usuario:' }]);
        const usuario = await User.findOne({ correo: userEmail.toLowerCase().trim() });
        if (!usuario) throw new Error(`Usuario con correo '${userEmail}' no encontrado.`);

        if (!usuario.direcciones?.length) throw new Error("El usuario no tiene direcciones.");
        if (!usuario.metodos_pago?.length) throw new Error("El usuario no tiene métodos de pago.");

        const { direccion_id } = await inquirer.prompt([{ type: 'list', name: 'direccion_id', message: '🚚 Selecciona la dirección:', choices: usuario.direcciones.map(d => ({ name: `${d.nombre_direccion}: ${d.calle}`, value: d._id.toString() })) }]);
        const { metodo_pago_id } = await inquirer.prompt([{ type: 'list', name: 'metodo_pago_id', message: '💳 Selecciona el pago:', choices: usuario.metodos_pago.map(p => ({ name: `${p.tipo} - ${p.detalle}`, value: p._id.toString() })) }]);

        const items_para_orden = [];
        while (true) {
            console.log('\n--- 📦 Añadir Producto a la Orden ---');
            const { producto_id_str } = await inquirer.prompt([{ type: 'input', name: 'producto_id_str', message: 'Introduce el ID del producto:' }]);
            const producto = await Product.findById(producto_id_str.trim()).catch(() => null);
            if (!producto) { console.log('❌ Producto no encontrado.'); continue; }
            const { cantidad } = await inquirer.prompt([{ type: 'number', name: 'cantidad', message: 'Introduce la cantidad:', default: 1, validate: (n) => n > 0 || `Debe ser > 0` }]);
            items_para_orden.push({ producto_id: producto._id.toString(), cantidad: cantidad });
            console.log(`👍 Añadido: ${cantidad} x ${producto.nombre}`);
            const { confirmar } = await inquirer.prompt([{ type: 'confirm', name: 'confirmar', message: '¿Añadir otro producto?', default: false }]);
            if (!confirmar) break;
        }

        if (items_para_orden.length === 0) throw new Error("No se añadieron productos.");
        
        const ordenRequest = { action: 'create_order', payload: { user_id: usuario._id.toString(), direccion_id, metodo_pago_id, items: items_para_orden } };
        
        console.log("\nEnviando solicitud para crear orden...");
        const responseData = await sendRequest(ordenRequest);
        
        console.log('\n✅ ¡ÉXITO! Orden creada y guardada en la base de datos:');
        console.log(JSON.stringify(responseData, null, 2));

    } catch (error) {
        console.error(`\n❌ Error al crear la orden: ${error.message}`);
    } finally {
        clientSocket.end();
    }
}

async function oldRunFindOrdersLogic() {
    const inquirer = (await import('inquirer')).default;
    try {
        console.log('\n--- 🔍 Buscando Órdenes de Usuario 🔍 ---');
        const { email } = await inquirer.prompt([{ type: 'input', name: 'email', message: 'Introduce el correo del usuario:' }]);
        const findRequest = { action: 'find_orders', payload: { email: email.trim().toLowerCase() } };
        
        console.log("\nEnviando solicitud para buscar órdenes...");
        const responseData = await sendRequest(findRequest);
        
        if (responseData.length === 0) {
            console.log("\n✅ El usuario existe pero no tiene órdenes registradas.");
        } else {
            console.log(`\n✅ Se encontraron ${responseData.length} órdenes:`);
            responseData.forEach(orden => {
                console.log("\n=============================================");
                console.log(`  Orden ID:     ${orden._id}`);
                console.log(`  Fecha:        ${new Date(orden.createdAt).toLocaleString('es-ES')}`);
                console.log(`  Estado:       ${orden.estado}`);
                console.log(`  Total Pagado: $${(orden.total_pago || 0).toLocaleString('es-ES')}`);
                console.log(`  Nº de Items:  ${orden.itemCount}`);
                console.log("=============================================");
            });
        }
    } catch (error) {
        console.error(`\n❌ Error al buscar órdenes: ${error.message}`);
    } finally {
        clientSocket.end();
    }
}

// Solo ejecutar directamente si es llamado como script principal
if (require.main === module) {
    oldStartClient();
}