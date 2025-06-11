const net = require('net');
const { v4: uuidv4 } = require('uuid');
const { connectDB, mongoose } = require('../../database/db.js'); 
const User = require('../../database/models/user.model.js');
const Product = require('../../database/models/product.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const CLIENT_ID = uuidv4().substring(0, 5);
const SERVICE_TO_CALL = 'order';

function sendMessage(socket, service, message) {
    const payload = service + message;
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;
    console.log(`[Cliente] -> Enviando a '${service}': ${fullMessage.substring(0, 100)}...`);
    socket.write(fullMessage);
}
const client = new net.Socket();

async function startClient() {
    console.log("⏳ Conectando a la base de datos para obtener datos...");
    await connectDB();
    console.log("✅ Conexión a la base de datos establecida.");
    await runInteractiveLogic();
}

async function runInteractiveLogic() {
    const inquirer = (await import('inquirer')).default;

    try {
        console.log('\n--- 🛍️ Asistente para Crear Nueva Orden 🛍️ ---');

        const { userEmail } = await inquirer.prompt([
            { type: 'input', name: 'userEmail', message: '👤 Introduce el correo del usuario:' }
        ]);

        const usuario = await User.findOne({ correo: userEmail.toLowerCase().trim() });
        if (!usuario) {
            console.error(`❌ Error: No se encontró un usuario con el correo '${userEmail}'.`);
            await mongoose.connection.close();
            return;
        }
        console.log(`✅ Usuario encontrado: ${usuario.correo} (ID: ${usuario._id})`);

        if (!usuario.direcciones || usuario.direcciones.length === 0) {
            console.error(`❌ Error: El usuario no tiene direcciones guardadas.`);
            await mongoose.connection.close();
            return;
        }
        if (!usuario.metodos_pago || usuario.metodos_pago.length === 0) {
            console.error(`❌ Error: El usuario no tiene métodos de pago guardados.`);
            await mongoose.connection.close();
            return;
        }

        const { direccion_id } = await inquirer.prompt([{
            type: 'list',
            name: 'direccion_id',
            message: '🚚 Selecciona la dirección de envío:',
            choices: usuario.direcciones.map(d => ({
                name: `${d.nombre_direccion}: ${d.calle}, ${d.ciudad}`,
                value: d._id.toString()
            }))
        }]);
        
        const { metodo_pago_id } = await inquirer.prompt([{
            type: 'list',
            name: 'metodo_pago_id',
            message: '💳 Selecciona el método de pago:',
            choices: usuario.metodos_pago.map(p => ({
                name: `${p.tipo} - ${p.detalle}`,
                value: p._id.toString()
            }))
        }]);

        // --- SECCIÓN PARA AÑADIR PRODUCTOS  ---
        const items_para_orden = [];
        let seguirAñadiendo = true;

        while (seguirAñadiendo) {
            console.log('\n--- 📦 Añadir Producto a la Orden ---');
            const { producto_id_str } = await inquirer.prompt([{
                type: 'input', name: 'producto_id_str', message: 'Introduce el ID del producto:'
            }]);

            let producto;
            try {
                producto = await Product.findById(producto_id_str.trim());
            } catch (error) {
                console.log('❌ ID de producto inválido. Inténtalo de nuevo.');
                continue;
            }

            if (!producto) {
                console.log('❌ Producto no encontrado. Inténtalo de nuevo.');
                continue;
            }

            if (!producto.variaciones || producto.variaciones.length === 0) {
                console.log('❌ Este producto no tiene variaciones (talla/color) disponibles.');
                continue;
            }

            const { variacion_id } = await inquirer.prompt([{
                type: 'list',
                name: 'variacion_id',
                message: `Selecciona una variación para "${producto.nombre}":`,
                choices: producto.variaciones.map(v => ({
                    name: `Talla: ${v.talla}, Color: ${v.color}, Precio: $${v.precio}, Stock: ${v.stock}`,
                    value: v._id.toString(),
                    disabled: v.stock === 0 ? 'Agotado' : false
                }))
            }]);
            
            const variacion_seleccionada = producto.variaciones.id(variacion_id);

            const { cantidad } = await inquirer.prompt([{
                type: 'number',
                name: 'cantidad',
                message: 'Introduce la cantidad:',
                default: 1,
                validate: (num) => {
                    if (num <= 0) return 'La cantidad debe ser mayor que cero.';
                    if (num > variacion_seleccionada.stock) {
                        return `La cantidad no puede ser mayor que el stock disponible (${variacion_seleccionada.stock}).`;
                    }
                    return true;
                }
            }]);

            items_para_orden.push({
                producto_id: producto._id.toString(),
                producto_variacion_id: variacion_id,
                cantidad: cantidad
            });

            console.log(`👍 Añadido: ${cantidad} x ${producto.nombre} (${variacion_seleccionada.talla}, ${variacion_seleccionada.color})`);

            const { confirmar } = await inquirer.prompt([{
                type: 'confirm', name: 'confirmar', message: '¿Deseas añadir otro producto?', default: false
            }]);
            seguirAñadiendo = confirmar;
        }
        // ----------------------------------------------------

        if (items_para_orden.length === 0) {
            console.log('🛒 Carrito vacío. Abortando la creación de la orden.');
            await mongoose.connection.close();
            return;
        }

        // --- SECCIÓN PARA ENVIAR LA ORDEN ---
        console.log('\n⏳ Conectando al BUS SOA para enviar la orden...');

        client.connect(BUS_PORT, BUS_HOST, () => {
            console.log('[Cliente] Conectado al bus.');
            sendMessage(client, 'sinit', CLIENT_ID);

            const ordenRequest = {
                clientId: CLIENT_ID,
                user_id: usuario._id.toString(),
                direccion_id: direccion_id,
                metodo_pago_id: metodo_pago_id,
                items: items_para_orden
            };
            
            sendMessage(client, SERVICE_TO_CALL, JSON.stringify(ordenRequest));
            console.log('\n[Cliente] Solicitud de orden enviada. Esperando respuesta del servicio...');
        });
        // --------------------------------------------------

    } catch (error) {
        console.error("Ha ocurrido un error inesperado en el cliente:", error);
        await mongoose.connection.close();
    }
}

client.on('data', (data) => {
    const rawData = data.toString();
    const length = parseInt(rawData.substring(0, 5), 10);
    if(isNaN(length) || length === 0) return;
    
    const payload = rawData.substring(5, 5 + length);
    const sender = payload.substring(0, 5).trim();
    const message = payload.substring(5);

    if (sender === 'sinit') {
        console.log('[Cliente] Registro en el bus confirmado.');
        return;
    }

    console.log(`\n[Cliente] Respuesta recibida de '${sender}':`);
    try {
        const response = JSON.parse(message);
        if (response.status === 'success') {
            console.log('✅ ¡Éxito! Orden creada correctamente:');
            console.log(JSON.stringify(response.data, null, 2));
        } else {
            console.error(`❌ Error del servicio: ${response.message}`);
        }
    } catch(e) {
        console.error("Error al procesar la respuesta del servidor:", message);
    }

    client.end();
});

client.on('close', async () => {
    console.log('[Cliente] Conexión al bus cerrada.');
    await mongoose.connection.close();
    console.log('[Cliente] Conexión a la base de datos cerrada.');
});

client.on('error', async (err) => {
    console.error(`[Cliente] Error de conexión con el bus: ${err.message}`);
    await mongoose.connection.close();
});

startClient();