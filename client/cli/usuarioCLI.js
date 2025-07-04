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
    console.log(`[Cliente] Datos recibidos: ${chunk.toString().substring(0, 50)}...`);
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
    //console.log(`[Cliente] DEBUG - processBuffer: buffer length = ${buffer.length}`);
    
    // Limpiar timeout anterior si existe
    if (processBufferTimeout) {
        clearTimeout(processBufferTimeout);
        processBufferTimeout = null;
    }
    
    while (buffer.length >= 5) {
        const lengthStr = buffer.substring(0, 5);
        const length = parseInt(lengthStr, 10);
        
        if (isNaN(length) || length < 0 || length > 100000) {
            //console.error(`[Cliente] Header inválido: '${lengthStr}', buscando siguiente header válido...`);
            
            // Buscar el siguiente header válido en el buffer
            let nextHeaderPos = -1;
            for (let i = 1; i < buffer.length - 4; i++) {
                const potentialHeader = buffer.substring(i, i + 5);
                const potentialLength = parseInt(potentialHeader, 10);
                if (!isNaN(potentialLength) && potentialLength > 0 && potentialLength < 10000) {
                    // Verificar que el mensaje completo esté disponible
                    if (i + 5 + potentialLength <= buffer.length) {
                        // Verificar que el formato del mensaje sea correcto
                        const testMessage = buffer.substring(i + 5, i + 17);
                        if (testMessage.length >= 12 && testMessage.includes('admin')) {
                            nextHeaderPos = i;
                            //console.log(`[Cliente] DEBUG - Encontrado header válido en posición ${i}: '${potentialHeader}'`);
                            break;
                        }
                    }
                }
            }
            
            if (nextHeaderPos > 0) {
                buffer = buffer.substring(nextHeaderPos);
                continue;
            } else {
                console.error(`[Cliente] No se encontró header válido, limpiando buffer`);
                buffer = '';
                break;
            }
        }
        
        //console.log(`[Cliente] DEBUG - Esperando mensaje de longitud: ${length}, tenemos: ${buffer.length}`);
        
        const expectedTotalLength = 5 + length;
        if (buffer.length < expectedTotalLength) {
            //console.log(`[Cliente] DEBUG - Mensaje incompleto, esperando más datos... Faltan ${expectedTotalLength - buffer.length} bytes`);
            
            // Reintentar después de un pequeño delay para permitir más datos
            processBufferTimeout = setTimeout(() => {
                if (buffer.length >= expectedTotalLength) {
                    processBuffer();
                } else {
                    console.log(`[Cliente] DEBUG - Timeout esperando datos después de 300ms`);
                    // Si la diferencia es muy pequeña (1-2 bytes), puede ser un problema de encoding
                    if (buffer.length >= expectedTotalLength - 2) {
                        console.log(`[Cliente] DEBUG - Diferencia mínima detectada, procesando mensaje disponible`);
                        const availableMessage = buffer.substring(0, buffer.length);
                        buffer = '';
                        handleMessage(availableMessage);
                    } else {
                        // Para diferencias mayores, intentar procesar si al menos tenemos la mayoría del mensaje
                        console.log(`[Cliente] DEBUG - Diferencia mayor detectada (${expectedTotalLength - buffer.length} bytes), intentando procesar mensaje parcial`);
                        if (buffer.length >= expectedTotalLength * 0.95) { // Si tenemos al menos 95% del mensaje
                            const availableMessage = buffer.substring(0, buffer.length);
                            buffer = '';
                            handleMessage(availableMessage);
                        } else {
                            console.log(`[Cliente] DEBUG - Mensaje muy incompleto, descartando`);
                            buffer = '';
                        }
                    }
                }
            }, 300);
            break;
        }
        
        // Extraer exactamente la cantidad de bytes especificada en el header
        const fullMessage = buffer.substring(0, expectedTotalLength);
        buffer = buffer.substring(expectedTotalLength);
       // console.log(`[Cliente] DEBUG - Procesando mensaje completo de ${fullMessage.length} bytes (esperado: ${expectedTotalLength})`);
        
        // Procesar el mensaje completo
        handleMessage(fullMessage);
    }
}

