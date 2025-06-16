// service/catalogLogic.js
const Product = require('../../database/models/product.model');

/**
 * @description Obtiene todos los productos de la base de datos.
 * @returns {Promise<Array>} Una lista de productos.
 */
async function listarTodosLosProductos() {
    console.log("--- [catalogLogic] INICIANDO listarTodosLosProductos ---");
    try {
        // ***** INICIO DE LA CORRECCIÓN CRÍTICA *****
        // Seleccionamos MENOS campos para que la respuesta sea más pequeña
        // y el bus pueda manejarla.
        const productos = await Product.find({})
            .select('nombre marca variaciones._id variaciones.precio') // Solo lo esencial
            .lean();
        // ***** FIN DE LA CORRECCIÓN CRÍTICA *****

        console.log(`--- [catalogLogic] ÉXITO: Encontrados ${productos.length} productos.`);
        return productos;
    } catch (error) {
        console.error("--- [catalogLogic] ERROR en listarTodosLosProductos ---:", error);
        throw new Error("No se pudieron obtener los productos de la base de datos.");
    }
}


// ... El resto de las funciones de catalogLogic no necesitan cambios ...
async function buscarProductos(termino) { /* ...código existente... */ }
async function filtrarProductos(criteria) { /* ...código existente... */ }
async function obtenerDetallesProducto(productoId) { /* ...código existente... */ }

module.exports = {
    listarTodosLosProductos,
    buscarProductos,
    filtrarProductos,
    obtenerDetallesProducto
};