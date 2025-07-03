const { mongoose } = require('../../database/db.js'); 
const Order = require('../../database/models/order.model');
const Product = require('../../database/models/product.model');
const User = require('../../database/models/user.model');

async function crearOrden(orderData) {
    console.log("--- [orderLogic] INICIANDO crearOrden ---");
    const { user_id, items, direccion_id, metodo_pago_id } = orderData;
    
    try {
        let totalPago = 0;
        const itemsSnapshot = [];
        
        for (const item of items) {
            const producto = await Product.findById(item.producto_id);
            if (!producto) throw new Error(`Producto con ID ${item.producto_id} no encontrado.`);
            if (!producto.variaciones || producto.variaciones.length === 0) throw new Error(`El producto '${producto.nombre}' ya no tiene variaciones disponibles.`);
            const variacion = producto.variaciones[0];

            if (typeof variacion.precio !== 'number') throw new Error(`El producto no tiene un precio válido.`);
            if (variacion.stock < item.cantidad) throw new Error(`Stock insuficiente.`);

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
            await producto.save();
        }

        const usuario = await User.findById(user_id);
        if (!usuario) throw new Error(`Usuario no encontrado.`);
        const direccionEnvio = usuario.direcciones.id(direccion_id);
        if (!direccionEnvio) throw new Error(`Dirección no encontrada.`);
        const metodoPagoUsado = usuario.metodos_pago.id(metodo_pago_id);
        if (!metodoPagoUsado) throw new Error(`Método de pago no encontrado.`);
        
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

// --- FUNCIÓN DE BÚSQUEDA CON LÍMITE ---
async function buscarOrdenesPorUsuario(email) {
    console.log(`--- [orderLogic] Buscando usuario con email: ${email}`);
    const usuario = await User.findOne({ correo: email });
    if (!usuario) throw new Error(`No se encontró un usuario con el correo ${email}`);

    console.log(`--- [orderLogic] Buscando las 5 órdenes más recientes para el usuario ID: ${usuario._id}`);
    
    const ordenes = await Order.find({ user_id: usuario._id })
                            .sort({ createdAt: -1 })
                            .limit(5); 

    console.log(`--- [orderLogic] Se encontraron ${ordenes.length} órdenes. Creando resumen...`);
    
    const resumenOrdenes = ordenes.map(orden => ({
        _id: orden._id,
        createdAt: orden.createdAt,
        estado: orden.estado,
        total_pago: orden.total_pago,
        itemCount: orden.items.length,
        points_used: orden.points_used 
    }));

    return resumenOrdenes;
}

module.exports = { crearOrden, buscarOrdenesPorUsuario };