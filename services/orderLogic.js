const { mongoose } = require('../database/db'); 
const Order = require('../database/models/order.model');
const Product = require('../database/models/product.model');
const User = require('../database/models/user.model');

async function crearOrden(orderData) {
    console.log("--- [orderLogic] INICIANDO crearOrden ---");
    // Ya no recibimos producto_variacion_id en los items
    const { user_id, items, direccion_id, metodo_pago_id } = orderData;

    try {
        let totalPago = 0;
        const itemsSnapshot = [];
        
        for (const item of items) {
            const producto = await Product.findById(item.producto_id);
            if (!producto) throw new Error(`Producto con ID ${item.producto_id} no encontrado.`);
            
            // Si no hay variaciones o el array está vacío, lanzamos un error.
            if (!producto.variaciones || producto.variaciones.length === 0) {
                throw new Error(`El producto '${producto.nombre}' no tiene variaciones disponibles.`);
            }
            // Tomamos la PRIMERA variación del array.
            const variacion = producto.variaciones[0]; 
            // -------------------------

            if (typeof variacion.precio !== 'number') throw new Error(`El producto '${producto.nombre}' no tiene un precio válido.`);
            if (variacion.stock < item.cantidad) throw new Error(`Stock insuficiente para ${producto.nombre}.`);

            variacion.stock -= item.cantidad;
            totalPago += variacion.precio * item.cantidad;

            itemsSnapshot.push({
                producto_id: producto._id,
                producto_variacion_id: variacion._id, // Mongoose le da un _id, así que podemos guardarlo
                nombre: producto.nombre,
                talla: variacion.talla,
                color: variacion.color,
                cantidad: item.cantidad,
                precio_unitario: variacion.precio
            });
            await producto.save();
        }

        const usuario = await User.findById(user_id);
        if (!usuario) throw new Error(`Usuario con ID ${user_id} no encontrado.`);

        const direccionEnvio = usuario.direcciones.id(direccion_id);
        if (!direccionEnvio) throw new Error(`Dirección con ID ${direccion_id} no encontrada.`);

        const metodoPagoUsado = usuario.metodos_pago.id(metodo_pago_id);
        if (!metodoPagoUsado) throw new Error(`Método de pago con ID ${metodo_pago_id} no encontrado.`);
        
        const orden = new Order({
            user_id,
            total_pago: totalPago,
            estado: 'Procesando',
            direccion_envio: { calle: direccionEnvio.calle, ciudad: direccionEnvio.ciudad, region: direccionEnvio.region, codigo_postal: direccionEnvio.codigo_postal },
            metodo_pago_usado: { tipo: metodoPagoUsado.tipo, detalle: metodoPagoUsado.detalle },
            items: itemsSnapshot
        });
        const ordenGuardada = await orden.save();
        
        console.log(`--- [orderLogic] ¡ÉXITO! Orden ${ordenGuardada._id} guardada en la DB.`);
        return ordenGuardada;
        
    } catch (error) {
        console.error("--- [orderLogic] ERROR ---:", error.message);
        throw error;
    } 
}

module.exports = { crearOrden };