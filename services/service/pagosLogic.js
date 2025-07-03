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
    
    let totalPago = 0;
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
        totalPago += variacion.precio * item.cantidad;
        
        // Preparamos los datos para el snapshot de la orden
        itemsSnapshot.push({
            producto_id: producto._id,
            producto_variacion_id: variacion._id,
            nombre: producto.nombre,
            talla: variacion.talla,
            color: variacion.color,
            cantidad: item.cantidad,
            precio_unitario: variacion.precio // Precio unitario sin descuento por puntos
        });

        // Preparamos la actualización de stock
        variacion.stock -= item.cantidad;
        productosAActualizar.push(producto); // Agregamos el producto modificado a la lista para guardar
    }

    // --- Lógica de ASAIpoints ---
    let puntosRealmenteUsados = 0;
    if (pointsToUse > 0) {
        // Validar que el usuario tiene suficientes puntos
        if (usuario.asai_points < pointsToUse) {
             // Esto no debería pasar si el cliente valida bien, pero es una seguridad
            console.warn(`[pagosLogic] Usuario ${user_id} intentó usar ${pointsToUse} puntos pero solo tiene ${usuario.asai_points}. Usando ${usuario.asai_points}.`);
            puntosRealmenteUsados = usuario.asai_points; // Usar solo los que tiene
        } else {
            puntosRealmenteUsados = pointsToUse;
        }

        const descuentoPorPuntos = puntosRealmenteUsados * 1000; // Cada punto descuenta 1000 unidades
        
        // El descuento no puede hacer que el total sea negativo
        const descuentoAplicable = Math.min(descuentoPorPuntos, totalPago);
        
        // Ajustar el total a pagar
        totalPago = totalPago - descuentoAplicable;
        
        // Recalcular puntos realmente usados basado en el descuento aplicado
        // Esto es crucial si el descuento aplicable fue menor que el descuento potencial (totalPago era muy bajo)
        puntosRealmenteUsados = Math.floor(descuentoAplicable / 1000);

        if (puntosRealmenteUsados > 0) {
             usuario.asai_points -= puntosRealmenteUsados; // Descontar puntos del usuario
            console.log(`[pagosLogic] Se usaron ${puntosRealmenteUsados} ASAIpoints para un descuento de $${descuentoAplicable.toFixed(2)}. Puntos restantes del usuario ${user_id}: ${usuario.asai_points}.`);
             // Agregamos al usuario a la lista de cosas a guardar en la transacción
             // Solo agregamos al usuario si sus puntos fueron modificados
            productosAActualizar.push(usuario);
        } else {
            console.log(`[pagosLogic] Aunque se solicitaron puntos, el descuento aplicable fue 0 (total bajo). No se usaron puntos.`);
            puntosRealmenteUsados = 0; // Asegurarse de que si el descuento fue 0, los puntos usados también
        }
    }
    // --- Fin Lógica ASAIpoints ---


    // Guardar productos con stock actualizado y el usuario con puntos actualizados (si se modificaron)
    // Usamos Promise.all para ejecutar todas las operaciones de guardado en paralelo dentro de la transacción
    await Promise.all(productosAActualizar.map(doc => doc.save({ session })));
    console.log(`[pagosLogic] Stock de ${productosAActualizar.filter(d => d.variaciones).length} producto(s) y puntos del usuario (usados: ${puntosRealmenteUsados}) actualizados.`);
    
    // Crear la nueva orden con el total final y los puntos usados
    const nuevaOrden = new Order({
        user_id,
        total_pago: totalPago, // El total final después de aplicar descuentos
        estado: 'Procesando',
        points_used: puntosRealmenteUsados, // Registrar cuántos puntos se usaron
        direccion_envio: { calle: direccionEnvio.calle, ciudad: direccionEnvio.ciudad, region: direccionEnvio.region, codigo_postal: direccionEnvio.codigo_postal },
        metodo_pago_usado: { tipo: metodoPagoUsado.tipo, detalle: metodoPagoUsado.detalle },
        items: itemsSnapshot // Los items con sus precios originales antes del descuento por puntos
    });
    // Crear la orden dentro de la sesión
    const [savedOrder] = await Order.create([nuevaOrden], { session });
    console.log(`[pagosLogic] Nueva orden ${savedOrder._id} creada exitosamente con total final $${totalPago.toFixed(2)} y ${puntosRealmenteUsados} puntos usados.`);
    
    // Vaciar el carrito del usuario
    usuario.carrito.items = [];
    usuario.carrito.updated_at = new Date();
    await usuario.save({ session }); // Guardar el usuario con el carrito vacío dentro de la sesión
    console.log(`[pagosLogic] Carrito del usuario ${user_id} vaciado.`);
    
    // Enviar mensaje al servicio de puntos ASUMIENDO que los puntos se GANAN sobre el total PAGADO (después del descuento)
    if (serviceSocket && savedOrder.total_pago > 0) {
        const pointPayload = {
            action: 'add_points',
            payload: {
                user_id: savedOrder.user_id.toString(),
                total_pago: savedOrder.total_pago // Pasar el total final pagado
            }
        };
        _sendMessageToService(serviceSocket, 'point', pointPayload);
    } else if (savedOrder.total_pago <= 0) {
        console.log('[pagosLogic] Total de pago es <= 0 después del descuento. No se envían puntos para ganar.');
    }
    
    return savedOrder; // Devolver la orden creada
}

module.exports = { procesarPago };