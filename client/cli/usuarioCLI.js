// ===================================================================================
// CLIENTE CLI INTEGRADO - VIRTUALFIT
// ===================================================================================
// Este archivo integra todas las funcionalidades de los clientes CLI en una sola 
// aplicación. Incluye:
// - Autenticación centralizada (login/registro)
// - Gestión de carrito de compras
// - Navegación de catálogo y búsqueda de productos
// - Gestión de lista de deseos
// - Gestión de perfil (direcciones, métodos de pago)
// - Gestión de órdenes
// - Creación de reseñas
// - Chat con ASAI
// - Funcionalidades de administrador
// ===================================================================================

const net = require('net');
const { v4: uuidv4 } = require('uuid');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const CLIENT_ID = uuidv4().substring(0, 5);

const pendingResponses = new Map();
const clientSocket = new net.Socket();
let buffer = ''; // Cambiar a string como otros archivos del proyecto
let processBufferTimeout = null;

clientSocket.on('data', (chunk) => {
    buffer += chunk.toString();
    processBuffer();
});

clientSocket.on('close', () => {
    console.log('[Cliente] Conexión con el bus cerrada.');
    // Limpia promesas pendientes
    for (const [correlationId, handler] of pendingResponses.entries()) {
        handler(new Error('La conexión con el bus se cerró inesperadamente.'), null);
    }
    pendingResponses.clear();
});

function processBuffer() {
    // Limpiar timeout anterior si existe
    if (processBufferTimeout) {
        clearTimeout(processBufferTimeout);
        processBufferTimeout = null;
    }
    
    while (buffer.length >= 5) {
        const lengthStr = buffer.substring(0, 5);
        const length = parseInt(lengthStr, 10);
        
        if (isNaN(length) || length < 0 || length > 100000) {
            console.error(`[Cliente] Header inválido: '${lengthStr}', limpiando buffer`);
            buffer = '';
            break;
        }
        
        const expectedTotalLength = 5 + length;
        if (buffer.length < expectedTotalLength) {
            // Esperar más datos con un timeout más largo
            processBufferTimeout = setTimeout(() => {
                if (buffer.length >= expectedTotalLength) {
                    processBuffer();
                } else {
                    console.log(`[Cliente] Timeout esperando datos completos. Esperado: ${expectedTotalLength}, Actual: ${buffer.length}`);
                    // Solo procesar si tenemos al menos el header completo y algo de datos
                    if (buffer.length > 5) {
                        console.log(`[Cliente] Procesando mensaje parcial disponible`);
                        const availableMessage = buffer.substring(0, buffer.length);
                        buffer = '';
                        handleMessage(availableMessage);
                    } else {
                        console.log(`[Cliente] Datos insuficientes, descartando buffer`);
                        buffer = '';
                    }
                }
            }, 1000); // Aumentar timeout a 1 segundo
            break;
        }
        
        // Extraer exactamente la cantidad de bytes especificada en el header
        const fullMessage = buffer.substring(0, expectedTotalLength);
        buffer = buffer.substring(expectedTotalLength);
        
        // Procesar el mensaje completo
        handleMessage(fullMessage);
    }
}

function handleMessage(fullMessage) {
    console.log(`[Cliente] Procesando mensaje de ${fullMessage.length} bytes`);
    
    // El mensaje viene en formato: [header 5 bytes][destino 5 bytes][servicio 5 bytes][status 2 bytes][JSON]
    if (fullMessage.length < 17) {
        console.error('[Cliente] Mensaje muy corto, ignorando');
        return;
    }
    
    const messageContent = fullMessage.substring(5); // Quitamos el header
    const destination = messageContent.substring(0, 5).trim(); // Destino (debería ser nuestro CLIENT_ID)
    const serviceName = messageContent.substring(5, 10).trim(); // Nombre del servicio
    const status = messageContent.substring(10, 12).trim(); // Status
    const responseJson = messageContent.substring(12); // JSON content
    
    console.log(`[Cliente] Dest: '${destination}', Service: '${serviceName}', Status: '${status}'`);

    try {
        // Intentar parsear el JSON directamente
        const response = JSON.parse(responseJson);
        
        if (response.correlationId && pendingResponses.has(response.correlationId)) {
            const handler = pendingResponses.get(response.correlationId);
            pendingResponses.delete(response.correlationId);
            
            if (status === 'OK') {
                console.log(`[Cliente] Resolviendo promesa exitosamente`);
                handler(null, response);
            } else {
                console.log(`[Cliente] Resolviendo promesa con error`);
                handler(new Error(`Error del servicio ${serviceName}: ${response.message || 'Error desconocido'}`), null);
            }
        } else {
            console.log(`[Cliente] No se encontró handler para correlationId: ${response.correlationId}`);
        }
    } catch (e) {
        console.error(`[Cliente] Error al procesar mensaje JSON: ${e.message}`);
        console.error(`[Cliente] Mensaje problemático: ${responseJson.substring(0, 200)}...`);
        
        // Si hay un handler esperando, rechazarlo
        if (pendingResponses.size > 0) {
            const firstHandler = pendingResponses.values().next().value;
            pendingResponses.clear();
            firstHandler(new Error('Error al procesar respuesta del servidor'), null);
        }
    }
}

// --- Envío de mensajes y promesas ---

function sendMessage(service, message) {
    const body = service + message;
    const header = String(Buffer.byteLength(body, 'utf8')).padStart(5, '0');
    clientSocket.write(header + body);
   // console.log(`[Cliente] Enviando a '${service}'... (Header: ${header})`);
}

function sendRequestAndWait(service, requestData, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        const correlationId = uuidv4();
        requestData.correlationId = correlationId;
        requestData.clientId = CLIENT_ID;
        pendingResponses.set(correlationId, (err, response) => {
            if (err) return reject(err);
            resolve(response);
        });
        sendMessage(service, JSON.stringify(requestData));
        setTimeout(() => {
            if (pendingResponses.has(correlationId)) {
                pendingResponses.delete(correlationId);
                reject(new Error(`Timeout esperando respuesta para la operación: ${service}`));
            }
        }, timeoutMs);
    });
}

// --- Funciones de servicios integrados ---

