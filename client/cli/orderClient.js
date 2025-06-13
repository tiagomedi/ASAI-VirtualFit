const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js'); 
const User = require('../../database/models/user.model.js');
const Product = require('../../database/models/product.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_TO_CALL = 'order';

function sendMessage(socket, serviceName, data) {
    const service = serviceName.padEnd(5, ' ');
    const payload = service + data;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`[Cliente] -> Enviando a '${serviceName}': ${fullMessage.substring(0, 150)}...`);
    socket.write(fullMessage);
}

async function startClient() {
    await connectDB();
    const inquirer = (await import('inquirer')).default;
    try {
        const { accion } = await inquirer.prompt([{
            type: 'list',
            name: 'accion',
            message: '¿Qué deseas hacer?',
            choices: [
                { name: 'Crear una nueva orden', value: 'create' },
                { name: 'Ver órdenes de un usuario', value: 'find' },
                new inquirer.Separator(),
                { name: 'Salir', value: 'exit' }
            ]
        }]);

        if (accion === 'create') {
            await runCreateOrderLogic();
        } else if (accion === 'find') {
            await runFindOrdersLogic();
        } else {
            console.log("\n¡Hasta luego!");
            await mongoose.connection.close();
        }
    } catch (error) {
        console.error("\n❌ Error:", error.message);
        if(mongoose.connection.readyState === 1) await mongoose.connection.close();
    }
}

async function runCreateOrderLogic() {
    const inquirer = (await import('inquirer')).default;
    try {
        console.log('\n--- 🛍️ Creando Nueva Orden Manualmente 🛍️ ---');
        const { userEmail } = await inquirer.prompt([{ type: 'input', name: 'userEmail', message: '👤 Introduce el correo del usuario:' }]);
        const usuario = await User.findOne({ correo: userEmail.toLowerCase().trim() });
        if (!usuario) throw new Error(`Usuario no encontrado.`);
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
        sendRequestToServer(ordenRequest);
    } catch (error) { throw error; }
}

async function runFindOrdersLogic() {
    const inquirer = (await import('inquirer')).default;
    try {
        console.log('\n--- 🔍 Buscando Órdenes de Usuario 🔍 ---');
        const { email } = await inquirer.prompt([{ type: 'input', name: 'email', message: 'Introduce el correo del usuario:' }]);
        const findRequest = { action: 'find_orders', payload: { email: email.trim().toLowerCase() } };
        sendRequestToServer(findRequest);
    } catch (error) { throw error; }
}

function sendRequestToServer(requestPayload) {
    const clientSocket = new net.Socket();
    let buffer = '';

    clientSocket.connect(BUS_PORT, BUS_HOST, () => {
        console.log(`\n[Cliente] Conectado al bus en ${BUS_PORT}.`);
        sendMessage(clientSocket, SERVICE_TO_CALL, JSON.stringify(requestPayload));
    });

    clientSocket.on('data', (data) => {
        buffer += data.toString();
        while (true) {
            if (buffer.length < 5) break;
            const length = parseInt(buffer.substring(0, 5), 10);
            if (isNaN(length) || buffer.length < 5 + length) break;
            
            const fullMessage = buffer.substring(0, 5 + length);
            buffer = buffer.substring(5 + length);
            
            console.log(`\n[Cliente] <- Respuesta recibida: ${fullMessage.substring(0, 200)}...`);
            const serviceName = fullMessage.substring(5, 10).trim();
            const status = fullMessage.substring(10, 12).trim();
            const messageContent = fullMessage.substring(12);

            console.log(`[Cliente] Respuesta de '${serviceName}' | Estado: ${status}`);
            try {
                const responseData = JSON.parse(messageContent);
                if (status === 'OK') {
                    if (requestPayload.action === 'find_orders') {
                        if (responseData.length === 0) {
                            console.log("✅ El usuario no tiene órdenes registradas.");
                        } else {
                            console.log(`✅ Se encontraron ${responseData.length} órdenes:`);
                            // --- SALIDA  ---
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
                    } else { // Crear orden
                        console.log('✅ ¡ÉXITO! Orden creada y guardada en la base de datos:');
                        console.log(JSON.stringify(responseData, null, 2));
                    }
                } else { // NK
                    console.error(`❌ Error del servicio: ${responseData.error}`);
                }
            } catch (e) {
                console.error(`Error al procesar respuesta: ${e.message}`);
            }
        }
    });

    clientSocket.on('close', () => { console.log('\n[Cliente] Conexión cerrada.'); mongoose.connection.close(); });
    clientSocket.on('error', (err) => { console.error('[Cliente] Error de conexión:', err.message); mongoose.connection.close(); });
}

startClient();