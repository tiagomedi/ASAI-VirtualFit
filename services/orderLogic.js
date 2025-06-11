const { mongoose } = require('../database/db'); 
const Order = require('../database/models/order.model');
const Product = require('../database/models/product.model');
const User = require('../database/models/user.model');

async function crearOrden(orderData) {
    const { user_id, items, direccion_id, metodo_pago_id } = orderData;

    if (!user_id || !items || !items.length || !direccion_id || !metodo_pago_id) {
        throw new Error('Faltan datos requeridos (user_id, items, direccion_id, metodo_pago_id).');
    }

    const session = await mongoose.startSession();
    let nuevaOrden;

    try {
        await session.withTransaction(async () => {
            let totalPago = 0;
            const itemsSnapshot = [];

            for (const item of items) {
                const producto = await Product.findById(item.producto_id).session(session);
                if (!producto) {
                    throw new Error(`Producto con ID ${item.producto_id} no encontrado.`);
                }

                // --- LÍNEA CORREGIDA ---
                // Buscamos la variación DENTRO del producto encontrado.
                const variacion = producto.variaciones.id(item.producto_variacion_id);
                
                // --- AÑADIDA VALIDACIÓN ---
                // Verificamos que la variación realmente exista.
                if (!variacion) {
                    throw new Error(`Variación con ID ${item.producto_variacion_id} no encontrada en el producto ${producto.nombre}.`);
                }

                // Ahora esta línea y las siguientes funcionarán porque 'variacion' está definida.
                if (variacion.stock < item.cantidad) {
                    throw new Error(`Stock insuficiente para ${producto.nombre} (${variacion.talla}/${variacion.color}). Stock disponible: ${variacion.stock}, solicitado: ${item.cantidad}.`);
                }

                variacion.stock -= item.cantidad;
                totalPago += variacion.precio * item.cantidad;

                itemsSnapshot.push({
                    producto_id: producto._id,
                    // --- CORREGIDO ---
                    // Guardamos el _id de la variación, no el objeto entero
                    producto_variacion_id: variacion._id, 
                    nombre: producto.nombre,
                    talla: variacion.talla,
                    color: variacion.color,
                    cantidad: item.cantidad,
                    precio_unitario: variacion.precio
                });

                await producto.save({ session });
            }

            const usuario = await User.findById(user_id).session(session);
            if (!usuario) throw new Error(`Usuario con ID ${user_id} no encontrado.`);

            const direccionEnvio = usuario.direcciones.id(direccion_id);
            if (!direccionEnvio) throw new Error(`Dirección con ID ${direccion_id} no encontrada para el usuario.`);

            const metodoPagoUsado = usuario.metodos_pago.id(metodo_pago_id);
            if (!metodoPagoUsado) throw new Error(`Método de pago con ID ${metodo_pago_id} no encontrado.`);

            const orden = new Order({
                user_id: user_id,
                total_pago: totalPago,
                estado: 'Procesando',
                direccion_envio: {
                    calle: direccionEnvio.calle,
                    ciudad: direccionEnvio.ciudad,
                    region: direccionEnvio.region,
                    codigo_postal: direccionEnvio.codigo_postal
                },
                metodo_pago_usado: {
                    tipo: metodoPagoUsado.tipo,
                    detalle: metodoPagoUsado.detalle
                },
                items: itemsSnapshot
            });

            nuevaOrden = await orden.save({ session });
        });
        
    } catch (error) {
        console.error("Error en la transacción de la orden:", error);
        throw error; 
    } finally {
        await session.endSession();
    }

    return nuevaOrden;
}

module.exports = {
    crearOrden
};