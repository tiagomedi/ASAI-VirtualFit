const User = require('../../database/models/user.model');
const Product = require('../../database/models/product.model');
const Order = require('../../database/models/order.model');

async function procesarPago({ user_id, direccion_id, metodo_pago_id }, session) {
    console.log(`--- [pagosLogic] Ejecutando lógica de negocio dentro de la transacción ---`);
    const usuario = await User.findById(user_id).session(session);
    if (!usuario) throw new Error("Usuario no encontrado.");
    if (!usuario.carrito || usuario.carrito.items.length === 0) throw new Error("El carrito está vacío, no se puede procesar el pago.");
    const direccionEnvio = usuario.direcciones.find(d => d._id.toString() === direccion_id);
    if (!direccionEnvio) throw new Error("Dirección de envío no válida o no encontrada.");
    const metodoPagoUsado = usuario.metodos_pago.find(p => p._id.toString() === metodo_pago_id);
    if (!metodoPagoUsado) throw new Error("Método de pago no válido o no encontrado.");
    let totalPago = 0;
    const itemsSnapshot = [];
    const productosAActualizar = [];
    for (const item of usuario.carrito.items) {
        const producto = await Product.findById(item.producto_id).session(session);
        if (!producto) throw new Error(`El producto '${item.nombre_snapshot}' ya no existe en el catálogo.`);
        if (!producto.variaciones || producto.variaciones.length === 0) throw new Error(`El producto '${producto.nombre}' ya no tiene variaciones disponibles.`);
        const variacion = producto.variaciones[0];
        if (variacion.stock < item.cantidad) throw new Error(`Stock insuficiente para '${producto.nombre}'. Disponible: ${variacion.stock}, Solicitado: ${item.cantidad}.`);
        variacion.stock -= item.cantidad;
        productosAActualizar.push(producto.save({ session }));
        totalPago += variacion.precio * item.cantidad;
        itemsSnapshot.push({
            producto_id: producto._id,
            producto_variacion_id: variacion._id,
            nombre: producto.nombre,
            talla: variacion.talla,
            color: variacion.color,
            cantidad: item.cantidad,
            precio_unitario: variacion.precio
        });
    }
    await Promise.all(productosAActualizar);
    console.log(`[pagosLogic] Stock de ${productosAActualizar.length} producto(s) actualizado.`);
    const nuevaOrden = new Order({
        user_id,
        total_pago: totalPago,
        estado: 'Procesando',
        direccion_envio: { calle: direccionEnvio.calle, ciudad: direccionEnvio.ciudad, region: direccionEnvio.region, codigo_postal: direccionEnvio.codigo_postal },
        metodo_pago_usado: { tipo: metodoPagoUsado.tipo, detalle: metodoPagoUsado.detalle },
        items: itemsSnapshot
    });
    const [savedOrder] = await Order.create([nuevaOrden], { session });
    console.log(`[pagosLogic] Nueva orden ${savedOrder._id} creada exitosamente.`);
    usuario.carrito.items = [];
    usuario.carrito.updated_at = new Date();
    await usuario.save({ session });
    console.log(`[pagosLogic] Carrito del usuario ${user_id} vaciado.`);
    return savedOrder;
}

module.exports = { procesarPago };