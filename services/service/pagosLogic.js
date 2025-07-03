const User = require('../../database/models/user.model');
const Product = require('../../database/models/product.model');
const Order = require('../../database/models/order.model');

function _sendMessageToService(socket, serviceName, payload) {
    try {
        const service = serviceName.padEnd(5, ' ');
        const data = JSON.stringify(payload);
        const messageBody = service + data;
        const header = String(messageBody.length).padStart(5, '0');
        const fullMessage = header + messageBody;

        console.log(`[pagosLogic] -> Enviando mensaje asíncrono a '${serviceName}'`);
        socket.write(fullMessage);
    } catch (error) {
        console.error(`[pagosLogic] Error al intentar enviar mensaje al servicio '${serviceName}':`, error.message);
    }
}

// Recibimos 'pointsToUse'. Si es 100, significa que el cliente quiere usar el descuento.
async function procesarPago({ user_id, direccion_id, metodo_pago_id, pointsToUse = 0 }, session, serviceSocket) {
    console.log(`--- [pagosLogic] Ejecutando lógica de negocio dentro de la transacción ---`);

    // Obtenemos el usuario dentro de la sesión para asegurar la consistencia
    const usuario = await User.findById(user_id).session(session);
    if (!usuario) throw new Error("Usuario no encontrado.");
    if (!usuario.carrito || usuario.carrito.items.length === 0) throw new Error("El carrito está vacío, no se puede procesar el pago.");
    
    const direccionEnvio = usuario.direcciones.find(d => d._id.toString() === direccion_id);
    if (!direccionEnvio) throw new Error("Dirección de envío no válida o no encontrada.");
    const metodoPagoUsado = usuario.metodos_pago.find(p => p._id.toString() === metodo_pago_id);
    if (!metodoPagoUsado) throw new Error("Método de pago no válido o no encontrado.");
    
    let totalPagoSinDescuento = 0; 
    const itemsSnapshot = [];
    const productosAActualizar = [];
    
    // Validar stock y calcular total antes de descuento
    for (const item of usuario.carrito.items) {
        const producto = await Product.findById(item.producto_id).session(session);
        if (!producto) throw new Error(`El producto '${item.nombre_snapshot}' ya no existe en el catálogo.`);
        if (!producto.variaciones || producto.variaciones.length === 0) throw new Error(`El producto '${producto.nombre}' ya no tiene variaciones disponibles.`);
        // Usar find para manejar mejor si la variación no existe por alguna razón, aunque .id es común.
        const variacion = producto.variaciones.find(v => v._id.toString() === item.producto_variacion_id.toString());
        if (!variacion) throw new Error(`La variación del producto '${item.nombre_snapshot}' ya no existe.`);

        if (variacion.stock < item.cantidad) throw new Error(`Stock insuficiente para '${producto.nombre} - ${variacion.talla}/${variacion.color}'. Disponible: ${variacion.stock}, Solicitado: ${item.cantidad}.`);
        
        // No descontamos stock ni guardamos todavía, solo calculamos el total basado en los precios actuales
        totalPagoSinDescuento += variacion.precio * item.cantidad;
        
        // Preparamos los datos para el snapshot de la orden
        itemsSnapshot.push({
            producto_id: producto._id,
            producto_variacion_id: variacion._id,
            nombre: producto.nombre,
            talla: variacion.talla,
            color: variacion.color,
            cantidad: item.cantidad,
            precio_unitario: variacion.precio 
        });

        variacion.stock -= item.cantidad;
        productosAActualizar.push(producto); 
    }
    
    console.log(`[pagosLogic] Total sin descuento calculado: ${totalPagoSinDescuento.toFixed(2)}`);

    let totalPagoFinal = totalPagoSinDescuento;
    let puntosRealmenteUsados = 0;
    const PUNTOS_PARA_DESCUENTO = 100; // El número exacto de puntos para el 20%
    const PORCENTAJE_DESCUENTO = 0.20; // 20%

    if (pointsToUse > 0) { // Cliente pidió usar puntos (esperamos que sea 100)
        if (usuario.asai_points >= PUNTOS_PARA_DESCUENTO && totalPagoSinDescuento > 0) {
            console.log(`[pagosLogic] Aplicando descuento del ${PORCENTAJE_DESCUENTO*100}% usando ${PUNTOS_PARA_DESCUENTO} puntos.`);

            const descuentoMonto = totalPagoSinDescuento * PORCENTAJE_DESCUENTO; 
            totalPagoFinal = totalPagoSinDescuento - descuentoMonto; 

            // Asegurarse de que el total final no sea negativo si el descuento es mayor que el total sin descuento
            if (totalPagoFinal < 0) {
                totalPagoFinal = 0;
                console.log(`[pagosLogic] Debug - Total final negativo ($${totalPagoFinal.toFixed(2)}), ajustando a 0.`);
            }

            puntosRealmenteUsados = PUNTOS_PARA_DESCUENTO; // Se usan exactamente los 100 puntos

            usuario.asai_points -= puntosRealmenteUsados; // Descontar los 100 puntos

            console.log(`[pagosLogic] Descuento aplicado: Usados ${puntosRealmenteUsados} ASAIpoints. Descuento de $${descuentoMonto.toFixed(2)}. Total original: $${totalPagoSinDescuento.toFixed(2)}. Total final pagado: $${totalPagoFinal.toFixed(2)}. Puntos restantes: ${usuario.asai_points}.`);

            productosAActualizar.push(usuario); 

        } else {
            if (pointsToUse > 0) { 
                console.warn(`[pagosLogic] Cliente ${user_id} solicitó descuento (${pointsToUse} pts), pero no cumple requisitos (puntos usuario: ${usuario.asai_points}, total sin descuento: ${totalPagoSinDescuento}). No se aplica descuento.`);
            } else { 
                console.log(`[pagosLogic] Cliente no solicitó usar el descuento de ${PUNTOS_PARA_DESCUENTO} puntos.`);
            }
        }
    } else {
         // Cliente no pidió usar puntos (pointsToUse es 0)
        console.log(`[pagosLogic] Cliente no solicitó usar puntos. No se aplica descuento por puntos.`);
         // totalPagoFinal ya está igual a totalPagoSinDescuento
         puntosRealmenteUsados = 0; // Asegurarse de que sea 0
    }
    // --- Fin Lógica de ASAIpoints ---

    await Promise.all(productosAActualizar.map(doc => doc.save({ session })));
    console.log(`[pagosLogic] Stock de ${productosAActualizar.filter(d => d.variaciones).length} producto(s) y puntos del usuario (usados: ${puntosRealmenteUsados}) actualizados.`);

    // Crear la nueva orden con el total final y los puntos usados
    const nuevaOrden = new Order({
        user_id,
        total_pago: totalPagoFinal,
        estado: 'Procesando',
        points_used: puntosRealmenteUsados, 
        direccion_envio: { calle: direccionEnvio.calle, ciudad: direccionEnvio.ciudad, region: direccionEnvio.region, codigo_postal: direccionEnvio.codigo_postal },
        metodo_pago_usado: { tipo: metodoPagoUsado.tipo, detalle: metodoPagoUsado.detalle },
        items: itemsSnapshot 
    });
    // Crear la orden dentro de la sesión
    const [savedOrder] = await Order.create([nuevaOrden], { session });
    console.log(`[pagosLogic] Nueva orden ${savedOrder._id} creada exitosamente con total final $${totalPagoFinal.toFixed(2)} y ${puntosRealmenteUsados} puntos usados.`);

    // Vaciar el carrito del usuario
    usuario.carrito.items = [];
    usuario.carrito.updated_at = new Date();
    await usuario.save({ session }); // Guardar el usuario con el carrito vacío dentro de la sesión
    console.log(`[pagosLogic] Carrito del usuario ${user_id} vaciado.`);

    if (serviceSocket && savedOrder.total_pago > 0) {
        const pointPayload = {
            action: 'add_points',
            payload: {
                user_id: savedOrder.user_id.toString(),
                total_pago: savedOrder.total_pago
            }
        };
        _sendMessageToService(serviceSocket, 'point', pointPayload);
    } else if (savedOrder.total_pago <= 0) {
        console.log('[pagosLogic] Total de pago es <= 0 después del descuento. No se envían puntos para ganar.');
    }

    return savedOrder; 
}

module.exports = { procesarPago };