const Order = require('../../database/models/order.model');

async function crearOrden(userId, items, direccionEnvio, metodoPagoUsado) {
    console.log('[orderService] Iniciando creación de orden...');

    if (!userId || !items || !direccionEnvio || !metodoPagoUsado) {
        throw new Error('Faltan datos requeridos para crear la orden.');
    }
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('La orden debe contener al menos un item.');
    }

    let totalCalculado = 0;
    try {
        totalCalculado = items.reduce((sum, item) => {
            // Validar que cada item tenga cantidad y precio_unitario válidos antes de sumar
            if (typeof item.cantidad !== 'number' || item.cantidad <= 0 ||
                typeof item.precio_unitario !== 'number' || item.precio_unitario < 0) {
                throw new Error('Item de orden inválido: cantidad y precio deben ser números positivos.');
            }
            return sum + (item.cantidad * item.precio_unitario);
        }, 0);
        console.log(`[orderService] Total calculado a partir de items: ${totalCalculado}`);
    } catch (error) {
        console.error('[orderService] Error al calcular el total de la orden:', error.message);
        throw new Error('Error al procesar los items de la orden: ' + error.message);
    }


    try {
        // --- Crear la nueva instancia de la orden ---
        const nuevaOrden = new Order({
            user_id: userId,
            total_pago: totalCalculado, // Usamos el total calculado
            // estado se deja con el default 'Procesando'
            direccion_envio: direccionEnvio,
            metodo_pago_usado: metodoPagoUsado,
            items: items
        });

        // --- Guardar la orden en la BD ---
        console.log('[orderService] Guardando nueva orden en la BD...');
        await nuevaOrden.save();
        console.log('[orderService] Orden guardada con éxito.');

        // Puedes retornar el documento de Mongoose o convertirlo a un objeto plano si prefieres
        return nuevaOrden; // Retorna el documento guardado

    } catch (error) {
        console.error('[orderService] Error al crear la orden:', error);

        // Puedes añadir manejo específico para errores de validación de Mongoose si es necesario
        if (error.name === 'ValidationError') {
            throw new Error('Error de validación al crear la orden: ' + error.message);
        }

        throw new Error('Error interno al crear la orden: ' + error.message);
    }
}

module.exports = {
    crearOrden
};