function handleMessage(fullMessage) {
    //console.log(`[Cliente] DEBUG - Mensaje completo recibido (${fullMessage.length} bytes): '${fullMessage.substring(0, 50)}...'`);
    
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
    
   // console.log(`[Cliente] DEBUG - Dest: '${destination}', Service: '${serviceName}', Status: '${status}', CLIENT_ID: '${CLIENT_ID}'`);
   // console.log(`[Cliente] DEBUG - JSON length: ${responseJson.length}, first 100 chars: '${responseJson.substring(0, 100)}...'`);

    try {
        // Verificar que el JSON está completo buscando llaves balanceadas
        let braceCount = 0;
        let inString = false;
        let escaped = false;
        let jsonEnd = -1;
        
        for (let i = 0; i < responseJson.length; i++) {
            const char = responseJson[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === '"') {
                inString = !inString;
                continue;
            }
            if (!inString) {
                if (char === '{') braceCount++;
                else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        jsonEnd = i + 1;
                        break;
                    }
                }
            }
        }
        
        const completeJson = jsonEnd > 0 ? responseJson.substring(0, jsonEnd) : responseJson;
       // console.log(`[Cliente] DEBUG - JSON completo detectado con ${completeJson.length} caracteres`);
        
        const response = JSON.parse(completeJson);
       // console.log(`[Cliente] DEBUG - Respuesta parseada: correlationId='${response.correlationId}', tenemos pendiente: ${pendingResponses.has(response.correlationId)}`);
        
        if (response.correlationId && pendingResponses.has(response.correlationId)) {
            const handler = pendingResponses.get(response.correlationId);
            pendingResponses.delete(response.correlationId);
            
            if (status === 'OK') {
                //console.log(`[Cliente] DEBUG - Resolviendo promesa exitosamente`);
                handler(null, response);
            } else {
                console.log(`[Cliente] DEBUG - Resolviendo promesa con error`);
                handler(new Error(`Error del servicio ${serviceName}: ${response.message || 'Error desconocido'}`), null);
            }
        } else {
            console.log(`[Cliente] DEBUG - No se encontró handler para correlationId: ${response.correlationId}`);
        }
    } catch (e) {
       // console.error(`[Cliente] Error al procesar mensaje JSON: ${e.message}`);
       // console.error(`[Cliente] Mensaje problemático (primeros 300 chars): ${responseJson.substring(0, 300)}...`);
        //console.error(`[Cliente] Longitud total del JSON: ${responseJson.length}`);
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
    console.log('\n--- Charlando con ASAI (escribe "salir" para terminar) ---');
    console.log('PREGUNTAS SUGERIDAS: \n"buscar zapatillas", "mostrar productos nike", "tienes algo de color azul", "muéstrame poleras adidas", \n"estado de mi pedido", "mostrar precios entre (precio min) y (precio max)"\n');

    while (true) {
        const { consulta } = await inquirer.prompt([{ type: 'input', name: 'consulta', message: 'Tú:' }]);
        if (consulta.trim().toLowerCase() === 'salir') break;

        try {
            const response = await sendRequestAndWait('asais', { userId: user._id, query: consulta });
            if (response.status === 'success') {
                console.log(`ASAI: ${response.data.respuesta}`);
            } else {
                console.log(`ASAI (error): ${response.message}`);
            }
        } catch (e) {
            console.log('❌ Error en la sesión con ASAI:', e.message);
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
            const { clientAction } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'clientAction',
                    message: 'Menú de Cliente:',
                    choices: ['Charlar con ASAI', 'Salir'],
                },
            ]);
            if (clientAction === 'Charlar con ASAI') {
                await handleAsaiChat(inquirer, loggedInUser);
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