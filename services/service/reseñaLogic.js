const mongoose = require('../../database/db');
const User = require('../../database/models/user.model');
const Product = require('../../database/models/product.model');
const Order = require('../../database/models/order.model');

async function procesarReseña(reviewData) {
    console.log("--- [reseñaLogic] INICIANDO procesarReseña ---");
    const { user_id, product_id, product_variation_id, puntuacion, comentario } = reviewData;

    // Validación básica de entrada
    if (!user_id || !product_id || !product_variation_id || puntuacion === undefined || puntuacion === null) {
        throw new Error("Datos de reseña incompletos.");
    }
    if (typeof puntuacion !== 'number' || puntuacion < 1 || puntuacion > 5) {
        throw new Error("La puntuación debe ser un número entre 1 y 5.");
    }
    // Comentario puede ser opcional, pero si existe, que sea string.
    if (comentario !== undefined && comentario !== null && typeof comentario !== 'string') {
        throw new Error("El comentario debe ser un texto.");
    }


    try {
        // 1. Verificar si el usuario existe y obtener su nombre para el snapshot
        const usuario = await User.findById(user_id);
        if (!usuario) {
            throw new Error(`Usuario con ID ${user_id} no encontrado.`);
        }
        // Usamos el correo como nombre snapshot simple
        const nombreUsuarioSnapshot = usuario.correo;

        // 2. Verificar si el usuario ha comprado este producto/variación específica
        const haComprado = await Order.exists({
            user_id: user_id,
            'items.producto_id': product_id,
            'items.producto_variacion_id': product_variation_id 
        });

        if (!haComprado) {
            throw new Error(`El usuario no ha comprado este producto o variación específica.`);
        }
        console.log(`[reseñaLogic] ✅ Usuario ${user_id} ha comprado el producto/variación.`);


        // 3. Encontrar el producto al que se añadirá la reseña
        const producto = await Product.findById(product_id);
        if (!producto) {
            throw new Error(`Producto con ID ${product_id} no encontrado.`);
        }

        // 4. (Opcional pero recomendable) Verificar si la variación existe realmente en el producto maestro actual
        // Embora verifiquemos a compra, a variação pode ter sido removida do produto principal.
        const variacionExistente = producto.variaciones.id(product_variation_id);
        if (!variacionExistente) {
            console.warn(`[reseñaLogic] Advertencia: La variación ${product_variation_id} comprada por el usuario ya no existe en el producto ${product_id}. Se permitirá la reseña asociada al producto.`);
        }

        // 5. Crear el objeto de reseña
        const nuevaReseña = {
            user_id: usuario._id,
            nombre_usuario_snapshot: nombreUsuarioSnapshot,
            puntuacion: puntuacion,
            comentario: comentario || '' // Aseguramos que comentario sea al menos un string vacío
        };

        // 6. Añadir la reseña al array de reseñas del producto
        producto.reseñas.push(nuevaReseña);

        // 7. Guardar el producto actualizado
        const productoGuardado = await producto.save();

        console.log(`--- [reseñaLogic] ¡ÉXITO! Reseña añadida al producto ${producto._id}.`);

        // Devolvemos solo la reseña añadida (o una confirmación simple)
        // Mongoose añade un _id a la reseña al guardarla.
        const reseñaGuardada = productoGuardado.reseñas.find(r => r.user_id.toString() === user_id.toString() && r.puntuacion === puntuacion && r.comentario === (comentario || ''));
        // Encontrar la reseña exacta puede ser complicado si hay varias similares del mismo usuario.
        // Es mejor devolver un mensaje de éxito o el producto actualizado simplificado.
        return { status: 'success', message: 'Reseña añadida con éxito', reseña_id: reseñaGuardada ? reseñaGuardada._id : 'unknown' };

    } catch (error) {
        console.error("--- [reseñaLogic] ERROR ---:", error.message);
        // Re-lanzamos el error para que sea manejado por el servicio
        throw error;
    }
}

module.exports = { procesarReseña };