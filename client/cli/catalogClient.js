// clients/catalogClient.js
const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js');
const User = require('../../database/models/user.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;

// --- Funciones de Comunicación y Visualización ---

/**
 * Función genérica para enviar solicitudes a cualquier servicio a través del bus.
 * @param {string} serviceName - El nombre del servicio a llamar (ej: 'catal', 'carro').
 * @param {object} requestPayload - El objeto JSON con la acción y los datos.
 * @returns {Promise<object>} La respuesta del servicio.
 */
function sendRequest(serviceName, requestPayload) {
    return new Promise((resolve, reject) => {
        const clientSocket = new net.Socket();
        
        clientSocket.on('connect', () => {
            const service = serviceName.padEnd(5, ' ');
            const payload = service + JSON.stringify(requestPayload);
            const header = String(payload.length).padStart(5, '0');
            const fullMessage = header + payload;
            
            console.log(`\n[Cliente] -> Enviando a '${serviceName}': ${fullMessage.substring(0, 150)}...`);
            clientSocket.write(fullMessage);
        });

        clientSocket.on('data', (data) => {
            const rawData = data.toString();
            const status = rawData.substring(10, 12).trim();
            const message = rawData.substring(12);

            if (status === 'OK') {
                try {
                    const responseData = JSON.parse(message);
                    if (responseData.status === 'error') {
                        reject(new Error(`Error del servicio '${serviceName}': ${responseData.message}`));
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
        });

        clientSocket.on('close', () => console.log(`[Cliente] Conexión con ${serviceName} cerrada.`));
        clientSocket.on('error', (err) => reject(new Error(`Error de conexión al bus: ${err.message}`)));
        
        clientSocket.connect(BUS_PORT, BUS_HOST);
    });
}

/**
 * Muestra una lista de productos de forma legible.
 * @param {Array} products - La lista de productos a mostrar.
 */
function displayProducts(products) {
    if (!products || products.length === 0) {
        console.log("\n-- No se encontraron productos que coincidan con los criterios. --");
        return;
    }
    console.log(`\n--- 📜 Catálogo de Productos (${products.length} encontrados) ---\n`);
    products.forEach((p, index) => {
        console.log(`${index + 1}. 📦 Nombre: ${p.nombre} [ID: ${p._id}]`);
        console.log(`   Marca: ${p.marca || 'N/A'}, Categoría: ${p.categoria || 'N/A'}`);
        if (p.variaciones && p.variaciones.length > 0) {
            // Mostramos solo la primera variación para simplicidad en la vista de catálogo
            const v = p.variaciones[0];
            console.log(`   - Var: ${v.color || ''} ${v.talla || ''} | Precio: $${v.precio} | Stock: ${v.stock}`);
        } else {
            console.log("   - (Sin variaciones de precio/stock definidas)");
        }
        console.log('----------------------------------------------------');
    });
}

// --- Lógica Interactiva del Cliente ---

/**
 * Maneja el menú que aparece después de que el usuario ve una lista de productos.
 * @param {object} inquirer - Instancia de Inquirer.
 * @param {Array} displayedProducts - Los productos que se acaban de mostrar.
 * @param {string} userId - El ID del usuario actual.
 */
async function productActionMenu(inquirer, displayedProducts, userId) {
    if (!displayedProducts || displayedProducts.length === 0) {
        return; // No mostrar menú si no hay productos
    }

    const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: '¿Qué te gustaría hacer ahora?',
        choices: [
            { name: '🛒 Añadir un producto al carrito', value: 'add_to_cart' },
            { name: '↩️ Volver al menú principal', value: 'back' }
        ]
    }]);

    if (action === 'add_to_cart') {
        const { product_to_add } = await inquirer.prompt([{
            type: 'list',
            name: 'product_to_add',
            message: 'Selecciona el producto que deseas añadir:',
            choices: displayedProducts.map((p, index) => ({
                name: `${index + 1}. ${p.nombre}`,
                value: p._id.toString() // El valor es el ID del producto
            }))
        }]);

        const { cantidad } = await inquirer.prompt([{
            type: 'number',
            name: 'cantidad',
            message: '¿Cuántas unidades quieres añadir?',
            default: 1,
            validate: (num) => num > 0 || 'La cantidad debe ser mayor que cero.'
        }]);

        try {
            console.log(`Intentando añadir ${cantidad} x producto ID ${product_to_add} al carrito del usuario ${userId}...`);
            const cartPayload = {
                action: 'add',
                user_id: userId,
                producto_id: product_to_add,
                cantidad: cantidad
            };
            // Llamamos al servicio 'carro'
            const updatedCart = await sendRequest('carro', cartPayload);
            console.log('✅ ¡ÉXITO! Producto añadido al carrito.');
            console.log(`   Items en el carrito ahora: ${updatedCart.items.length}`);
        } catch (error) {
            console.error(`\n❌ Error al añadir al carrito: ${error.message}`);
        }
    }
}


/**
 * Función principal que controla el flujo de ejecución del cliente.
 */
async function startClient() {
    await connectDB();
    const inquirer = (await import('inquirer')).default;
    let currentUser = null;

    try {
        // --- 1. Identificar al Usuario ---
        while (!currentUser) {
            const { userEmail } = await inquirer.prompt([{
                type: 'input', name: 'userEmail', message: '👤 Introduce tu correo para empezar:'
            }]);
            currentUser = await User.findOne({ correo: userEmail.toLowerCase().trim() }).lean();
            if (!currentUser) {
                console.log(`❌ Usuario con correo '${userEmail}' no encontrado. Inténtalo de nuevo.`);
            }
        }
        console.log(`\n✅ Bienvenido, ${currentUser.correo}!`);

        // --- 2. Menú Principal ---
        let exit = false;
        while (!exit) {
            const { mainMenuAction } = await inquirer.prompt([{
                type: 'list',
                name: 'mainMenuAction',
                message: '🔭 ¿Qué deseas hacer en el catálogo?',
                choices: [
                    { name: '📚 Ver Catálogo Completo', value: 'list' },
                    { name: '🔍 Buscar un producto por término', value: 'search' },
                    { name: '📊 Aplicar Filtros Interactivos', value: 'filter' },
                    new inquirer.Separator(),
                    { name: '🚪 Salir', value: 'exit' },
                ]
            }]);

            let requestPayload;
            let products = [];

            try {
                switch (mainMenuAction) {
                    case 'list':
                        requestPayload = { action: 'list_all' };
                        products = await sendRequest('catal', requestPayload);
                        break;
                    
                    case 'search':
                        const { term } = await inquirer.prompt([{ type: 'input', name: 'term', message: 'Ingresa el término a buscar:' }]);
                        if (!term.trim()) { console.log("❌ La búsqueda no puede estar vacía."); continue; }
                        requestPayload = { action: 'search', term };
                        products = await sendRequest('catal', requestPayload);
                        break;

                    case 'filter':
                        const { marca } = await inquirer.prompt([{ type: 'input', name: 'marca', message: 'Filtrar por marca (deja en blanco para ignorar):' }]);
                        const { color } = await inquirer.prompt([{ type: 'input', name: 'color', message: 'Filtrar por color (deja en blanco para ignorar):' }]);
                        const { precio_min } = await inquirer.prompt([{ type: 'number', name: 'precio_min', message: 'Precio mínimo:', default: undefined }]);
                        const { precio_max } = await inquirer.prompt([{ type: 'number', name: 'precio_max', message: 'Precio máximo:', default: undefined }]);

                        const criteria = {};
                        if (marca.trim()) criteria.marca = marca.trim();
                        if (color.trim()) criteria.color = color.trim();
                        if (precio_min) criteria.precio_min = precio_min;
                        if (precio_max) criteria.precio_max = precio_max;
                        
                        if (Object.keys(criteria).length === 0) { console.log("⚠️ No se aplicó ningún filtro."); continue; }

                        requestPayload = { action: 'filter', criteria };
                        products = await sendRequest('catal', requestPayload);
                        break;

                    case 'exit':
                        exit = true;
                        continue; // Salta el resto del bucle
                }

                // --- 3. Mostrar productos y el menú de acción ---
                displayProducts(products);
                await productActionMenu(inquirer, products, currentUser._id.toString());

            } catch (error) {
                console.error("\n❌ Error durante la operación:", error.message);
            }
            
            if (!exit) {
               await inquirer.prompt([{ type: 'input', name: 'continue', message: '\nPresiona ENTER para volver al menú principal...' }]);
            }
        }

    } catch (error) {
        console.error("\n❌ Ha ocurrido un error crítico en el cliente:", error.message);
    } finally {
        console.log("\n👋 ¡Hasta luego!");
        if (mongoose.connection.readyState === 1) {
            mongoose.connection.close();
        }
    }
}

startClient();