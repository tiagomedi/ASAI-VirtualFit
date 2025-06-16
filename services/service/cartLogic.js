// service/cartLogic.js
const User = require('../../database/models/user.model');
const Product = require('../../database/models/product.model');

async function verCarrito(user_id) {
    console.log(`--- [cartLogic] INICIANDO verCarrito para usuario ${user_id} ---`);
    const usuario = await User.findById(user_id);
    if (!usuario) throw new Error("Usuario no encontrado.");
    if (!usuario.carrito) {
        return { items: [], updated_at: new Date() };
    }
    return usuario.carrito;
}

async function agregarAlCarrito(user_id, producto_id, cantidad) {
    console.log(`--- [cartLogic] INICIANDO agregarAlCarrito: ${cantidad} x ${producto_id} ---`);
    if (cantidad <= 0) throw new Error("La cantidad debe ser mayor que cero.");
    
    // ***** INICIO DE LA CORRECCIÓN DEFINITIVA *****
    // Eliminamos .lean() para obtener el documento completo y fiable de Mongoose.
    console.log(`[cartLogic] -> Consultando la DB por el producto ${producto_id}`);
    const producto = await Product.findById(producto_id);
    
    if (!producto) {
        throw new Error(`Producto con ID ${producto_id} no encontrado en la base de datos.`);
    }
    console.log(`[cartLogic] <- Producto '${producto.nombre}' encontrado en la DB.`);
    
    if (!producto.variaciones || producto.variaciones.length === 0) {
        throw new Error(`El producto '${producto.nombre}' no tiene variaciones (precio/stock).`);
    }

    const variacion = producto.variaciones[0];
    
    console.log('[cartLogic] Datos de la variación seleccionada:', variacion);
    
    // Con el documento completo de Mongoose, el _id siempre estará presente.
    // Ya no necesitamos la comprobación `if (!variacion._id)`.
    // ***** FIN DE LA CORRECCIÓN DEFINITIVA *****

    if (variacion.stock < cantidad) {
        throw new Error(`Stock insuficiente para '${producto.nombre}'. Disponible: ${variacion.stock}, Solicitado: ${cantidad}.`);
    }

    const usuario = await User.findById(user_id);
    if (!usuario) throw new Error("Usuario no encontrado.");

    if (!usuario.carrito) {
        usuario.carrito = { items: [] };
    }

    const itemExistente = usuario.carrito.items.find(
        item => item.producto_variacion_id && item.producto_variacion_id.equals(variacion._id)
    );

    if (itemExistente) {
        itemExistente.cantidad += cantidad;
    } else {
        usuario.carrito.items.push({
            producto_id: producto._id,
            producto_variacion_id: variacion._id,
            nombre_snapshot: producto.nombre,
            cantidad: cantidad,
            precio_snapshot: variacion.precio
        });
    }

    usuario.carrito.updated_at = new Date();
    await usuario.save();
    console.log(`[cartLogic] ÉXITO: Producto añadido/actualizado en el carrito.`);
    return usuario.carrito;
}


async function modificarCantidad(user_id, producto_variacion_id, nueva_cantidad) {
    console.log(`--- [cartLogic] INICIANDO modificarCantidad a ${nueva_cantidad} ---`);
    if (nueva_cantidad <= 0) throw new Error("La nueva cantidad debe ser mayor a cero.");

    const usuario = await User.findById(user_id);
    if (!usuario || !usuario.carrito) throw new Error("Carrito no encontrado.");

    const itemEnCarrito = usuario.carrito.items.find(item => item.producto_variacion_id.equals(producto_variacion_id));
    if (!itemEnCarrito) throw new Error("Ítem no encontrado en el carrito.");

    // Aplicamos la misma corrección aquí
    const producto = await Product.findById(itemEnCarrito.producto_id);
    if (!producto) throw new Error("El producto asociado al ítem del carrito ya no existe.");

    const variacion = producto.variaciones.id(producto_variacion_id); // .id() es el método de Mongoose para buscar en subdocumentos
    if (!variacion || variacion.stock < nueva_cantidad) {
        throw new Error(`Stock insuficiente. Disponible: ${variacion ? variacion.stock : 0}`);
    }

    itemEnCarrito.cantidad = nueva_cantidad;
    await usuario.save();
    console.log(`[cartLogic] ÉXITO: Cantidad modificada.`);
    return usuario.carrito;
}


async function eliminarDelCarrito(user_id, producto_variacion_id) {
    console.log(`--- [cartLogic] INICIANDO eliminarDelCarrito ---`);
    const usuario = await User.findById(user_id);
    if (!usuario || !usuario.carrito) throw new Error("Carrito no encontrado.");
    usuario.carrito.items.pull({ producto_variacion_id: producto_variacion_id });
    await usuario.save();
    console.log(`[cartLogic] ÉXITO: Ítem eliminado del carrito.`);
    return usuario.carrito;
}


module.exports = {
    verCarrito,
    agregarAlCarrito,
    modificarCantidad,
    eliminarDelCarrito
};