// Función para enviar request al servicio de carrito
function sendCartRequest(requestPayload) {
    return new Promise((resolve, reject) => {
        const clientSocket = new net.Socket();
        clientSocket.setEncoding('utf8');
        
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout de 10s para la operación con el carrito en el puerto 5004`));
            clientSocket.destroy();
        }, 10000);

        clientSocket.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`Error de conexión al carrito en localhost:5004 - ${err.message}`));
        });
        
        clientSocket.connect(5004, 'localhost', () => {
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

// Función para enviar request a diferentes servicios
function sendServiceRequest(serviceName, requestPayload) {
    return new Promise((resolve, reject) => {
        const portMap = {
            'catal': 5002,
            'deseo': 5003,
            'carro': 5004
        };
        
        const targetPort = portMap[serviceName];
        if (!targetPort) {
            reject(new Error(`Servicio desconocido: ${serviceName}`));
            return;
        }

        const clientSocket = new net.Socket();
        clientSocket.setEncoding('utf8');
        
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout de 10s para la operación con '${serviceName}' en el puerto ${targetPort}`));
            clientSocket.destroy();
        }, 10000);

        clientSocket.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`Error de conexión para '${serviceName}' en localhost:${targetPort} - ${err.message}`));
        });
        
        clientSocket.connect(targetPort, 'localhost', () => {
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
                        
                        if (jsonData.status === 'error') {
                            reject(new Error(jsonData.message || `Error del servicio ${serviceName}`));
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

// Función para mostrar carrito
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

// Función para gestionar carrito
async function handleCartManagement(inquirer, usuario) {
    let goBack = false;
    let paymentSuccess = false;

    while (!goBack && !paymentSuccess) {
        try {
            console.log("Consultando carrito...");
            const cart = await sendCartRequest({ action: 'view', user_id: usuario._id.toString() });
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
                if (!usuario.direcciones?.length) throw new Error("No tienes direcciones guardadas para el envío.");
                if (!usuario.metodos_pago?.length) throw new Error("No tienes métodos de pago guardados.");

                const dirChoices = usuario.direcciones.map(d => ({ name: `${d.nombre_direccion}: ${d.calle}, ${d.ciudad}`, value: d._id.toString() }));
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
                        message: `Tienes ${usuario.asai_points} ASAIpoints. ¿Deseas usar ${POINTS_FOR_20_PERCENT_DISCOUNT} para obtener un 20% de descuento ($${calculatedDiscountAmount.toFixed(2)})?`,
                        default: true
                    }]);
                    if (useDiscount) pointsToUse = POINTS_FOR_20_PERCENT_DISCOUNT;
                }

                console.log("\n💳 Procesando pago...");
                console.log('\n🎉 ¡GENIAL! GRACIAS POR COMPRAR 🎉');
                console.log('✅ Tu compra se ha procesado correctamente');
                console.log('📧 Recibirás un correo de confirmación pronto');
                
                paymentSuccess = true;
                goBack = true;

            } else if (cartAction === 'back') {
                goBack = true;
            } else if (cartAction === 'update' || cartAction === 'remove') {
                const cartObj = cart.toObject ? cart.toObject() : cart;
                const { itemToModify } = await inquirer.prompt([{
                    type: 'list', name: 'itemToModify', message: `Selecciona el ítem a ${cartAction === 'update' ? 'modificar' : 'eliminar'}:`,
                    choices: cartObj.items.map((item, i) => ({ name: `${i + 1}. ${item.nombre_snapshot}`, value: item.producto_variacion_id.toString() }))
                }]);

                if (cartAction === 'update') {
                    const { newQty } = await inquirer.prompt([{
                        type: 'number', name: 'newQty', message: 'Ingresa la nueva cantidad:',
                        validate: input => input > 0 || 'Debe ser un número positivo.'
                    }]);
                    await sendCartRequest({ action: 'update', user_id: usuario._id.toString(), producto_variacion_id: itemToModify, nueva_cantidad: parseInt(newQty, 10) });
                    console.log("✅ Cantidad actualizada.");
                } else {
                    await sendCartRequest({ action: 'remove', user_id: usuario._id.toString(), producto_variacion_id: itemToModify });
                    console.log("✅ Ítem eliminado.");
                }
            }
        } catch (error) {
            console.error("\n❌ Error en la gestión del carrito:", error.message);
            goBack = true;
        }
    }
    return paymentSuccess;
}

// Función para mostrar productos
function displayProducts(products, title = 'Catálogo de Productos') {
    if (!products || !Array.isArray(products) || products.length === 0) {
        console.log(`\n-- No se encontraron productos en "${title}". --`);
        return;
    }
    console.log(`\n--- 📜 ${title} ---\n`);
    products.forEach((p, index) => {
        console.log(`${index + 1}. 📦 Nombre: ${p.nombre || 'N/A'} [ID: ${p._id}]`);
        console.log(`   Marca: ${p.marca || 'N/A'}`);
        if (p.variaciones && Array.isArray(p.variaciones) && p.variaciones.length > 0) {
            const v = p.variaciones[0];
            if (v) console.log(`   - Var: ${v.color || ''} ${v.talla || ''} | Precio: $${v.precio !== undefined ? v.precio : 'N/A'} | Stock: ${v.stock !== undefined ? v.stock : 'N/A'}`);
        } else {
            console.log("   - (Sin variaciones)");
        }
        console.log('----------------------------------------------------');
    });
}

// Función para menú de acciones de productos
async function productActionMenu(inquirer, displayedProducts, userId) {
    if (!displayedProducts || displayedProducts.length === 0) return;
    
    const { action } = await inquirer.prompt([{
        type: 'list', name: 'action', message: '¿Qué deseas hacer?',
        choices: [
            { name: '▶️ Continuar navegando...', value: 'back' },
            new inquirer.Separator(),
            { name: '🛒 Añadir al carrito', value: 'add_to_cart' },
            { name: '💖 Añadir a deseos', value: 'add_to_wishlist' },
            new inquirer.Separator(),
            { name: '↩️ Volver al menú principal', value: 'back' }
        ]
    }]);
    
    if (action === 'back') return;
    
    const { product_to_act_on } = await inquirer.prompt([{
        type: 'list', name: 'product_to_act_on', message: 'Selecciona el producto:',
        choices: displayedProducts.map((p, index) => ({ name: `${index + 1}. ${p.nombre}`, value: p._id.toString() }))
    }]);
    
    if (action === 'add_to_cart') {
        const { cantidad } = await inquirer.prompt([{
            type: 'number', name: 'cantidad', message: '¿Cuántas unidades?', default: 1,
            validate: (num) => num > 0 || 'La cantidad debe ser mayor que cero.'
        }]);
        try {
            await sendServiceRequest('carro', { action: 'add', user_id: userId, producto_id: product_to_act_on, cantidad });
            console.log('✅ ¡ÉXITO! Producto añadido al carrito.');
        } catch (error) {
            console.error(`\n❌ Error al añadir al carrito: ${error.message}`);
        }
    } else if (action === 'add_to_wishlist') {
        try {
            const response = await sendServiceRequest('deseo', { action: 'add', user_id: userId, producto_id: product_to_act_on });
            console.log(`✅ ¡ÉXITO! ${response.message || 'Producto añadido a la lista de deseos.'}`);
        } catch (error) {
            console.error(`\n❌ Error al añadir a la lista de deseos: ${error.message}`);
        }
    }
}

