const net = require('net');
const { connectDB, mongoose } = require('../../database/db.js');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;

// Función de comunicación genérica para este módulo
function sendRequest(serviceName, requestPayload) {
    return new Promise((resolve, reject) => {
        const clientSocket = new net.Socket();
        clientSocket.connect(BUS_PORT, BUS_HOST, () => {
            const service = serviceName.padEnd(5, ' ');
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
                if (resData.status === 'error') reject(new Error(resData.message));
                else resolve(resData);
            } else {
                reject(new Error(`Bus Error (NK): ${msg}`));
            }
            clientSocket.end();
        });
        clientSocket.on('error', err => { reject(err); clientSocket.end(); });
    });
}

function displayProducts(products) {
    console.log(`\n--- 📜 Catálogo (${products.length} encontrados) ---\n`);
    products.forEach((p, index) => {
        console.log(`${index + 1}. 📦 ${p.nombre} [ID: ${p._id}]`);
        if (p.variaciones && p.variaciones.length > 0) {
            const v = p.variaciones[0];
            console.log(`   - Precio: $${v.precio} | Stock: ${v.stock}`);
        }
        console.log('----------------------------------------------------');
    });
}

async function productActionMenu(inquirer, products, userId) {
    const { action } = await inquirer.prompt([{
        type: 'list', name: 'action', message: '¿Qué deseas hacer?',
        choices: ['🛒 Añadir al carrito', '💖 Añadir a lista de deseos', '↩️ Volver']
    }]);

    if (action === '↩️ Volver') return;

    const { productId } = await inquirer.prompt([{
        type: 'list', name: 'productId', message: 'Selecciona el producto:',
        choices: products.map(p => ({ name: p.nombre, value: p._id }))
    }]);

    try {
        if (action === '🛒 Añadir al carrito') {
            const { cantidad } = await inquirer.prompt([{ type: 'number', name: 'cantidad', default: 1 }]);
            await sendRequest('carro', { action: 'add', user_id: userId, producto_id: productId, cantidad });
            console.log('✅ ¡Producto añadido al carrito!');
        } else if (action === '💖 Añadir a lista de deseos') {
            await sendRequest('deseo', { action: 'add', user_id: userId, producto_id: productId });
            console.log('✅ ¡Producto añadido a la lista de deseos!');
        }
    } catch (e) { console.error(`❌ Error: ${e.message}`); }
}

async function startCatalog(userId, userName) {
    const inquirer = (await import('inquirer')).default;
    console.log(`\n--- 🔭 Módulo de Catálogo (Usuario: ${userName}) ---`);
    
    let goBack = false;
    while (!goBack) {
        const { catalogAction } = await inquirer.prompt([{
            type: 'list', name: 'catalogAction', message: 'Acciones del catálogo:',
            choices: ['📚 Ver Catálogo Completo', '🔍 Buscar un producto', '📊 Aplicar Filtros', '↩️ Salir del módulo']
        }]);

        if (catalogAction === '↩️ Salir del módulo') { goBack = true; continue; }

        let products = [];
        try {
            switch (catalogAction) {
                case '📚 Ver Catálogo Completo':
                    products = await sendRequest('catal', { action: 'list_all' });
                    break;
                case '🔍 Buscar un producto':
                    const { term } = await inquirer.prompt([{ type: 'input', name: 'term', message: 'Término a buscar:' }]);
                    if (term.trim()) products = await sendRequest('catal', { action: 'search', term });
                    break;
                case '📊 Aplicar Filtros':
                    const criteria = await inquirer.prompt([
                        { name: 'marca', message: 'Marca (opcional):' },
                        { name: 'color', message: 'Color (opcional):' }
                    ]);
                    Object.keys(criteria).forEach(key => (!criteria[key] && delete criteria[key]));
                    if (Object.keys(criteria).length > 0) {
                        products = await sendRequest('catal', { action: 'filter', criteria });
                    }
                    break;
            }

            if (products.length > 0) {
                displayProducts(products);
                await productActionMenu(inquirer, products, userId);
            } else {
                console.log('No se encontraron productos.');
            }
        } catch (e) { console.error(`❌ Error en catálogo: ${e.message}`); }
    }
}

if (require.main === module) {
    const userId = process.argv[2];
    const userName = process.argv[3];
    if (!userId) {
        console.error("Error: Se requiere el ID de usuario.");
        process.exit(1);
    }

    connectDB()
        .then(() => startCatalog(userId, userName))
        .catch(err => console.error(err))
        .finally(() => {
            if (mongoose.connection.readyState === 1) mongoose.connection.close();
        });
}