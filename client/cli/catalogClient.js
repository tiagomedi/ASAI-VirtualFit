// clients/cli/catalogClient.js
// VERSIÓN FINAL Y CORRECTA - Cliente Inteligente con Bypass
const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js');
const User = require('../../database/models/user.model.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const CATALOG_DIRECT_PORT = 5002;
const CATALOG_PAGE_SIZE = 4;

function sendRequest(serviceName, requestPayload) {
    return new Promise((resolve, reject) => {
        const isDirect = serviceName === 'catal';
        const targetPort = isDirect ? CATALOG_DIRECT_PORT : BUS_PORT;

        const clientSocket = new net.Socket();
        clientSocket.setEncoding('utf8');
        
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout de 5s para la operación con '${serviceName}' en el puerto ${targetPort}`));
            clientSocket.destroy();
        }, 5000);

        clientSocket.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`Error de conexión para '${serviceName}' en ${BUS_HOST}:${targetPort} - ${err.message}`));
        });
        
        clientSocket.connect(targetPort, BUS_HOST, () => {
            let fullMessage;
            if (isDirect) {
                const payload = JSON.stringify(requestPayload);
                fullMessage = String(payload.length).padStart(5, '0') + payload;
            } else {
                const service = serviceName.padEnd(5, ' ');
                const payload = service + JSON.stringify(requestPayload);
                fullMessage = String(payload.length).padStart(5, '0') + payload;
            }
            clientSocket.write(fullMessage);
        });

        let responseBuffer = '';
        clientSocket.on('data', (data) => {
            responseBuffer += data;
            const headerSize = 5;
            let expectedLength = -1;

            if (responseBuffer.length >= headerSize) {
                if (isDirect) {
                     expectedLength = parseInt(responseBuffer.substring(0, headerSize), 10);
                } else {
                    // La respuesta del bus tiene un formato más complejo que no manejaremos aquí
                    // por simplicidad, ya que el bypass es para el catálogo.
                    // Esta parte se deja para los servicios que sí funcionan vía bus.
                    // Para este problema, nos enfocamos en el caso 'directo'.
                    const busResponseHeader = responseBuffer.substring(0, headerSize);
                    expectedLength = parseInt(busResponseHeader, 10);
                }

                if (!isNaN(expectedLength) && responseBuffer.length >= headerSize + expectedLength) {
                    let jsonString;
                    if(isDirect) {
                        jsonString = responseBuffer.substring(headerSize, headerSize + expectedLength);
                    } else {
                        // Asumimos que el JSON empieza después del OK y el nombre del servicio.
                        const jsonStartIndex = responseBuffer.search(/[{[]/);
                        jsonString = responseBuffer.substring(jsonStartIndex, headerSize + expectedLength);
                    }

                    try {
                        const jsonData = JSON.parse(jsonString);
                        clearTimeout(timeout);
                        resolve(jsonData);
                    } catch (e) {
                        clearTimeout(timeout);
                        reject(new Error("Error al parsear JSON de respuesta."));
                    } finally {
                        clientSocket.end();
                    }
                }
            }
        });
    });
}


function displayProducts(products, title = 'Catálogo de Productos') {
    if (!products || !Array.isArray(products) || products.length === 0) { console.log(`\n-- No se encontraron productos en "${title}". --`); return; }
    console.log(`\n--- 📜 ${title} ---\n`);
    products.forEach((p, index) => {
        console.log(`${index + 1}. 📦 Nombre: ${p.nombre || 'N/A'} [ID: ${p._id}]`);
        console.log(`   Marca: ${p.marca || 'N/A'}`);
        if (p.variaciones && Array.isArray(p.variaciones) && p.variaciones.length > 0) {
            const v = p.variaciones[0];
            if(v) console.log(`   - Var: ${v.color || ''} ${v.talla || ''} | Precio: $${v.precio !== undefined ? v.precio : 'N/A'} | Stock: ${v.stock !== undefined ? v.stock : 'N/A'}`);
        } else { console.log("   - (Sin variaciones)"); }
        console.log('----------------------------------------------------');
    });
}
async function productActionMenu(inquirer, displayedProducts, userId) {
    if (!displayedProducts || displayedProducts.length === 0) return;
    const { action } = await inquirer.prompt([{ type: 'list', name: 'action', message: '¿Qué deseas hacer?', choices: [{ name: '▶️ Continuar navegando...', value: 'back' },  new inquirer.Separator(),{ name: '🛒 Añadir al carrito', value: 'add_to_cart' }, { name: '💖 Añadir a deseos', value: 'add_to_wishlist' }, new inquirer.Separator(), { name: '↩️ Volver al menú principal', value: 'back' }] }]);
    if (action === 'back') return;
    const { product_to_act_on } = await inquirer.prompt([{ type: 'list', name: 'product_to_act_on', message: 'Selecciona el producto:', choices: displayedProducts.map((p, index) => ({ name: `${index + 1}. ${p.nombre}`, value: p._id.toString() })) }]);
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

async function manageCatalogView(inquirer, userId) {
    let currentPage = 1;
    let totalPages = 1;

    while (true) {
        try {
            console.log(`\nSolicitando página ${currentPage}...`);
            const response = await sendRequest('catal', { action: 'list_all', page: currentPage, limit: CATALOG_PAGE_SIZE });
            
            if (!response || !response.products) {
                console.log("\n❌ Error: Respuesta inválida del servicio de catálogo.");
                break; 
            }

            const { products, totalPages: newTotalPages, totalProducts } = response;
            totalPages = newTotalPages;

            const title = `Catálogo (Página ${currentPage}/${totalPages} - ${totalProducts} productos en total)`;
            displayProducts(products, title);
            
            if (products && products.length > 0) {
                await productActionMenu(inquirer, products, userId);
            }

            // --- Lógica de Menú de Paginación Mejorada ---

            // Si no hay productos en la primera página, simplemente salimos.
            if (totalProducts === 0) {
                await inquirer.prompt([{ type: 'list', name: 'continue', message: 'No se encontraron productos. Presiona Enter para volver.', choices:['Ok'] }]);
                break;
            }

            const paginationChoices = [];

            // Añadir botón "Anterior" si no estamos en la primera página
            if (currentPage > 1) {
                paginationChoices.push({ name: '⬅️  Página Anterior', value: 'prev' });
            }

            // Añadir botón "Siguiente" si no estamos en la última página
            if (currentPage < totalPages) {
                paginationChoices.push({ name: 'Página Siguiente ➡️', value: 'next' });
            }

            // Separador si hay opciones de navegación
            if (paginationChoices.length > 0) {
                paginationChoices.push(new inquirer.Separator());
            }

            // ¡Añadir SIEMPRE el botón para salir!
            paginationChoices.push({ name: '↩️  Volver al Menú Principal', value: 'exit_pagination' });

            const { paginationAction } = await inquirer.prompt([{
                type: 'list',
                name: 'paginationAction',
                message: 'Navegar por el catálogo:',
                choices: paginationChoices,
                pageSize: 4 
            }]);

            switch (paginationAction) {
                case 'next':
                    currentPage++;
                    break;
                case 'prev':
                    currentPage--;
                    break;
                case 'exit_pagination':
                    return; // Usamos return para salir de la función manageCatalogView
            }

        } catch (error) {
            console.error("\n❌ Error durante la navegación del catálogo:", error.message);
            break; // Salir del bucle en caso de error
        }
    }
}

async function main() {
    await connectDB();
    const inquirer = (await import('inquirer')).default;
    let currentUser = null;
    try {
        while (!currentUser) {
            const { userEmail } = await inquirer.prompt([{ type: 'input', name: 'userEmail', message: '👤 Introduce tu correo para empezar:' }]);
            currentUser = await User.findOne({ correo: userEmail.toLowerCase().trim() }).lean();
            if (!currentUser) console.log(`❌ Usuario no encontrado.`);
        }
        console.log(`\n✅ Bienvenido, ${currentUser.correo}!`);
        let exit = false;
        while (!exit) {
            const { mainMenuAction } = await inquirer.prompt([{ type: 'list', name: 'mainMenuAction', message: '🔭 ¿Qué deseas hacer?', choices: [{ name: '📚 Ver Catálogo/Buscar/Filtrar', value: 'catalog' }, { name: '💖 Ver mi Lista de Deseos', value: 'wishlist' }, new inquirer.Separator(), { name: '🚪 Salir', value: 'exit' }] }]);
            if (mainMenuAction === 'exit') { exit = true; continue; }
            if (mainMenuAction === 'wishlist') { /* await manageWishlist(inquirer, currentUser._id.toString()); */ continue; }
            const { catalogAction } = await inquirer.prompt([{ type: 'list', name: 'catalogAction', message: 'Acciones del catálogo:', choices: [{ name: '📚 Ver Catálogo Completo (Paginado)', value: 'list' }, { name: '🔍 Buscar un producto', value: 'search' }, { name: '📊 Aplicar Filtros', value: 'filter' }] }]);
            
            if (catalogAction === 'list') {
                await manageCatalogView(inquirer, currentUser._id.toString());
            } else {
                let products;
                if(catalogAction === 'search') {
                    const { term } = await inquirer.prompt([{ type: 'input', name: 'term', message: 'Ingresa término a buscar:' }]);
                    products = await sendRequest('catal', { action: 'search', term });
                } else if (catalogAction === 'filter') {
                    const { marca } = await inquirer.prompt([{ type: 'input', name: 'marca', message: 'Filtrar por marca:' }]);
                    products = await sendRequest('catal', { action: 'filter', criteria: { marca } });
                }
                displayProducts(products, "Resultados");
                await productActionMenu(inquirer, products, currentUser._id.toString());
            }
        }
    } catch (error) { console.error("\n❌ Error crítico:", error.message);
    } finally {
        console.log("\n👋 ¡Hasta luego!");
        if (mongoose.connection.readyState === 1) mongoose.connection.close();
        process.exit(0);
    }
}

main();