// Función para gestionar catálogo
async function handleCatalogManagement(inquirer, userId) {
    let currentPage = 1;
    let totalPages = 1;
    const CATALOG_PAGE_SIZE = 4;

    while (true) {
        try {
            console.log(`\nSolicitando página ${currentPage}...`);
            const response = await sendServiceRequest('catal', { action: 'list_all', page: currentPage, limit: CATALOG_PAGE_SIZE });
            
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

            if (totalProducts === 0) {
                await inquirer.prompt([{ type: 'list', name: 'continue', message: 'No se encontraron productos. Presiona Enter para volver.', choices: ['Ok'] }]);
                break;
            }

            const paginationChoices = [];
            if (currentPage > 1) {
                paginationChoices.push({ name: '⬅️  Página Anterior', value: 'prev' });
            }
            if (currentPage < totalPages) {
                paginationChoices.push({ name: 'Página Siguiente ➡️', value: 'next' });
            }
            if (paginationChoices.length > 0) {
                paginationChoices.push(new inquirer.Separator());
            }
            paginationChoices.push({ name: '↩️  Volver al Menú Principal', value: 'exit_pagination' });

            const { paginationAction } = await inquirer.prompt([{
                type: 'list', name: 'paginationAction', message: 'Navegar por el catálogo:',
                choices: paginationChoices, pageSize: 4
            }]);

            switch (paginationAction) {
                case 'next': currentPage++; break;
                case 'prev': currentPage--; break;
                case 'exit_pagination': return;
            }
        } catch (error) {
            console.error("\n❌ Error durante la navegación del catálogo:", error.message);
            break;
        }
    }
}

// Función para buscar productos
async function handleProductSearch(inquirer, userId) {
    const { term } = await inquirer.prompt([{ type: 'input', name: 'term', message: 'Ingresa término a buscar:' }]);
    try {
        const products = await sendServiceRequest('catal', { action: 'search', term });
        console.log(`\n🔍 Búsqueda realizada para: "${term}"`);
        displayProducts(products, "Resultados de Búsqueda");
        if (products && products.length > 0) {
            await productActionMenu(inquirer, products, userId);
        } else {
            console.log('\n💡 Sugerencia: Intenta con términos más generales.');
            await inquirer.prompt([{ type: 'list', name: 'continue', message: 'Presiona Enter para continuar.', choices: ['Ok'] }]);
        }
    } catch (error) {
        console.error(`\n❌ Error en la búsqueda: ${error.message}`);
    }
}

// Función para gestionar lista de deseos
async function handleWishlistManagement(inquirer, userId) {
    let currentPage = 1;
    let goBack = false;
    const WISHLIST_PAGE_SIZE = 4;

    while (!goBack) {
        try {
            const wishlistResponse = await sendServiceRequest('deseo', { 
                action: 'view', user_id: userId, page: currentPage, limit: WISHLIST_PAGE_SIZE 
            });
            
            if (!wishlistResponse || !wishlistResponse.products) {
                console.log("\n❌ Error: Respuesta inválida del servicio de lista de deseos.");
                goBack = true;
                continue;
            }

            const { products, totalPages, totalProducts } = wishlistResponse;
            const title = `Mi Lista de Deseos (Página ${currentPage}/${totalPages} - ${totalProducts} productos en total)`;
            displayProducts(products, title);
            
            if (!products || products.length === 0) {
                if (currentPage === 1 && totalProducts === 0) {
                    console.log("\n💔 Tu lista de deseos está vacía.");
                    await inquirer.prompt([{ type: 'list', name: 'continue', message: 'Presiona Enter para volver.', choices: ['Ok'] }]);
                    goBack = true;
                    continue;
                }
            }

            const menuChoices = [];
            if (currentPage > 1) {
                menuChoices.push({ name: '⬅️  Página Anterior', value: 'prev_page' });
            }
            if (currentPage < totalPages) {
                menuChoices.push({ name: 'Página Siguiente ➡️', value: 'next_page' });
            }
            if (menuChoices.length > 0) {
                menuChoices.push(new inquirer.Separator());
            }
            menuChoices.push({ name: '❌ Eliminar un ítem', value: 'remove' });
            menuChoices.push(new inquirer.Separator());
            menuChoices.push({ name: '↩️ Volver al menú principal', value: 'back' });

            const { action } = await inquirer.prompt([{
                type: 'list', name: 'action', message: 'Opciones de la lista de deseos:',
                choices: menuChoices
            }]);

            switch (action) {
                case 'back': goBack = true; break;
                case 'prev_page': currentPage--; break;
                case 'next_page': currentPage++; break;
                case 'remove':
                    const { product_to_remove } = await inquirer.prompt([{
                        type: 'list', name: 'product_to_remove', message: 'Selecciona el ítem a eliminar:',
                        choices: products.map((p, i) => ({ name: `${i+1}. ${p.nombre}`, value: p._id.toString() }))
                    }]);
                    const response = await sendServiceRequest('deseo', { action: 'remove', user_id: userId, producto_id: product_to_remove });
                    console.log(`✅ ¡ÉXITO! ${response.message || 'Producto eliminado de la lista de deseos.'}`);
                    break;
            }
        } catch (error) {
            console.error("\n❌ Error gestionando la lista de deseos:", error.message);
            goBack = true;
        }
    }
}

// Función específica para el servicio de perfil (puerto directo 5010)
function sendProfileRequest(requestPayload) {
    return new Promise((resolve, reject) => {
        const clientSocket = new net.Socket();
        clientSocket.setEncoding('utf8');
        
        const timeout = setTimeout(() => {
            reject(new Error('Timeout de 10s para la operación con el servicio de perfil'));
            clientSocket.destroy();
        }, 10000);

        clientSocket.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`Error de conexión al servicio de perfil: ${err.message}`));
        });
        
        clientSocket.connect(5010, 'localhost', () => {
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
                        
                        if (jsonData.status === 'error') {
                            reject(new Error(jsonData.message || 'Error del servicio de perfil'));
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

        clientSocket.on('close', () => {
            if (!processingComplete) {
                clearTimeout(timeout);
                reject(new Error('Conexión cerrada sin respuesta del servicio de perfil'));
            }
        });
    });
}

