const { mongoose } = require('../database/db'); 
const Order = require('../database/models/order.model');
const Product = require('../database/models/product.model');
const User = require('../database/models/user.model');

async function crearOrden(orderData) {
    const { user_id, items, direccion_id, metodo_pago_id } = orderData;

    if (!user_id || !items || !items.length || !direccion_id || !metodo_pago_id) {
        throw new Error('Datos incompletos para crear la orden.');
    }

    const session = await mongoose.startSession();
    let nuevaOrdenGuardada;

    try {
        await session.withTransaction(async () => {
            console.log("[orderLogic] Iniciando transacción...");
            let totalPago = 0;
            const itemsSnapshot = [];

            for (const item of items) {
                const producto = await Product.findById(item.producto_id).session(session);
                if (!producto) throw new Error(`Producto con ID ${item.producto_id} no encontrado.`);

                const variacion = producto.variaciones.id(item.producto_variacion_id);
                if (!variacion) throw new Error(`Variación con ID ${item.producto_variacion_id} no encontrada en producto ${producto.nombre}.`);
                
                if (variacion.stock < item.cantidad) {
                    throw new Error(`Stock insuficiente para ${producto.nombre} (${variacion.talla}). Stock: ${variacion.stock}, solicitado: ${item.cantidad}.`);
                }

                variacion.stock -= item.cantidad;
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

                await producto.save({ session });
                console.log(`[orderLogic] Stock del producto ${producto.nombre} actualizado.`);
            }

            const usuario = await User.findById(user_id).session(session);
            if (!usuario) throw new Error(`Usuario con ID ${user_id} no encontrado.`);

            const direccionEnvio = usuario.direcciones.id(direccion_id);
            if (!direccionEnvio) throw new Error(`Dirección con ID ${direccion_id} no encontrada.`);

            const metodoPagoUsado = usuario.metodos_pago.id(metodo_pago_id);
            if (!metodoPagoUsado) throw new Error(`Método de pago con ID ${metodo_pago_id} no encontrado.`);

            const orden = new Order({
                user_id,
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

            nuevaOrdenGuardada = await orden.save({ session });
            console.log("[orderLogic] Orden guardada en la sesión de la transacción.");
        });
        
    } catch (error) {
        console.error("[orderLogic] Error en la transacción:", error.message);
        throw error; 
    } finally {
        await session.endSession();
        console.log("[orderLogic] Sesión de transacción finalizada.");
    }

    // Devuelve la orden que se guardó. Si la transacción falló, será undefined.
    return nuevaOrdenGuardada;
}

module.exports = { crearOrden };