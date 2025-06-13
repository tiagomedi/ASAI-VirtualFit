
// services/productService.js

const Product = require('../../database/models/product.model');

/**
 * Crea un nuevo producto en la base de datos.
 * @param {object} productData - Datos del producto (nombre, marca, precio, etc.).
 * @returns {Promise<object>} El producto creado.
 */
async function crearProducto(productData) {
    console.log('[productService] Creando nuevo producto:', productData.nombre);
    // Aquí podrías añadir validaciones extra si fuera necesario
    const newProduct = new Product(productData);
    await newProduct.save();
    return newProduct;
}

/**
 * Edita un producto existente.
 * @param {string} productoId - El _id del producto a editar.
 * @param {object} updates - Un objeto con los campos a actualizar.
 * @returns {Promise<object>} El producto actualizado.
 */
async function editarProducto(productoId, updates) {
    console.log(`[productService] Editando producto con ID: ${productoId}`);
    const updatedProduct = await Product.findByIdAndUpdate(productoId, updates, { new: true });
    if (!updatedProduct) {
        throw new Error('Producto no encontrado.');
    }
    return updatedProduct;
}

/**
 * Elimina un producto.
 * @param {string} productoId - El _id del producto a eliminar.
 * @returns {Promise<object>} Un mensaje de confirmación.
 */
async function eliminarProducto(productoId) {
    console.log(`[productService] Eliminando producto con ID: ${productoId}`);
    const result = await Product.findByIdAndDelete(productoId);
    if (!result) {
        throw new Error('Producto no encontrado.');
    }
    return { message: `Producto con ID ${productoId} eliminado correctamente.` };
}

module.exports = {
    crearProducto,
    editarProducto,
    eliminarProducto
};