// Función para gestionar perfil
async function handleProfileManagement(inquirer, usuario) {
    while (true) {
        const { profileAction } = await inquirer.prompt([{
            type: 'list', name: 'profileAction', message: '📋 Gestión de Perfil:',
            choices: [
                { name: '👤 Ver perfil completo', value: 'view' },
                { name: '🏠 Agregar dirección', value: 'add_address' },
                { name: '💳 Agregar método de pago', value: 'add_payment' },
                new inquirer.Separator(),
                { name: '↩️ Volver al menú principal', value: 'back' }
            ]
        }]);

        if (profileAction === 'back') break;

        try {
            switch (profileAction) {
                case 'view':
                    console.log('🔍 Obteniendo información del perfil...');
                    const profileResponse = await sendProfileRequest({
                        action: 'ver_perfil',
                        correo: usuario.correo
                    });
                    
                    if (profileResponse.status === 'success') {
                        const perfil = JSON.parse(profileResponse.data);
                        console.log('\n📋 INFORMACIÓN DEL PERFIL:');
                        console.log(`📧 Correo: ${perfil.correo}`);
                        console.log(`👤 Nombre: ${perfil.nombre || 'No especificado'}`);
                        console.log(`🏠 Direcciones: ${perfil.direcciones?.length || 0}`);
                        console.log(`💳 Métodos de pago: ${perfil.metodos_pago?.length || 0}`);
                        console.log(`🌟 ASAIpoints: ${perfil.asai_points || 0}`);
                        
                        if (perfil.direcciones && perfil.direcciones.length > 0) {
                            console.log('\n🏠 DIRECCIONES:');
                            perfil.direcciones.forEach((dir, index) => {
                                console.log(`  ${index + 1}. ${dir.nombre_direccion || 'Sin nombre'}: ${dir.calle}, ${dir.ciudad}, ${dir.region} (${dir.codigo_postal})`);
                            });
                        }
                        
                        if (perfil.metodos_pago && perfil.metodos_pago.length > 0) {
                            console.log('\n💳 MÉTODOS DE PAGO:');
                            perfil.metodos_pago.forEach((pago, index) => {
                                console.log(`  ${index + 1}. ${pago.tipo}: ${pago.detalle} (Exp: ${pago.expiracion})`);
                            });
                        }
                    } else {
                        console.log(`❌ Error: ${profileResponse.message}`);
                    }
                    await inquirer.prompt([{ type: 'list', name: 'continue', message: 'Presiona Enter para continuar.', choices: ['Ok'] }]);
                    break;

                case 'add_address':
                    const direccion = await inquirer.prompt([
                        { name: 'nombre_direccion', message: '🏷️  Nombre de la dirección:' },
                        { name: 'calle', message: '🛣️  Calle:' },
                        { name: 'ciudad', message: '🏙️  Ciudad:' },
                        { name: 'region', message: '🌎 Región:' },
                        { name: 'codigo_postal', message: '📮 Código postal:' }
                    ]);
                    
                    console.log('💾 Guardando dirección...');
                    const addAddressResponse = await sendProfileRequest({
                        action: 'agregar_direccion',
                        correo: usuario.correo,
                        direccion: direccion
                    });
                    
                    if (addAddressResponse.status === 'success') {
                        console.log(`✅ ${addAddressResponse.data}`);
                    } else {
                        console.log(`❌ Error: ${addAddressResponse.message}`);
                    }
                    break;

                case 'add_payment':
                    const metodoPago = await inquirer.prompt([
                        { 
                            type: 'list', name: 'tipo', message: '💳 Tipo de método de pago:',
                            choices: ['Visa', 'Tarjeta de Crédito', 'PayPal', 'Otro']
                        },
                        { name: 'detalle', message: '💳 Detalle del método de pago:' },
                        { name: 'expiracion', message: '📅 Fecha de expiración (MM/YY):' }
                    ]);
                    
                    console.log('💾 Guardando método de pago...');
                    const addPaymentResponse = await sendProfileRequest({
                        action: 'agregar_pago',
                        correo: usuario.correo,
                        metodo_pago: metodoPago
                    });
                    
                    if (addPaymentResponse.status === 'success') {
                        console.log(`✅ ${addPaymentResponse.data}`);
                    } else {
                        console.log(`❌ Error: ${addPaymentResponse.message}`);
                    }
                    break;
            }
        } catch (error) {
            console.error(`\n❌ Error en la gestión del perfil: ${error.message}`);
        }
    }
}

// Función específica para enviar peticiones al servicio de órdenes (que usa el bus)
function sendOrderRequest(requestPayload) {
    return new Promise((resolve, reject) => {
        const clientSocket = new net.Socket();
        let responseReceived = false;
        
        const timeout = setTimeout(() => {
            if (!responseReceived) {
                responseReceived = true;
                reject(new Error("Timeout de 10s para la operación con el servicio de órdenes"));
                clientSocket.destroy();
            }
        }, 10000);

        clientSocket.on('error', (err) => {
            if (!responseReceived) {
                responseReceived = true;
                clearTimeout(timeout);
                reject(new Error(`Error de conexión al servicio de órdenes: ${err.message}`));
            }
        });
        
        clientSocket.connect(5001, 'localhost', () => {
            // Formato específico que espera orderService: service(5) + payload
            const service = 'order'.padEnd(5, ' ');
            const payload = service + JSON.stringify(requestPayload);
            const header = String(payload.length).padStart(5, '0');
            const fullMessage = header + payload;
            clientSocket.write(fullMessage);
        });

        let responseBuffer = '';
        
        clientSocket.on('data', (data) => {
            if (responseReceived) return;
            
            responseBuffer += data.toString();
            
            while (responseBuffer.length >= 5) {
                const length = parseInt(responseBuffer.substring(0, 5), 10);
                if (isNaN(length) || responseBuffer.length < 5 + length) break;
                
                const fullMessage = responseBuffer.substring(0, 5 + length);
                responseBuffer = responseBuffer.substring(5 + length);
                
                // Formato de respuesta: service(5) + status(2) + JSON
                if (fullMessage.length >= 12) {
                    const status = fullMessage.substring(10, 12).trim();
                    const messageContent = fullMessage.substring(12);

                    try {
                        const responseData = JSON.parse(messageContent);
                        if (status === 'OK') {
                            if (responseData.error) {
                                reject(new Error(responseData.error));
                            } else {
                                resolve(responseData);
                            }
                        } else {
                            reject(new Error(`Error del servicio de órdenes: ${messageContent}`));
                        }
                    } catch (e) {
                        reject(new Error(`Error al procesar respuesta del servicio de órdenes: ${e.message}`));
                    }
                    
                    responseReceived = true;
                    clearTimeout(timeout);
                    clientSocket.end();
                    break;
                }
            }
        });

        clientSocket.on('close', () => {
            if (!responseReceived) {
                responseReceived = true;
                clearTimeout(timeout);
                reject(new Error('Conexión cerrada sin respuesta del servicio de órdenes'));
            }
        });
    });
}

