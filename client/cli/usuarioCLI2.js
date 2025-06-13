// client/cli/usuarioCLI.js (Versión Unificada)

const net = require('net');
const { v4: uuidv4 } = require('uuid');
const { connectDB, mongoose } = require('../../database/db.js');
const User = require('../../database/models/user.model.js');
const Order = require('../../database/models/order.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const CLIENT_ID = uuidv4().substring(0, 5);

// --- Funciones de Comunicación y Visualización ---

function sendRequest(serviceName, requestPayload) {
    return new Promise((resolve, reject) => {
        const clientSocket = new net.Socket();
        
        clientSocket.on('connect', () => {
            const clientIdPayload = { ...requestPayload, clientId: CLIENT_ID };
            const service = serviceName.padEnd(5, ' ');
            const payload = service + JSON.stringify(clientIdPayload);
            const header = String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0');
            const fullMessage = header + payload;
            
            console.log(`\n[Cliente] -> Enviando a '${serviceName}'...`);
            clientSocket.write(fullMessage);
        });

        let buffer = '';
        clientSocket.on('data', (data) => {
            buffer += data.toString();
            while (true) {
                if (buffer.length < 5) break;
                const length = parseInt(buffer.substring(0, 5), 10);
                if (isNaN(length) || buffer.length < 5 + length) break;
                
                const fullPayload = buffer.substring(5, 5 + length);
                buffer = buffer.substring(5 + length);
                const destinationId = fullPayload.substring(0, 5);
                
                if (destinationId === CLIENT_ID) {
                    const status = fullPayload.substring(5, 7).trim();
                    const message = fullPayload.substring(7);
                    
                    if (status === 'OK') {
                        try {
                            const responseData = JSON.parse(message);
                            if (responseData.status === 'error') {
                                reject(new Error(responseData.message));
                            } else {
                                resolve(responseData);
                            }
                        } catch (e) {
                            reject(new Error("Error al parsear la respuesta JSON del servicio."));
                        }
                    } else {
                        reject(new Error(`El bus reportó un error (NK) desde '${serviceName}': ${message}`));
                    }
                    clientSocket.end();
                    return;
                }
            }
        });

        clientSocket.on('error', (err) => reject(new Error(`Error de conexión al bus: ${err.message}`)));
        
        clientSocket.connect(BUS_PORT, BUS_HOST);
    });
}

function displayProducts(products, title = 'Catálogo de Productos') {
    if (!products || products.length === 0) {
        console.log(`\n-- No se encontraron productos en "${title}". --`);
        return;
    }
    console.log(`\n--- 📜 ${title} (${products.length} encontrados) ---\n`);
    products.forEach((p, index) => {
        console.log(`${index + 1}. 📦 ${p.nombre} [ID: ${p._id}]`);
        console.log(`   Marca: ${p.marca || 'N/A'}`);
        if (p.variaciones && p.variaciones.length > 0) {
            const v = p.variaciones[0];
            console.log(`   - Var: ${v.color || ''} ${v.talla || ''} | Precio: $${v.precio} | Stock: ${v.stock}`);
        } else {
            console.log("   - (Sin variaciones de precio/stock definidas)");
        }
        console.log('----------------------------------------------------');
    });
}

// --- Módulos de la Aplicación (Sub-menús) ---

async function handleProfile(inquirer, user) {
    console.log('\n--- 👤 Mi Perfil ---');
    console.log(`Correo: ${user.correo}`);
    console.log(`Rol: ${user.rol}`);
    console.log(`Puntos ASAI: ${user.asai_points || 0}`);
    console.log('Direcciones:', user.direcciones?.length > 0 ? user.direcciones.map(d => d.nombre_direccion).join(', ') : 'Ninguna');
    console.log('Métodos de Pago:', user.metodos_pago?.length > 0 ? user.metodos_pago.map(p => p.tipo).join(', ') : 'Ninguno');
    await inquirer.prompt([{type: 'input', name: 'continue', message: '\nPresiona ENTER para volver...'}]);
}

async function handleCatalog(inquirer, userId) {
    const { catalogAction } = await inquirer.prompt([{
        type: 'list', name: 'catalogAction', message: 'Acciones del catálogo:',
        choices: [
            '📚 Ver Catálogo Completo', '🔍 Buscar un producto', '📊 Aplicar Filtros',
            new inquirer.Separator(), '↩️ Volver'
        ]
    }]);

    if (catalogAction === '↩️ Volver') return;

    let products = [];
    try {
        switch (catalogAction) {
            case '📚 Ver Catálogo Completo':
                products = await sendRequest('catal', { action: 'list_all' });
                break;
            case '🔍 Buscar un producto':
                const { term } = await inquirer.prompt([{ type: 'input', name: 'term', message: 'Ingresa el término a buscar:' }]);
                if (term.trim()) products = await sendRequest('catal', { action: 'search', term });
                break;
            case '📊 Aplicar Filtros':
                // (Lógica de filtros omitida por brevedad, se puede añadir igual que antes)
                console.log('Funcionalidad de filtros no implementada en este menú unificado aún.');
                break;
        }

        displayProducts(products);

        if (products.length > 0) {
            await productActionMenu(inquirer, products, userId);
        }

    } catch (error) {
        console.error("\n❌ Error en el módulo de catálogo:", error.message);
    }
    await inquirer.prompt([{type: 'input', name: 'continue', message: '\nPresiona ENTER para continuar...'}]);
}

async function productActionMenu(inquirer, displayedProducts, userId) {
    // ... esta función es para añadir a carrito/deseos desde la vista de catálogo
    const { action } = await inquirer.prompt([{
        type: 'list', name: 'action', message: '¿Qué te gustaría hacer ahora?',
        choices: [
            { name: '🛒 Añadir al carrito', value: 'add_to_cart' },
            { name: '💖 Añadir a la lista de deseos', value: 'add_to_wishlist' },
            { name: '↩️ No hacer nada', value: 'back' }
        ]
    }]);

    if (action === 'back') return;

    const { product_to_act_on } = await inquirer.prompt([{
        type: 'list', name: 'product_to_act_on',
        message: 'Selecciona el producto:',
        choices: displayedProducts.map((p, i) => ({ name: `${i + 1}. ${p.nombre}`, value: p._id }))
    }]);

    if (action === 'add_to_cart') {
        const { cantidad } = await inquirer.prompt([{ type: 'number', name: 'cantidad', message: 'Cantidad:', default: 1 }]);
        await sendRequest('carro', { action: 'add', user_id: userId, producto_id: product_to_act_on, cantidad });
        console.log('✅ Producto añadido al carrito.');
    } else if (action === 'add_to_wishlist') {
        await sendRequest('deseo', { action: 'add', user_id: userId, producto_id: product_to_act_on });
        console.log('✅ Producto añadido a la lista de deseos.');
    }
}

async function handleCart(inquirer, userId) {
    try {
        const cart = await sendRequest('carro', { action: 'view', user_id: userId });
        console.log("\n--- 🛒 Tu Carrito de Compras ---");
        if (!cart || !cart.items || cart.items.length === 0) {
            console.log("El carrito está vacío.");
        } else {
            let total = 0;
            cart.items.forEach((item, index) => {
                const subtotal = item.cantidad * item.precio_snapshot;
                total += subtotal;
                console.log(`${index + 1}. ${item.nombre_snapshot} | ${item.cantidad} x $${item.precio_snapshot.toFixed(2)} = $${subtotal.toFixed(2)}`);
            });
            console.log(`----------------\nTOTAL: $${total.toFixed(2)}`);
        }
    } catch (error) {
        console.error("\n❌ Error viendo el carrito:", error.message);
    }
    await inquirer.prompt([{type: 'input', name: 'continue', message: '\nPresiona ENTER para volver...'}]);
}

async function handleWishlist(inquirer, userId) {
    try {
        const wishlistProducts = await sendRequest('deseo', { action: 'view', user_id: userId });
        displayProducts(wishlistProducts, 'Mi Lista de Deseos');
    } catch (error) {
        console.error("\n❌ Error viendo la lista de deseos:", error.message);
    }
    await inquirer.prompt([{type: 'input', name: 'continue', message: '\nPresiona ENTER para volver...'}]);
}

async function handleAdminTasks(inquirer, adminUser) {
    // Esta es la misma lógica que ya tenías, integrada aquí.
    while (true) {
        const { adminAction } = await inquirer.prompt([
            {
                type: 'list', name: 'adminAction', message: 'Menú de Administrador:',
                choices: ['Crear Producto', 'Editar Producto', 'Eliminar Producto', '↩️ Volver al menú principal'],
            },
        ]);

        if (adminAction === '↩️ Volver al menú principal') break;

        try {
            let operation = '';
            let payload = {};
            switch (adminAction) {
                case 'Crear Producto':
                    operation = 'crearProducto';
                    const pDetails = await inquirer.prompt([
                        { name: 'nombre', message: 'Nombre:' }, { name: 'marca', message: 'Marca:' },
                        { name: 'talla', message: 'Talla:' }, { name: 'color', message: 'Color:' },
                        { name: 'precio', type: 'number', message: 'Precio:' }, { name: 'stock', type: 'number', message: 'Stock:' }
                    ]);
                    payload = { nombre: pDetails.nombre, marca: pDetails.marca, variaciones: [{ talla: pDetails.talla, color: pDetails.color, precio: pDetails.precio, stock: pDetails.stock }] };
                    break;
                case 'Editar Producto':
                    operation = 'editarProducto';
                    const { productoId: editId } = await inquirer.prompt([{ name: 'productoId', message: 'ID del producto a editar:' }]);
                    const { nuevoNombre } = await inquirer.prompt([{ name: 'nuevoNombre', message: 'Nuevo nombre:' }]);
                    payload = { productoId: editId, updates: { nombre: nuevoNombre } };
                    break;
                case 'Eliminar Producto':
                    operation = 'eliminarProducto';
                    const { productoId: deleteId } = await inquirer.prompt([{ name: 'productoId', message: 'ID del producto a eliminar:' }]);
                    payload = { productoId: deleteId };
                    break;
            }
            const adminResponse = await sendRequest('admin', { userId: adminUser._id, operation, payload });
            console.log('\n✅ Operación de Admin exitosa:', JSON.stringify(adminResponse.data, null, 2));
        } catch (e) {
            console.error(`\n❌ Error en la operación de admin: ${e.message}`);
        }
    }
}

// --- Flujo Principal de la Aplicación ---

async function run() {
    await connectDB();
    const inquirer = (await import('inquirer')).default;
    let loggedInUser = null;

    try {
        // 1. Login o Registro
        const { initialAction } = await inquirer.prompt([
            { type: 'list', name: 'initialAction', message: 'Bienvenido a VirtualFit', choices: ['Iniciar sesión', 'Registrar nuevo usuario'] }
        ]);

        let response;
        if (initialAction === 'Iniciar sesión') {
            const creds = await inquirer.prompt([{ type: 'input', name: 'correo' }, { type: 'password', name: 'password' }]);
            response = await sendRequest('logns', creds);
        } else {
            const creds = await inquirer.prompt([{ type: 'input', name: 'correo' }, { type: 'password', name: 'password' }]);
            response = await sendRequest('auths', creds);
        }
        
        loggedInUser = response.data;
        console.log(`\n✅ ¡Bienvenido, ${loggedInUser.correo}! (Rol: ${loggedInUser.rol})`);

        // 2. Menú Principal post-login
        while (true) {
            const clientChoices = [
                '👤 Ver Perfil', '📚 Catálogo', '🛒 Carrito', '💖 Lista de Deseos',
                // '🤖 Asistente ASAI', // Omitido por ahora
            ];
            if (loggedInUser.rol === 'admin') {
                clientChoices.push('🛠️ Gestión de Productos (Admin)');
            }
            clientChoices.push(new inquirer.Separator(), '🚪 Cerrar Sesión');

            const { mainMenuAction } = await inquirer.prompt([{
                type: 'list', name: 'mainMenuAction', message: 'Menú Principal', choices: clientChoices
            }]);

            if (mainMenuAction === '🚪 Cerrar Sesión') break;

            // Manejar la selección del menú
            switch (mainMenuAction) {
                case '👤 Ver Perfil':
                    await handleProfile(inquirer, loggedInUser);
                    break;
                case '📚 Catálogo':
                    await handleCatalog(inquirer, loggedInUser._id);
                    break;
                case '🛒 Carrito':
                    await handleCart(inquirer, loggedInUser._id);
                    break;
                case '💖 Lista de Deseos':
                    await handleWishlist(inquirer, loggedInUser._id);
                    break;
                case '🛠️ Gestión de Productos (Admin)':
                    await handleAdminTasks(inquirer, loggedInUser);
                    break;
            }
        }
    } catch (error) {
        console.error('\n❌ Error en el flujo principal:', error.message);
    } finally {
        if (mongoose.connection.readyState === 1) await mongoose.connection.close();
        console.log('\n👋 Gracias por usar VirtualFit. Conexión cerrada.');
    }
}

run();