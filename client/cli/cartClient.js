// clients/cartClient.js
const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js'); 
const User = require('../../database/models/user.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_TO_CALL = 'carro';

// Función para enviar solicitudes al bus
function sendRequest(requestPayload) {
    return new Promise((resolve, reject) => {
        const clientSocket = new net.Socket();
        clientSocket.connect(BUS_PORT, BUS_HOST, () => {
            const service = SERVICE_TO_CALL.padEnd(5, ' ');
            const payload = service + JSON.stringify(requestPayload);
            const header = String(payload.length).padStart(5, '0');
            clientSocket.write(header + payload);
        });

        clientSocket.on('data', data => {
            const raw = data.toString();
            const status = raw.substring(10, 12).trim();
            const msg = raw.substring(12);
            if (status === 'OK') {
                const resData = JSON.parse(msg);
                resData.status === 'error' ? reject(new Error(resData.message)) : resolve(resData);
            } else {
                reject(new Error(`Bus Error (NK): ${msg}`));
            }
            clientSocket.end();
        });
        clientSocket.on('error', err => reject(err));
    });
}

// Función para mostrar el carrito de forma clara
function displayCart(cart) {
    console.log("\n--- 🛒 Tu Carrito de Compras ---");
    if (!cart || !cart.items || cart.items.length === 0) {
        console.log("El carrito está vacío.");
        return;
    }

    let total = 0;
    cart.items.forEach((item, index) => {
        const subtotal = item.cantidad * item.precio_snapshot;
        total += subtotal;
        console.log(
            `${index + 1}. ${item.nombre_snapshot}\n` +
            `   Cantidad: ${item.cantidad} x $${item.precio_snapshot.toFixed(2)} = $${subtotal.toFixed(2)}`
        );
    });
    console.log("---------------------------------");
    console.log(`TOTAL DEL CARRITO: $${total.toFixed(2)}`);
    console.log(`Última actualización: ${new Date(cart.updated_at).toLocaleString()}`);
}

async function manageCartMenu(userId, inquirer) {
    let goBack = false;
    while (!goBack) {
        try {
            const cart = await sendRequest({ action: 'view', user_id: userId });
            displayCart(cart);

            if (!cart || !cart.items || cart.items.length === 0) {
                goBack = true;
                continue;
            }

            const { cartAction } = await inquirer.prompt([{
                type: 'list', name: 'cartAction', message: 'Opciones del carrito:',
                choices: [
                    { name: '✏️ Modificar cantidad de un ítem', value: 'update' },
                    { name: '❌ Eliminar un ítem', value: 'remove' },
                    new inquirer.Separator(),
                    { name: '↩️ Volver al menú principal', value: 'back' }
                ]
            }]);

            if (cartAction === 'back') {
                goBack = true;
                continue;
            }

            const { itemToModify } = await inquirer.prompt([{
                type: 'list', name: 'itemToModify', message: `Selecciona el ítem a ${cartAction === 'update' ? 'modificar' : 'eliminar'}:`,
                choices: cart.items.map((item, i) => ({
                    name: `${i + 1}. ${item.nombre_snapshot} (Cant: ${item.cantidad})`,
                    value: item.producto_variacion_id
                }))
            }]);

            if (cartAction === 'update') {
                const { newQty } = await inquirer.prompt([{
                    type: 'number', name: 'newQty', message: 'Ingresa la nueva cantidad:',
                    validate: input => input > 0 || 'La cantidad debe ser mayor a 0.'
                }]);
                await sendRequest({ action: 'update', user_id: userId, producto_variacion_id: itemToModify, nueva_cantidad: newQty });
                console.log("✅ Cantidad actualizada.");
            } else if (cartAction === 'remove') {
                await sendRequest({ action: 'remove', user_id: userId, producto_variacion_id: itemToModify });
                console.log("✅ Ítem eliminado.");
            }

        } catch (error) {
            console.error("\n❌ Error en la gestión del carrito:", error.message);
            // Pausa para que el usuario lea el error
            await inquirer.prompt([{type: 'input', name: 'continue', message: 'Presiona ENTER para continuar...'}]);
        }
    }
}


async function startClient() {
    await connectDB();
    const inquirer = (await import('inquirer')).default;

    try {
        const { userEmail } = await inquirer.prompt([{ type: 'input', name: 'userEmail', message: '👤 Introduce tu correo para gestionar el carrito:' }]);
        const usuario = await User.findOne({ correo: userEmail.toLowerCase().trim() });
        if (!usuario) throw new Error(`Usuario '${userEmail}' no encontrado.`);
        console.log(`✅ Bienvenido, ${usuario.correo}.`);
        
        let exit = false;
        while(!exit) {
            const { action } = await inquirer.prompt([{
                type: 'list', name: 'action', message: '¿Qué deseas hacer?',
                choices: [
                    { name: '➕ Añadir Producto al Carrito', value: 'add' },
                    { name: '👀 Ver y Gestionar mi Carrito', value: 'view' },
                    new inquirer.Separator(),
                    { name: '🚪 Salir', value: 'exit' }
                ]
            }]);

            switch(action) {
                case 'add':
                    const { producto_id } = await inquirer.prompt([{ type: 'input', name: 'producto_id', message: 'Introduce el ID del producto a añadir:' }]);
                    const { cantidad } = await inquirer.prompt([{ type: 'number', name: 'cantidad', message: 'Introduce la cantidad:', default: 1 }]);
                    await sendRequest({ action: 'add', user_id: usuario._id.toString(), producto_id: producto_id.trim(), cantidad });
                    console.log("✅ ¡Producto añadido al carrito!");
                    break;
                case 'view':
                    await manageCartMenu(usuario._id.toString(), inquirer);
                    break;
                case 'exit':
                    exit = true;
                    console.log("\n👋 ¡Hasta luego!");
                    break;
            }
        }

    } catch (error) {
        console.error("\n❌ Ha ocurrido un error en el cliente:", error.message);
    } finally {
        if (mongoose.connection.readyState === 1) {
            mongoose.connection.close();
        }
    }
}

startClient();