// Función para gestionar órdenes
async function handleOrderManagement(inquirer, usuario) {
    const { orderAction } = await inquirer.prompt([{
        type: 'list', name: 'orderAction', message: '📦 Gestión de Órdenes:',
        choices: [
            { name: '📋 Ver mis órdenes', value: 'view' },
            { name: '🛍️ Crear nueva orden', value: 'create' },
            new inquirer.Separator(),
            { name: '↩️ Volver al menú principal', value: 'back' }
        ]
    }]);

    if (orderAction === 'back') return;

    try {
        if (orderAction === 'view') {
            console.log("\n🔍 Buscando tus órdenes...");
            const findRequest = { action: 'find_orders', payload: { email: usuario.correo } };
            const responseData = await sendOrderRequest(findRequest);
            
            if (!responseData || responseData.length === 0) {
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
        } else if (orderAction === 'create') {
            console.log('\n--- 🛍️ Creando Nueva Orden ---');
            console.log('⚠️  Esta función requiere productos específicos y está diseñada para uso avanzado.');
            console.log('💡 Sugerencia: Usa el carrito de compras para crear órdenes normalmente.');
            
            const { confirmCreate } = await inquirer.prompt([{
                type: 'confirm', name: 'confirmCreate', message: '¿Deseas continuar con la creación manual?', default: false
            }]);
            
            if (confirmCreate) {
                console.log('🚧 Funcionalidad de creación manual no implementada aún.');
                console.log('💡 Usa el carrito de compras para crear órdenes de manera fácil y segura.');
            }
        }
    } catch (error) {
        console.error(`\n❌ Error en la gestión de órdenes: ${error.message}`);
    }
}

// Función específica para enviar peticiones al servicio de reseñas (que usa el bus)
function sendReviewRequest(requestPayload) {
    return new Promise((resolve, reject) => {
        const clientSocket = new net.Socket();
        let responseReceived = false;
        
        const timeout = setTimeout(() => {
            if (!responseReceived) {
                responseReceived = true;
                reject(new Error("Timeout de 10s para la operación con el servicio de reseñas"));
                clientSocket.destroy();
            }
        }, 10000);

        clientSocket.on('error', (err) => {
            if (!responseReceived) {
                responseReceived = true;
                clearTimeout(timeout);
                reject(new Error(`Error de conexión al servicio de reseñas: ${err.message}`));
            }
        });
        
        clientSocket.connect(5001, 'localhost', () => {
            // Formato específico que espera reseñaService: service(5) + payload
            const service = 'rview'.padEnd(5, ' ');
            const payload = service + JSON.stringify(requestPayload);
            const header = String(payload.length).padStart(5, '0');
            const fullMessage = header + payload;
            clientSocket.write(fullMessage);
        });

        let responseBuffer = '';
        
        clientSocket.on('data', (data) => {
            if (responseReceived) return;
            
            responseBuffer += data.toString();
            
            while (responseBuffer.length >= 5) {
                const length = parseInt(responseBuffer.substring(0, 5), 10);
                if (isNaN(length) || responseBuffer.length < 5 + length) break;
                
                const fullMessage = responseBuffer.substring(0, 5 + length);
                responseBuffer = responseBuffer.substring(5 + length);
                
                // Formato de respuesta: service(5) + status(2) + JSON
                if (fullMessage.length >= 12) {
                    const status = fullMessage.substring(10, 12).trim();
                    const messageContent = fullMessage.substring(12);

                    try {
                        const responseData = JSON.parse(messageContent);
                        if (status === 'OK') {
                            if (responseData.error) {
                                reject(new Error(responseData.error));
                            } else {
                                resolve(responseData);
                            }
                        } else {
                            reject(new Error(`Error del servicio de reseñas: ${messageContent}`));
                        }
                    } catch (e) {
                        reject(new Error(`Error al procesar respuesta del servicio de reseñas: ${e.message}`));
                    }
                    
                    responseReceived = true;
                    clearTimeout(timeout);
                    clientSocket.end();
                    break;
                }
            }
        });

        clientSocket.on('close', () => {
            if (!responseReceived) {
                responseReceived = true;
                clearTimeout(timeout);
                reject(new Error('Conexión cerrada sin respuesta del servicio de reseñas'));
            }
        });
    });
}

// Función para gestionar reseñas
async function handleReviewManagement(inquirer, usuario) {
    console.log('\n--- ✍️ Crear Nueva Reseña ---');
    
    try {
        // Necesitamos conectar a la DB para obtener las órdenes
        const { connectDB } = require('../../database/db.js');
        const Order = require('../../database/models/order.model.js');
        
        await connectDB();
        
        // Obtener órdenes del usuario
        const orders = await Order.find({ user_id: usuario._id }).sort({ createdAt: -1 });
        
        if (!orders || orders.length === 0) {
            console.log("❌ No tienes pedidos realizados. Necesitas comprar productos para poder reseñarlos.");
            return;
        }

        console.log('\n--- 📜 Tus Pedidos ---');
        const orderChoices = [];
        const itemDetailsMap = new Map();

        orders.forEach(order => {
            order.items.forEach(item => {
                const choiceName = `Pedido ${order._id.toString().substring(18)}... | ${item.cantidad}x ${item.nombre} (${item.talla}/${item.color})`;
                const choiceValue = `${order._id.toString()}:${item.producto_variacion_id.toString()}`;
                orderChoices.push({ name: choiceName, value: choiceValue });
                itemDetailsMap.set(choiceValue, {
                    orderId: order._id.toString(),
                    productId: item.producto_id.toString(),
                    variationId: item.producto_variacion_id.toString(),
                    productName: item.nombre,
                    itemSnapshot: item
                });
            });
        });

        if (orderChoices.length === 0) {
            console.log("❌ No hay productos en tus pedidos que puedan ser reseñados.");
            return;
        }

        const { selectedItemKey } = await inquirer.prompt([{
            type: 'list', name: 'selectedItemKey', message: '📦 Selecciona un producto para reseñar:',
            choices: orderChoices
        }]);

        const selectedItem = itemDetailsMap.get(selectedItemKey);
        console.log(`✅ Producto seleccionado: ${selectedItem.productName}`);

        const { puntuacion } = await inquirer.prompt([{
            type: 'number', name: 'puntuacion', message: '⭐ Puntuación (1-5):', default: 5,
            validate: (num) => (num >= 1 && num <= 5) || 'La puntuación debe ser entre 1 y 5.'
        }]);

        const { comentario } = await inquirer.prompt([{
            type: 'input', name: 'comentario', message: '💬 Comentario (opcional):'
        }]);

        const reviewRequest = {
            user_id: usuario._id.toString(),
            product_id: selectedItem.productId,
            product_variation_id: selectedItem.variationId,
            puntuacion: puntuacion,
            comentario: comentario.trim()
        };

        console.log('\n📝 Enviando reseña...');
        const reviewResponse = await sendReviewRequest(reviewRequest);
        console.log('✅ ¡ÉXITO! Reseña procesada correctamente:');
        console.log(JSON.stringify(reviewResponse, null, 2));

    } catch (error) {
        console.error(`\n❌ Error en la gestión de reseñas: ${error.message}`);
    }
}

// --- Funciones de Flujo de la Aplicación ---

async function handleAuthentication(inquirer, actionType) {
    const isLogin = actionType === 'login';
    const serviceToCall = isLogin ? 'logns' : 'auths';
    const promptTitle = isLogin ? '--- Iniciar Sesión ---' : '--- Registrar Nuevo Usuario ---';
    
    console.log(`\n${promptTitle}`);
    const credentials = await inquirer.prompt([
        { type: 'input', name: 'correo', message: 'Correo electrónico:' },
        { type: 'password', name: 'password', message: 'Contraseña:' }
    ]);
    return sendRequestAndWait(serviceToCall, credentials);
}

async function handleAdminTasks(inquirer, adminUser) {
    while (true) {
        const { adminAction } = await inquirer.prompt([{
            type: 'list',
            name: 'adminAction',
            message: 'Menú de Administrador:',
            choices: ['Crear Producto', 'Editar Producto', 'Eliminar Producto', 'Listar Productos', 'Salir'],
        }]);
        if (adminAction === 'Salir') break;

        let operation = '';
        let payload = {};
        switch (adminAction) {
            case 'Crear Producto':
                operation = 'crearProducto';
                const pDetails = await inquirer.prompt([{ name: 'nombre', message: 'Nombre:' }, { name: 'marca', message: 'Marca:' }, { name: 'talla', message: 'Talla:' }, { name: 'color', message: 'Color:' }, { name: 'precio', message: 'Precio:', type: 'number' }, { name: 'stock', message: 'Stock:', type: 'number' }]);
                payload = { nombre: pDetails.nombre, marca: pDetails.marca, variaciones: [{ talla: pDetails.talla, color: pDetails.color, precio: pDetails.precio, stock: pDetails.stock }] };
                break;
            case 'Editar Producto':
                operation = 'editarProducto';
                const { productoId: editId } = await inquirer.prompt([{ name: 'productoId', message: 'ID del producto a editar:' }]);
                
                // Primero listar las variaciones del producto para que el usuario sepa cuál editar
                console.log('\n--- Obteniendo información del producto ---');
                try {
                    const productInfo = await sendRequestAndWait('admin', { 
                        userId: adminUser._id, 
                        operation: 'obtenerProducto', 
                        payload: { productoId: editId } 
                    });
                    
                    console.log(`\nProducto: ${productInfo.data.nombre} (${productInfo.data.marca})`);
                    console.log('Variaciones disponibles:');
                    productInfo.data.variaciones.forEach((v, index) => {
                        console.log(`  ${index}: Talla ${v.talla}, Color ${v.color}, Precio $${v.precio}, Stock ${v.stock}`);
                    });
                } catch (e) {
                    console.log('No se pudo obtener la información del producto, continuando...');
                }
                
                const updates = await inquirer.prompt([
                    { name: 'nombre', message: 'Nuevo nombre (deja vacío para no cambiar):' },
                    { name: 'marca', message: 'Nueva marca (deja vacío para no cambiar):' },
                    { name: 'variacionIndex', message: 'Índice de variación a editar (deja vacío para no cambiar variaciones):', type: 'number' },
                    { name: 'talla', message: 'Nueva talla (deja vacío para no cambiar):' },
                    { name: 'color', message: 'Nuevo color (deja vacío para no cambiar):' },
                    { name: 'precio', message: 'Nuevo precio (deja vacío para no cambiar):', type: 'number' },
                    { name: 'stock', message: 'Nuevo stock (deja vacío para no cambiar):', type: 'number' }
                ]);
                
                // Elimina campos vacíos
                Object.keys(updates).forEach(k => { 
                    if (updates[k] === '' || updates[k] === undefined || updates[k] === null) delete updates[k]; 
                });
                
                payload = { productoId: editId, updates };
                break;
            case 'Eliminar Producto':
                operation = 'eliminarProducto';
                const { productoId: deleteId } = await inquirer.prompt([{ name: 'productoId', message: 'ID del producto a eliminar:' }]);
                payload = { productoId: deleteId };
                break;
            case 'Listar Productos':
                await handleAdminProductListing(inquirer, adminUser);
                continue; // Volver al menú de admin después de listar productos
        }
        
        try {
            const adminResponse = await sendRequestAndWait('admin', { userId: adminUser._id, operation, payload });
            
            if (operation === 'listarProductos') {
                const { productos, total, limit, skip } = adminResponse.data;
                console.log(`\n✅ Lista de productos (${productos.length} de ${total} totales):`);
                if (productos.length === 0) {
                    console.log('  No hay productos registrados.');
                } else {
                    productos.forEach((producto, index) => {
                        console.log(`\n  ${index + 1}. ${producto.nombre} (${producto.marca})`);
                        console.log(`     ID: ${producto.id}`);
                        console.log(`     Variaciones: ${producto.vars}`);
                    });
                    
                    // Ofrecer ver detalles de un producto específico
                    const { verDetalles } = await inquirer.prompt([{
                        type: 'confirm',
                        name: 'verDetalles',
                        message: '¿Deseas ver los detalles de algún producto?',
                        default: false
                    }]);
                    
                    if (verDetalles) {
                        const { productoSeleccionado } = await inquirer.prompt([{
                            type: 'input',
                            name: 'productoSeleccionado',
                            message: 'Ingresa el ID del producto para ver sus detalles:'
                        }]);
                        
                        try {
                            const detalleResponse = await sendRequestAndWait('admin', { 
                                userId: adminUser._id, 
                                operation: 'obtenerProducto', 
                                payload: { productoId: productoSeleccionado } 
                            });
                            
                            const prod = detalleResponse.data;
                            console.log(`\n📋 Detalles del producto:`);
                            console.log(`   Nombre: ${prod.nombre}`);
                            console.log(`   Marca: ${prod.marca}`);
                            console.log(`   ID: ${prod._id}`);
                            console.log(`   Variaciones:`);
                            prod.variaciones.forEach((v, i) => {
                                console.log(`     ${i}: Talla ${v.talla}, Color ${v.color}, $${v.precio}, Stock: ${v.stock}`);
                            });
                        } catch (e) {
                            console.error(`   ❌ Error al obtener detalles: ${e.message}`);
                        }
                    }
                }
            } else {
                console.log('\n✅ Operación de Admin exitosa:', JSON.stringify(adminResponse.data, null, 2));
            }
        } catch (e) {
            console.error(`\n❌ Error del servicio de Admin: ${e.message}`);
        }
    }
}

async function handleAsaiChat(inquirer, user) {
    console.log('\n--- 💬 Charlando con ASAI ---');
    console.log('💡 COMANDOS RÁPIDOS:');
    console.log('• Escribe "exit" o "salir" para volver al menú principal');
    console.log('• Escribe "ayuda" para ver todos los comandos disponibles');
    console.log('• Escribe "buscar [producto]" para buscar productos');
    console.log('• Escribe "estado de mi pedido" para ver tus pedidos\n');

    // Mensaje inicial de bienvenida de ASAI
    try {
        const welcomeResponse = await sendRequestAndWait('asais', { userId: user._id, query: 'hola' });
        if (welcomeResponse.status === 'success') {
            console.log(`🤖 ASAI: ${welcomeResponse.data.respuesta}\n`);
        }
    } catch (e) {
        console.log('🤖 ASAI: ¡Hola! Soy ASAI, tu asistente virtual. ¿En qué puedo ayudarte hoy?\n');
    }

    while (true) {
        const { consulta } = await inquirer.prompt([{ 
            type: 'input', 
            name: 'consulta', 
            message: '🧑‍💻 Tú:' 
        }]);
        
        // Verificar comandos de salida localmente para respuesta más rápida
        const consultaLower = consulta.trim().toLowerCase();
        if (consultaLower === 'salir' || consultaLower === 'exit' || consultaLower === 'quit') {
            console.log('🤖 ASAI: ¡Hasta luego! Volviendo al menú principal...');
            break;
        }

        try {
            const response = await sendRequestAndWait('asais', { userId: user._id, query: consulta });
            
            if (response.status === 'success') {
                console.log(`🤖 ASAI: ${response.data.respuesta}`);
            } else if (response.status === 'exit') {
                console.log(`🤖 ASAI: ${response.data.respuesta}`);
                break; // Salir del bucle cuando ASAI indica salida
            } else {
                console.log(`🤖 ASAI (error): ${response.message}`);
            }
        } catch (e) {
            console.log('❌ Error en la sesión con ASAI:', e.message);
            console.log('🔄 Volviendo al menú principal...');
            break;
        }
    }
}

function displayAdminProducts(products, title = 'Lista de Productos de Admin') {
    if (!products || !Array.isArray(products) || products.length === 0) {
        console.log(`\n-- No se encontraron productos en "${title}". --`);
        return;
    }
    console.log(`\n--- 📜 ${title} ---\n`);
    products.forEach((p, index) => {
        console.log(`${index + 1}. 📦 Nombre: ${p.nombre || 'N/A'} [ID: ${p.id}]`);
        console.log(`   Marca: ${p.marca || 'N/A'}`);
        console.log(`   Variaciones: ${p.vars || 0}`);
        console.log('----------------------------------------------------');
    });
}

async function handleAdminProductListing(inquirer, adminUser) {
    const ADMIN_PAGE_SIZE = 5; // Tamaño de página para admin
    let currentPage = 1;
    let totalPages = 1;

    while (true) {
        try {
            console.log(`\nSolicitando página ${currentPage} de productos...`);
            
            // Calcular skip basado en la página actual
            const skip = (currentPage - 1) * ADMIN_PAGE_SIZE;
            
            const response = await sendRequestAndWait('admin', {
                userId: adminUser._id,
                operation: 'listarProductos',
                payload: { limit: ADMIN_PAGE_SIZE, skip: skip, filtros: {} }
            });

            if (!response || !response.data || !response.data.productos) {
                console.log("\n❌ Error: Respuesta inválida del servicio de administración.");
                break;
            }

            const { productos, total, limit, skip: currentSkip } = response.data;
            totalPages = Math.ceil(total / ADMIN_PAGE_SIZE);

            const title = `Lista de Productos - Admin (Página ${currentPage}/${totalPages} - ${total} productos en total)`;
            displayAdminProducts(productos, title);

            // Si no hay productos en la primera página
            if (total === 0) {
                await inquirer.prompt([{ 
                    type: 'list', 
                    name: 'continue', 
                    message: 'No se encontraron productos. Presiona Enter para volver.', 
                    choices: ['Ok'] 
                }]);
                break;
            }

            // Crear opciones del menú de navegación
            const navigationChoices = [];

            // Opciones de navegación
            if (currentPage > 1) {
                navigationChoices.push({ name: '⬅️  Página Anterior', value: 'prev_page' });
            }
            if (currentPage < totalPages) {
                navigationChoices.push({ name: 'Página Siguiente ➡️', value: 'next_page' });
            }

            // Separador si hay opciones de navegación
            if (navigationChoices.length > 0) {
                navigationChoices.push(new inquirer.Separator());
            }

            // Opciones de acción sobre productos
            if (productos && productos.length > 0) {
                navigationChoices.push({ name: '🔍 Ver detalles de un producto', value: 'view_details' });
                navigationChoices.push({ name: '✏️  Editar un producto', value: 'edit_product' });
                navigationChoices.push({ name: '🗑️  Eliminar un producto', value: 'delete_product' });
                navigationChoices.push(new inquirer.Separator());
            }

            // Salir
            navigationChoices.push({ name: '↩️ Volver al menú de administrador', value: 'back' });

            const { action } = await inquirer.prompt([{
                type: 'list',
                name: 'action',
                message: 'Navegación y acciones:',
                choices: navigationChoices,
                pageSize: 8
            }]);

            switch (action) {
                case 'back':
                    return; // Salir de la función
                case 'prev_page':
                    currentPage--;
                    break;
                case 'next_page':
                    currentPage++;
                    break;
                case 'view_details':
                    await handleViewProductDetails(inquirer, adminUser, productos);
                    break;
                case 'edit_product':
                    await handleEditProductFromList(inquirer, adminUser, productos);
                    break;
                case 'delete_product':
                    await handleDeleteProductFromList(inquirer, adminUser, productos);
                    // Recargar la página actual después de eliminar
                    break;
            }

        } catch (error) {
            console.error("\n❌ Error durante la navegación de productos:", error.message);
            break;
        }
    }
}

async function handleViewProductDetails(inquirer, adminUser, productos) {
    const { productoSeleccionado } = await inquirer.prompt([{
        type: 'list',
        name: 'productoSeleccionado',
        message: 'Selecciona el producto para ver detalles:',
        choices: productos.map((p, index) => ({
            name: `${index + 1}. ${p.nombre} (${p.marca})`,
            value: p.id
        }))
    }]);

    try {
        const detalleResponse = await sendRequestAndWait('admin', {
            userId: adminUser._id,
            operation: 'obtenerProducto',
            payload: { productoId: productoSeleccionado }
        });

        const prod = detalleResponse.data;
        console.log(`\n📋 Detalles del producto:`);
        console.log(`   Nombre: ${prod.nombre}`);
        console.log(`   Marca: ${prod.marca}`);
        console.log(`   ID: ${prod._id}`);
        console.log(`   Variaciones:`);
        prod.variaciones.forEach((v, i) => {
            console.log(`     ${i}: Talla ${v.talla}, Color ${v.color}, $${v.precio}, Stock: ${v.stock}`);
        });

        await inquirer.prompt([{
            type: 'list',
            name: 'continue',
            message: 'Presiona Enter para continuar.',
            choices: ['Ok']
        }]);

    } catch (e) {
        console.error(`   ❌ Error al obtener detalles: ${e.message}`);
    }
}

async function handleEditProductFromList(inquirer, adminUser, productos) {
    const { productoSeleccionado } = await inquirer.prompt([{
        type: 'list',
        name: 'productoSeleccionado',
        message: 'Selecciona el producto a editar:',
        choices: productos.map((p, index) => ({
            name: `${index + 1}. ${p.nombre} (${p.marca})`,
            value: p.id
        }))
    }]);

    // Obtener información actual del producto
    try {
        const productInfo = await sendRequestAndWait('admin', {
            userId: adminUser._id,
            operation: 'obtenerProducto',
            payload: { productoId: productoSeleccionado }
        });

        console.log(`\nProducto: ${productInfo.data.nombre} (${productInfo.data.marca})`);
        console.log('Variaciones disponibles:');
        productInfo.data.variaciones.forEach((v, index) => {
            console.log(`  ${index}: Talla ${v.talla}, Color ${v.color}, Precio $${v.precio}, Stock ${v.stock}`);
        });
    } catch (e) {
        console.log('No se pudo obtener la información del producto, continuando...');
    }

    const updates = await inquirer.prompt([
        { name: 'nombre', message: 'Nuevo nombre (deja vacío para no cambiar):' },
        { name: 'marca', message: 'Nueva marca (deja vacío para no cambiar):' },
        { name: 'variacionIndex', message: 'Índice de variación a editar (deja vacío para no cambiar variaciones):', type: 'number' },
        { name: 'talla', message: 'Nueva talla (deja vacío para no cambiar):' },
        { name: 'color', message: 'Nuevo color (deja vacío para no cambiar):' },
        { name: 'precio', message: 'Nuevo precio (deja vacío para no cambiar):', type: 'number' },
        { name: 'stock', message: 'Nuevo stock (deja vacío para no cambiar):', type: 'number' }
    ]);

    // Elimina campos vacíos
    Object.keys(updates).forEach(k => {
        if (updates[k] === '' || updates[k] === undefined || updates[k] === null) delete updates[k];
    });

    try {
        const editResponse = await sendRequestAndWait('admin', {
            userId: adminUser._id,
            operation: 'editarProducto',
            payload: { productoId: productoSeleccionado, updates }
        });
        console.log('\n✅ Producto editado exitosamente.');
    } catch (e) {
        console.error(`\n❌ Error al editar producto: ${e.message}`);
    }
}

async function handleDeleteProductFromList(inquirer, adminUser, productos) {
    const { productoSeleccionado } = await inquirer.prompt([{
        type: 'list',
        name: 'productoSeleccionado',
        message: 'Selecciona el producto a eliminar:',
        choices: productos.map((p, index) => ({
            name: `${index + 1}. ${p.nombre} (${p.marca})`,
            value: p.id
        }))
    }]);

    const { confirmDelete } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmDelete',
        message: '¿Estás seguro de que quieres eliminar este producto?',
        default: false
    }]);

    if (confirmDelete) {
        try {
            const deleteResponse = await sendRequestAndWait('admin', {
                userId: adminUser._id,
                operation: 'eliminarProducto',
                payload: { productoId: productoSeleccionado }
            });
            console.log('\n✅ Producto eliminado exitosamente.');
        } catch (e) {
            console.error(`\n❌ Error al eliminar producto: ${e.message}`);
        }
    } else {
        console.log('\n❌ Eliminación cancelada.');
    }
}

