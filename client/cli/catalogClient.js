// clients/cli/catalogClient.js
const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js');
const User = require('../../database/models/user.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;

// --- Funciones de Comunicación y Visualización ---

function sendRequest(serviceName, requestPayload) {
    return new Promise((resolve, reject) => {
        const clientSocket = new net.Socket();
        
        clientSocket.on('connect', () => {
            const service = serviceName.padEnd(5, ' '); // Produce "catal "
            const payload = service + JSON.stringify(requestPayload);
            const header = String(payload.length).padStart(5, '0');
            const fullMessage = header + payload;
            
            console.log(`\n[Cliente] -> Enviando a '${serviceName}': ${fullMessage}`);
            clientSocket.write(fullMessage);
        });

        let responseBuffer = '';
        clientSocket.on('data', (data) => {
            responseBuffer += data.toString();
            while (true) {
                if (responseBuffer.length < 5) break;
                const payloadLength = parseInt(responseBuffer.substring(0, 5), 10);
                if (isNaN(payloadLength)) { responseBuffer = ''; break; }
                const totalMessageLength = 5 + payloadLength;
                if (responseBuffer.length < totalMessageLength) break;
                
                const messageToProcess = responseBuffer.substring(0, totalMessageLength);
                responseBuffer = responseBuffer.substring(totalMessageLength);
                console.log(`\n[Cliente] <- Respuesta completa recibida: ${messageToProcess.substring(0, 200)}...`);

                const status = messageToProcess.substring(10, 12).trim();
                const message = messageToProcess.substring(12);

                if (status === 'OK') {
                    try {
                        const responseData = JSON.parse(message);
                        if (responseData.status === 'error' && serviceName !== 'deseo') {
                            reject(new Error(`Error del servicio '${serviceName}': ${responseData.message}`));
                        } else {
                            resolve(responseData);
                        }
                    } catch (e) {
                        reject(new Error(`Error al parsear la respuesta JSON. Contenido: ${message}`));
                    }
                } else {
                    reject(new Error(`El bus reportó un error (NK) desde '${serviceName}': ${message}`));
                }
                clientSocket.end();
                return;
            }
        });

        clientSocket.on('close', () => console.log(`[Cliente] Conexión con ${serviceName} cerrada.`));
        clientSocket.on('error', (err) => reject(new Error(`Error de conexión al bus: ${err.message}`)));
        clientSocket.connect(BUS_PORT, BUS_HOST);
    });
}

// ... EL RESTO DE TU ARCHIVO catalogClient.js NO NECESITA CAMBIOS ...
// ... (displayProducts, productActionMenu, etc.)
function displayProducts(products, title = 'Catálogo de Productos') {
    if (!products || products.length === 0) {
        console.log(`\n-- No se encontraron productos en "${title}". --`);
        return;
    }
    console.log(`\n--- 📜 ${title} (${products.length} encontrados) ---\n`);
    products.forEach((p, index) => {
        console.log(`${index + 1}. 📦 Nombre: ${p.nombre} [ID: ${p._id}]`);
        console.log(`   Marca: ${p.marca || 'N/A'}`);

        let puntuacionPromedioTexto = 'Sin reseñas'; 
        if (p.reseñas && p.reseñas.length > 0) {
            const sumaPuntuaciones = p.reseñas.reduce((suma, reseña) => {
                return suma + reseña.puntuacion; 
            }, 0);
            
            const promedio = sumaPuntuaciones / p.reseñas.length;
            puntuacionPromedioTexto = `⭐ ${promedio.toFixed(1)} (${p.reseñas.length} reseña(s))`;
        }
        console.log(`   Puntuación promedio: ${puntuacionPromedioTexto}`);

        if (p.variaciones && p.variaciones.length > 0) {
            const v = p.variaciones[0];
            console.log(`   - Var: ${v.color || ''} ${v.talla || ''} | Precio: $${v.precio} | Stock: ${v.stock}`);
        } else {
            console.log("   - (Sin variaciones de precio/stock definidas)");
        }
        console.log('----------------------------------------------------');
    });
}

async function productActionMenu(inquirer, displayedProducts, userId) {
    if (!displayedProducts || displayedProducts.length === 0) return;

    const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: '¿Qué te gustaría hacer ahora?',
        choices: [
            { name: '🛒 Añadir un producto al carrito', value: 'add_to_cart' },
            { name: '💖 Añadir un producto a la lista de deseos', value: 'add_to_wishlist' },
            new inquirer.Separator(),
            { name: '↩️ Volver al menú principal', value: 'back' }
        ]
    }]);

    if (action === 'back') return;

    const { product_to_act_on } = await inquirer.prompt([{
        type: 'list',
        name: 'product_to_act_on',
        message: 'Selecciona el producto:',
        choices: displayedProducts.map((p, index) => ({
            name: `${index + 1}. ${p.nombre}`,
            value: p._id.toString()
        }))
    }]);

    if (action === 'add_to_cart') {
        const { cantidad } = await inquirer.prompt([{
            type: 'number', name: 'cantidad', message: '¿Cuántas unidades?', default: 1,
            validate: (num) => num > 0 || 'La cantidad debe ser mayor que cero.'
        }]);
        try {
            const payload = { action: 'add', user_id: userId, producto_id: product_to_act_on, cantidad };
            const updatedCart = await sendRequest('carro', payload);
            console.log('✅ ¡ÉXITO! Producto añadido al carrito.');
        } catch (error) {
            console.error(`\n❌ Error al añadir al carrito: ${error.message}`);
        }
    } else if (action === 'add_to_wishlist') {
        try {
            const payload = { action: 'add', user_id: userId, producto_id: product_to_act_on };
            const response = await sendRequest('deseo', payload);
            console.log(`✅ ¡ÉXITO! ${response.message}`);
        } catch (error) {
            console.error(`\n❌ Error al añadir a la lista de deseos: ${error.message}`);
        }
    }
}

