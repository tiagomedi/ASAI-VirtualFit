// pagosLogic.js
const User = require('../../database/models/user.model');
const Product = require('../../database/models/product.model');
const Order = require('../../database/models/order.model');

// Esta función envía un mensaje ASÍNCRONO a otro servicio. No espera respuesta.
function _sendMessageToService(socket, serviceName, payload) {
    try {
        const service = serviceName.padEnd(5, ' ');
        const data = JSON.stringify(payload);
        // Formato para servicio-a-servicio: [servicio 5][payload]
        const messageBody = service + data;
        const header = String(messageBody.length).padStart(5, '0');
        const fullMessage = header + messageBody;

        console.log(`[pagosLogic] -> Enviando mensaje asíncrono a '${serviceName}'`);
        socket.write(fullMessage);
    } catch (error) {
        console.error(`[pagosLogic] Error al intentar enviar mensaje al servicio '${serviceName}':`, error.message);
    }
}

async function procesarPago({ user_id, direccion_id, metodo_pago_id, pointsToUse = 0 }, session, serviceSocket) {
    console.log(`--- [pagosLogic] Ejecutando lógica de negocio para procesar pago ---`);

    const usuario = await User.findById(user_id).session(session);
    if (!usuario) throw new Error("Usuario no encontrado.");
    if (!usuario.carrito || usuario.carrito.items.length === 0) throw new Error("El carrito está vacío.");
    
    const direccionEnvio = usuario.direcciones.find(d => d._id.toString() === direccion_id);
    if (!direccionEnvio) throw new Error("Dirección de envío no válida.");
    const metodoPagoUsado = usuario.metodos_pago.find(p => p._id.toString() === metodo_pago_id);
    if (!metodoPagoUsado) throw new Error("Método de pago no válido.");
    
    let totalPagoSinDescuento = 0; 
    const itemsSnapshot = [];
    const productosAActualizar = [];
    
    // --- Validación de Stock y Cálculo de Total ---
    for (const item of usuario.carrito.items) {
        const producto = await Product.findById(item.producto_id).session(session);
        if (!producto) throw new Error(`Producto '${item.nombre_snapshot}' no existe.`);
        const variacion = producto.variaciones.find(v => v._id.toString() === item.producto_variacion_id.toString());
        if (!variacion) throw new Error(`Variación para '${item.nombre_snapshot}' no existe.`);
        if (variacion.stock < item.cantidad) throw new Error(`Stock insuficiente para '${producto.nombre}'. Disponible: ${variacion.stock}, Solicitado: ${item.cantidad}.`);
        
        totalPagoSinDescuento += variacion.precio * item.cantidad;
        itemsSnapshot.push({
            producto_id: producto._id, producto_variacion_id: variacion._id, nombre: producto.nombre,
            talla: variacion.talla, color: variacion.color, cantidad: item.cantidad, precio_unitario: variacion.precio 
        });
        variacion.stock -= item.cantidad;
        productosAActualizar.push(producto); 
    }
    
    // --- Lógica de Descuento y Puntos ASAI ---
    let totalPagoFinal = totalPagoSinDescuento;
    let puntosRealmenteUsados = 0;
    const PUNTOS_PARA_DESCUENTO = 100;
    const PORCENTAJE_DESCUENTO = 0.20;

    if (pointsToUse >= PUNTOS_PARA_DESCUENTO && usuario.asai_points >= PUNTOS_PARA_DESCUENTO) {
        const descuentoMonto = totalPagoSinDescuento * PORCENTAJE_DESCUENTO;
        totalPagoFinal -= descuentoMonto;
        puntosRealmenteUsados = PUNTOS_PARA_DESCUENTO;
        usuario.asai_points -= puntosRealmenteUsados;
        console.log(`[pagosLogic] Descuento aplicado. Total final: $${totalPagoFinal.toFixed(2)}`);
    }

    // --- Guardado de Cambios y Creación de Orden ---
    await Promise.all(productosAActualizar.map(doc => doc.save({ session })));
    console.log(`[pagosLogic] Stock y puntos del usuario actualizados.`);

    const nuevaOrden = new Order({
        user_id, total_pago: totalPagoFinal, estado: 'Procesando', points_used: puntosRealmenteUsados,
        direccion_envio: { ...direccionEnvio.toObject() },
        metodo_pago_usado: { ...metodoPagoUsado.toObject() },
        items: itemsSnapshot
    });
    const [savedOrder] = await Order.create([nuevaOrden], { session });
    console.log(`[pagosLogic] Nueva orden ${savedOrder._id} creada.`);

    usuario.carrito.items = [];
    await usuario.save({ session });
    console.log(`[pagosLogic] Carrito del usuario vaciado.`);

    // ===========================================================================
    // INICIO: COMUNICACIÓN CON OTROS SERVICIOS (PUNTOS Y NOTIFICACIONES)
    // ===========================================================================

    // 1. Envío de solicitud para ganar puntos
    if (serviceSocket && savedOrder.total_pago > 0) {
        _sendMessageToService(serviceSocket, 'point', {
            action: 'add_points',
            payload: { user_id: savedOrder.user_id.toString(), total_pago: savedOrder.total_pago }
        });
    }

    // 2. Envío de solicitud para enviar correo de confirmación
    if (serviceSocket) {
        const emailPayload = {
            action: 'send_email',
            payload: {
                to: usuario.correo,
                order_id: savedOrder._id.toString(),
                order_date: savedOrder.createdAt.toISOString(),
                address: {
                    nombre_direccion: direccionEnvio.nombre_direccion,
                    calle: direccionEnvio.calle,
                    ciudad: direccionEnvio.ciudad,
                    region: direccionEnvio.region,
                    codigo_postal: direccionEnvio.codigo_postal
                },
                products: savedOrder.items.map(item => ({
                    nombre: item.nombre,
                    talla: item.talla,
                    color: item.color,
                    cantidad: item.cantidad,
                    precio_unitario: item.precio_unitario
                })),
                total_pagado: savedOrder.total_pago,
                mensaje: '¡Tu pedido se ha procesado con éxito y está siendo preparado!'
            }
        };
        _sendMessageToService(serviceSocket, 'notif', emailPayload);
    }
    
    // ===========================================================================
    // FIN: COMUNICACIÓN CON OTROS SERVICIOS
    // ===========================================================================

    return savedOrder; 
}

module.exports = { procesarPago };