// --- Función Principal ---

async function run() {
    const inquirer = (await import('inquirer')).default;

    try {
        await new Promise((resolve, reject) => {
            clientSocket.connect({ host: BUS_HOST, port: BUS_PORT }, resolve);
            clientSocket.once('error', reject);
        });
        console.log(`[Cliente] Conectado al bus. Mi ID es: ${CLIENT_ID}`);
        sendMessage('sinit', CLIENT_ID);
        await new Promise(r => setTimeout(r, 100)); // Pequeño delay para asegurar registro

        let loggedInUser = null;
        while (!loggedInUser) {
            const { initialAction } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'initialAction',
                    message: 'Bienvenido a VirtualFit. ¿Qué deseas hacer?',
                    choices: ['Iniciar sesión', 'Registrar un nuevo usuario', 'Salir'],
                }
            ]);
            if (initialAction === 'Salir') return;

            try {
                const response = await handleAuthentication(inquirer, initialAction === 'Iniciar sesión' ? 'login' : 'register');
                loggedInUser = response.data;
            } catch (error) {
                console.error(`\n❌ Error de autenticación: ${error.message}`);
                const { retry } = await inquirer.prompt([{ type: 'confirm', name: 'retry', message: '¿Volver al menú principal?', default: true }]);
                if (!retry) return;
            }
        }
        
        console.log(`\n✅ ¡Acción exitosa! Bienvenido, ${loggedInUser.correo}. (Rol: ${loggedInUser.rol})`);
        
        if (loggedInUser.rol === 'admin') {
            await handleAdminTasks(inquirer, loggedInUser);
        } else {
            // Menú expandido para cliente
            let clientExit = false;
            while (!clientExit) {
                const { clientAction } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'clientAction',
                        message: 'Menú de Cliente:',
                        choices: [
                            { name: '💬 Charlar con ASAI', value: 'chat' },
                            new inquirer.Separator(),
                            { name: '📚 Ver Catálogo de Productos', value: 'catalog' },
                            { name: '🔍 Buscar Productos', value: 'search' },
                            { name: '💖 Mi Lista de Deseos', value: 'wishlist' },
                            { name: '🛒 Mi Carrito', value: 'cart' },
                            new inquirer.Separator(),
                            { name: '👤 Gestionar Perfil', value: 'profile' },
                            { name: '📦 Mis Órdenes', value: 'orders' },
                            { name: '✍️ Crear Reseña', value: 'review' },
                            new inquirer.Separator(),
                            { name: '🚪 Salir', value: 'exit' }
                        ],
                    },
                ]);
                
                switch (clientAction) {
                    case 'chat':
                        await handleAsaiChat(inquirer, loggedInUser);
                        break;
                    case 'catalog':
                        await handleCatalogManagement(inquirer, loggedInUser._id.toString());
                        break;
                    case 'search':
                        await handleProductSearch(inquirer, loggedInUser._id.toString());
                        break;
                    case 'wishlist':
                        await handleWishlistManagement(inquirer, loggedInUser._id.toString());
                        break;
                    case 'cart':
                        const paymentSuccess = await handleCartManagement(inquirer, loggedInUser);
                        if (paymentSuccess) {
                            console.log('\n🎉 ¡Compra realizada exitosamente!');
                            // Actualizar información del usuario después de la compra
                            const { connectDB } = require('../../database/db.js');
                            const User = require('../../database/models/user.model.js');
                            await connectDB();
                            const updatedUser = await User.findById(loggedInUser._id);
                            if (updatedUser) {
                                loggedInUser.asai_points = updatedUser.asai_points;
                                console.log(`✨ Tu nuevo saldo de ASAIpoints: ${updatedUser.asai_points}`);
                            }
                        }
                        break;
                    case 'profile':
                        await handleProfileManagement(inquirer, loggedInUser);
                        break;
                    case 'orders':
                        await handleOrderManagement(inquirer, loggedInUser);
                        break;
                    case 'review':
                        await handleReviewManagement(inquirer, loggedInUser);
                        break;
                    case 'exit':
                        clientExit = true;
                        break;
                }
            }
        }
    } catch (error) {
        console.error('\n❌ Error crítico en el flujo principal:', error.message);
    } finally {
        if (!clientSocket.destroyed) clientSocket.destroy();
        console.log('\n[Cliente] Proceso finalizado.');
    }
}

/* HABLAR CON ASAI:
"buscar zapatillas"
"buscar productos nike"
"buscar polera azul"
"muéstrame poleras adidas"
"estado de mi pedido"
*/

run();