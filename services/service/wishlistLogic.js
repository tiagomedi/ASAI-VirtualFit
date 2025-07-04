// service/wishlistLogic.js
const User = require('../../database/models/user.model');
const Product = require('../../database/models/product.model'); 

/**
 * @description 
 * @param {string} user_id 
 * @param {number} page 
 * @param {number} limit 
 * @returns {Promise<Object>}
 */
async function verListaDeDeseos(user_id, page = 1, limit = 4) {
    const usuario = await User.findById(user_id)
        .populate({
            path: 'lista_deseos',
            select: 'nombre marca variaciones' // Seleccionamos campos relevantes
        });

    if (!usuario) throw new Error("Usuario no encontrado.");
    
    const totalProducts = usuario.lista_deseos.length;
    const totalPages = Math.ceil(totalProducts / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedProducts = usuario.lista_deseos.slice(startIndex, endIndex);
    
    return {
        products: paginatedProducts,
        totalPages: totalPages,
        currentPage: page,
        totalProducts: totalProducts
    };
}

/**
 * @description Añade un producto a la lista de deseos de un usuario.
 * @param {string} user_id El ID del usuario.
 * @param {string} producto_id El ID del producto a añadir.
 * @returns {Promise<Object>} El documento actualizado del usuario con la lista de deseos.
 */
async function agregarALista(user_id, producto_id) {
    const [usuario, producto] = await Promise.all([
        User.findById(user_id),
        Product.findById(producto_id)
    ]);

    if (!usuario) throw new Error("Usuario no encontrado.");
    if (!producto) throw new Error("Producto no encontrado.");

    // Mongoose $addToSet asegura que no se añadan duplicados.
    await User.updateOne(
        { _id: user_id },
        { $addToSet: { lista_deseos: producto._id } }
    );
    
    return { status: 'success', message: `Producto '${producto.nombre}' añadido a tu lista de deseos.` };
}


/**
 * @description Elimina un producto de la lista de deseos de un usuario.
 * @param {string} user_id El ID del usuario.
 * @param {string} producto_id El ID del producto a eliminar.
 * @returns {Promise<Object>} El documento actualizado del usuario con la lista de deseos.
 */
async function eliminarDeLista(user_id, producto_id) {
    const usuario = await User.findById(user_id);
    if (!usuario) throw new Error("Usuario no encontrado.");

    // Mongoose $pull para eliminar un ID de un array.
    await User.updateOne(
        { _id: user_id },
        { $pull: { lista_deseos: producto_id } }
    );
    
    return { status: 'success', message: 'Producto eliminado de tu lista de deseos.' };
}

module.exports = {
    verListaDeDeseos,
    agregarALista,
    eliminarDeLista
};