async function manageWishlist(inquirer, userId) {
    let goBack = false;
    while (!goBack) {
        try {
            const wishlistProducts = await sendRequest('deseo', { action: 'view', user_id: userId });
            displayProducts(wishlistProducts, 'Mi Lista de Deseos');
            
            if (!wishlistProducts || wishlistProducts.length === 0) {
                goBack = true;
                continue;
            }

            const { action } = await inquirer.prompt([{
                type: 'list', name: 'action', message: 'Opciones de la lista de deseos:',
                choices: [
                    { name: '❌ Eliminar un ítem', value: 'remove' },
                    { name: '↩️ Volver al menú principal', value: 'back' },
                ]
            }]);

            if (action === 'back') {
                goBack = true;
                continue;
            }

            if (action === 'remove') {
                const { product_to_remove } = await inquirer.prompt([{
                    type: 'list', name: 'product_to_remove', message: 'Selecciona el ítem a eliminar:',
                    choices: wishlistProducts.map((p, i) => ({ name: `${i+1}. ${p.nombre}`, value: p._id.toString() }))
                }]);
                const response = await sendRequest('deseo', { action: 'remove', user_id: userId, producto_id: product_to_remove });
                console.log(`✅ ¡ÉXITO! ${response.message}`);
            }
        } catch (error) {
            console.error("\n❌ Error gestionando la lista de deseos:", error.message);
            goBack = true;
        }
    }
}


async function startClient() {
    await connectDB();
    const inquirer = (await import('inquirer')).default;
    let currentUser = null;

    try {
        while (!currentUser) {
            const { userEmail } = await inquirer.prompt([{ type: 'input', name: 'userEmail', message: '👤 Introduce tu correo para empezar:' }]);
            currentUser = await User.findOne({ correo: userEmail.toLowerCase().trim() }).lean();
            if (!currentUser) console.log(`❌ Usuario no encontrado. Inténtalo de nuevo.`);
        }
        console.log(`\n✅ Bienvenido, ${currentUser.correo}!`);

        let exit = false;
        while (!exit) {
            const { mainMenuAction } = await inquirer.prompt([{
                type: 'list',
                name: 'mainMenuAction',
                message: '🔭 ¿Qué deseas hacer?',
                choices: [
                    { name: '📚 Ver Catálogo/Buscar/Filtrar', value: 'catalog' },
                    { name: '💖 Ver mi Lista de Deseos', value: 'wishlist' },
                    new inquirer.Separator(),
                    { name: '🚪 Salir', value: 'exit' },
                ]
            }]);

            if (mainMenuAction === 'exit') {
                exit = true;
                continue;
            }
            
            if (mainMenuAction === 'wishlist') {
                await manageWishlist(inquirer, currentUser._id.toString());
                continue;
            }
            
            const { catalogAction } = await inquirer.prompt([{
                type: 'list', name: 'catalogAction', message: 'Acciones del catálogo:',
                choices: [
                    { name: '📚 Ver Catálogo Completo', value: 'list' },
                    { name: '🔍 Buscar un producto', value: 'search' },
                    { name: '📊 Aplicar Filtros', value: 'filter' },
                ]
            }]);

            let products = [];
            try {
                switch (catalogAction) {
                    case 'list':
                        products = await sendRequest('catal', { action: 'list_all' });
                        break;
                    case 'search':
                        const { term } = await inquirer.prompt([{ type: 'input', name: 'term', message: 'Ingresa el término a buscar:' }]);
                        if (term.trim()) products = await sendRequest('catal', { action: 'search', term });
                        break;
                    case 'filter':
                        const { marca, color, precio_min, precio_max } = await inquirer.prompt([
                            { type: 'input', name: 'marca', message: 'Marca (opcional):' },
                            { type: 'input', name: 'color', message: 'Color (opcional):' },
                            { type: 'number', name: 'precio_min', message: 'Precio mínimo (opcional):' },
                            { type: 'number', name: 'precio_max', message: 'Precio máximo (opcional):' }
                        ]);
                        const criteria = { marca, color, precio_min, precio_max };
                        Object.keys(criteria).forEach(key => (!criteria[key] && delete criteria[key]));
                        if (Object.keys(criteria).length > 0) {
                            products = await sendRequest('catal', { action: 'filter', criteria });
                        }
                        break;
                }
                displayProducts(products);
                await productActionMenu(inquirer, products, currentUser._id.toString());
            } catch (error) {
                console.error("\n❌ Error durante la operación de catálogo:", error.message);
            }
        }
    } catch (error) {
        console.error("\n❌ Ha ocurrido un error crítico en el cliente:", error.message);
    } finally {
        console.log("\n👋 ¡Hasta luego!");
        if (mongoose.connection.readyState === 1) mongoose.connection.close();
    }
}

startClient();