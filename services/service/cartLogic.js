// service/cartLogic.js
const User = require('../../database/models/user.model');
const net = require('net');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;

/**
 * Helper para llamar a otros servicios a través del bus.
 * @param {string} serviceName - Nombre del servicio a llamar (ej. 'catal').
 * @param {object} requestPayload - El JSON a enviar.
 * @returns {Promise<object>} La respuesta parseada del servicio.
 */
function callService(serviceName, requestPayload) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.connect(BUS_PORT, BUS_HOST, () => {
            const service = serviceName.padEnd(5, ' ');
            const payload = service + JSON.stringify(requestPayload);
            const header = String(payload.length).padStart(5, '0');
            socket.write(header + payload);
        });

        socket.on('data', data => {
            const rawData = data.toString();
            const status = rawData.substring(10, 12).trim();
            const message = rawData.substring(12);

            if (status === 'OK') {
                const responseData = JSON.parse(message);
                if (responseData.status === 'error') {
                    reject(new Error(responseData.message));
                } else {
                    resolve(responseData);
                }
            } else {
                reject(new Error(`El bus reportó un error (NK) desde ${serviceName}: ${message}`));
            }
            socket.end();
        });
        socket.on('error', err => reject(err));
    });
}


async function verCarrito(user_id) {
    console.log(`--- [cartLogic] INICIANDO verCarrito para usuario ${user_id} ---`);
    const usuario = await User.findById(user_id);
    if (!usuario) throw new Error("Usuario no encontrado.");

    // Si el carrito no existe, lo inicializamos para consistencia.
    if (!usuario.carrito) {
        return { items: [], updated_at: new Date() };
    }
    return usuario.carrito;
}

async function agregarAlCarrito(user_id, producto_id, cantidad) {
    console.log(`--- [cartLogic] INICIANDO agregarAlCarrito: ${cantidad} x ${producto_id} ---`);
    if (cantidad <= 0) throw new Error("La cantidad debe ser mayor que cero.");
    
    // --- CONSULTA AL SERVICIO DE CATÁLOGO ---
    console.log(`[cartLogic] -> Consultando servicio 'catal' por producto ${producto_id}`);
    const producto = await callService('catal', { action: 'get_details', producto_id });
    console.log(`[cartLogic] <- Respuesta de 'catal' recibida.`);

    if (!producto.variaciones || producto.variaciones.length === 0) {
        throw new Error(`El producto '${producto.nombre}' no tiene variaciones (precio/stock).`);
    }
    // Simplificamos tomando la primera variación, como en orderLogic
    const variacion = producto.variaciones[0];

    if (variacion.stock < cantidad) {
        throw new Error(`Stock insuficiente para '${producto.nombre}'. Disponible: ${variacion.stock}, Solicitado: ${cantidad}.`);
    }
    // --- FIN DE CONSULTA ---

    const usuario = await User.findById(user_id);
    if (!usuario) throw new Error("Usuario no encontrado.");

    // Inicializar carrito si no existe
    if (!usuario.carrito) {
        usuario.carrito = { items: [] };
    }

    const itemExistente = usuario.carrito.items.find(
        item => item.producto_variacion_id.toString() === variacion._id.toString()
    );

    if (itemExistente) {
        itemExistente.cantidad += cantidad;
    } else {
        usuario.carrito.items.push({
            producto_id: producto._id,
            producto_variacion_id: variacion._id,
            nombre_snapshot: producto.nombre,
            cantidad: cantidad,
            precio_snapshot: variacion.precio
        });
    }

    usuario.carrito.updated_at = new Date();
    await usuario.save();
    console.log(`[cartLogic] ÉXITO: Producto añadido/actualizado en el carrito.`);
    return usuario.carrito;
}


async function modificarCantidad(user_id, producto_variacion_id, nueva_cantidad) {
    console.log(`--- [cartLogic] INICIANDO modificarCantidad a ${nueva_cantidad} ---`);
    if (nueva_cantidad <= 0) throw new Error("La nueva cantidad debe ser mayor a cero.");

    const usuario = await User.findById(user_id).populate('carrito.items.producto_id');
    if (!usuario || !usuario.carrito) throw new Error("Carrito no encontrado.");

    const itemEnCarrito = usuario.carrito.items.find(
        item => item.producto_variacion_id.toString() === producto_variacion_id
    );
    if (!itemEnCarrito) throw new Error("Ítem no encontrado en el carrito.");

    const producto = await callService('catal', { action: 'get_details', producto_id: itemEnCarrito.producto_id.toString() });
    const variacion = producto.variaciones.find(v => v._id.toString() === producto_variacion_id);

    if (!variacion || variacion.stock < nueva_cantidad) {
        throw new Error(`Stock insuficiente. Disponible: ${variacion ? variacion.stock : 0}`);
    }

    itemEnCarrito.cantidad = nueva_cantidad;
    await usuario.save();
    console.log(`[cartLogic] ÉXITO: Cantidad modificada.`);
    return usuario.carrito;
}

async function eliminarDelCarrito(user_id, producto_variacion_id) {
    console.log(`--- [cartLogic] INICIANDO eliminarDelCarrito ---`);
    const usuario = await User.findById(user_id);
    if (!usuario || !usuario.carrito) throw new Error("Carrito no encontrado.");

    // Mongoose $pull para eliminar un subdocumento de un array
    usuario.carrito.items.pull({ producto_variacion_id: producto_variacion_id });
    
    await usuario.save();
    console.log(`[cartLogic] ÉXITO: Ítem eliminado del carrito.`);
    return usuario.carrito;
}

module.exports = {
    verCarrito,
    agregarAlCarrito,
    modificarCantidad,
    eliminarDelCarrito
};