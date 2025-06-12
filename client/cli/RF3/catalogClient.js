// clients/catalogClient.js
const net = require('net');
const { mongoose } = require('../../database/db.js'); // Solo para cerrar la conexión al final

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const SERVICE_TO_CALL = 'catal'; // Servicio a llamar

// Función para construir y enviar el mensaje según el protocolo del bus
function sendMessage(socket, serviceName, data) {
    const service = serviceName.padEnd(5, ' ');
    const payload = service + JSON.stringify(data);
    const header = String(payload.length).padStart(5, '0');
    const fullMessage = header + payload;

    console.log(`\n[Cliente] -> Enviando a '${serviceName}': ${fullMessage.substring(0, 150)}...`);
    socket.write(fullMessage);
}

// Función para mostrar los productos de forma legible
function displayProducts(products) {
    if (!products || products.length === 0) {
        console.log("\n-- No se encontraron productos que coincidan con los criterios. --");
        return;
    }
    console.log(`\n--- 📜 Catálogo de Productos (${products.length} encontrados) ---\n`);
    products.forEach(p => {
        console.log(`📦 Nombre: ${p.nombre} [Marca: ${p.marca || 'N/A'}]`);
        if (p.variaciones && p.variaciones.length > 0) {
            p.variaciones.forEach(v => {
                console.log(`   - Var: ${v.color || ''} ${v.talla || ''} | Precio: $${v.precio} | Stock: ${v.stock}`);
            });
        } else {
            console.log("   - (Sin variaciones de precio/stock definidas)");
        }
        console.log('----------------------------------------------------');
    });
}

// Función que encapsula la comunicación con el bus
function sendRequest(requestPayload) {
    return new Promise((resolve, reject) => {
        const clientSocket = new net.Socket();
        clientSocket.connect(BUS_PORT, BUS_HOST, () => {
            sendMessage(clientSocket, SERVICE_TO_CALL, requestPayload);
        });

        clientSocket.on('data', (data) => {
            const rawData = data.toString();
            const serviceName = rawData.substring(5, 10).trim();
            const status = rawData.substring(10, 12).trim();
            const message = rawData.substring(12);

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
                reject(new Error(`El bus reportó un error (NK): ${message}`));
            }
            clientSocket.end();
        });

        clientSocket.on('close', () => console.log('[Cliente] Conexión cerrada.'));
        clientSocket.on('error', (err) => reject(new Error(`Error de conexión: ${err.message}`)));
    });
}


// Función principal que controla el flujo de ejecución
async function startClient() {
    const inquirer = (await import('inquirer')).default;
    let exit = false;

    while (!exit) {
        try {
            const { action } = await inquirer.prompt([{
                type: 'list',
                name: 'action',
                message: '🔭 ¿Qué deseas hacer en el catálogo de productos?',
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

            switch (action) {
                case 'list':
                    requestPayload = { action: 'list_all' };
                    products = await sendRequest(requestPayload);
                    displayProducts(products);
                    break;
                
                case 'search':
                    const { term } = await inquirer.prompt([{ type: 'input', name: 'term', message: 'Ingresa el término a buscar:' }]);
                    if (!term.trim()) {
                        console.log("❌ La búsqueda no puede estar vacía.");
                        continue;
                    }
                    requestPayload = { action: 'search', term };
                    products = await sendRequest(requestPayload);
                    displayProducts(products);
                    break;

                case 'filter':
                    console.log("\n--- Filtros Interactivos (deja en blanco para ignorar) ---");
                    const { marca } = await inquirer.prompt([{ type: 'input', name: 'marca', message: 'Filtrar por marca:' }]);
                    const { color } = await inquirer.prompt([{ type: 'input', name: 'color', message: 'Filtrar por color:' }]);
                    const { precio_min } = await inquirer.prompt([{ type: 'number', name: 'precio_min', message: 'Precio mínimo (ej: 1000):', default: undefined }]);
                    const { precio_max } = await inquirer.prompt([{ type: 'number', name: 'precio_max', message: 'Precio máximo (ej: 5000):', default: undefined }]);

                    const criteria = {};
                    if (marca.trim()) criteria.marca = marca.trim();
                    if (color.trim()) criteria.color = color.trim();
                    if (precio_min) criteria.precio_min = precio_min;
                    if (precio_max) criteria.precio_max = precio_max;
                    
                    if (Object.keys(criteria).length === 0) {
                        console.log("⚠️ No se aplicó ningún filtro.");
                        continue;
                    }

                    requestPayload = { action: 'filter', criteria };
                    products = await sendRequest(requestPayload);
                    displayProducts(products);
                    break;

                case 'exit':
                    exit = true;
                    console.log("\n👋 ¡Hasta luego!");
                    break;
            }
        } catch (error) {
            console.error("\n❌ Ha ocurrido un error:", error.message);
        }
        if (!exit) {
           await inquirer.prompt([{type: 'input', name: 'continue', message: '\nPresiona ENTER para volver al menú...'}]);
        }
    }
    // Cierra la conexión de mongoose si está abierta
    if(mongoose.connection.readyState === 1) {
        mongoose.connection.close();
    }
}

startClient();