// service/catalogLogic.js
const Product = require('../../database/models/product.model');

/**
 * @description Obtiene todos los productos de la base de datos.
 * @returns {Promise<Array>} Una lista de productos.
 */
async function listarTodosLosProductos() {
    console.log("--- [catalogLogic] INICIANDO listarTodosLosProductos ---");
    try {
        // Usamos .lean() para obtener objetos JSON puros, es más rápido para solo lectura.
        // Seleccionamos solo los campos más relevantes para el catálogo.
        const productos = await Product.find({})
            .select('nombre marca categoria variaciones')
            .lean();
        console.log(`--- [catalogLogic] ÉXITO: Encontrados ${productos.length} productos.`);
        return productos;
    } catch (error) {
        console.error("--- [catalogLogic] ERROR en listarTodosLosProductos ---:", error);
        throw new Error("No se pudieron obtener los productos de la base de datos.");
    }
}

/**
 * @description Busca productos que coincidan con un término en nombre, descripción o tags.
 * @param {string} termino El término de búsqueda.
 * @returns {Promise<Array>} Una lista de productos que coinciden.
 */
async function buscarProductos(termino) {
    console.log(`--- [catalogLogic] INICIANDO buscarProductos con término: "${termino}" ---`);
    if (!termino || typeof termino !== 'string' || termino.trim() === '') {
        throw new Error("El término de búsqueda no puede estar vacío.");
    }
    try {
        // Creamos una expresión regular para una búsqueda "case-insensitive" que contenga el término.
        const regex = new RegExp(termino.trim(), 'i');

        const productos = await Product.find({
            $or: [
                { nombre: regex },
                { descripcion: regex },
                { tags: regex }
            ]
        }).select('nombre marca categoria variaciones').lean();

        console.log(`--- [catalogLogic] ÉXITO: Encontrados ${productos.length} productos para el término "${termino}".`);
        return productos;
    } catch (error) {
        console.error("--- [catalogLogic] ERROR en buscarProductos ---:", error);
        throw new Error(`Error al buscar productos con el término "${termino}".`);
    }
}

/**
 * @description Filtra productos basado en un conjunto de criterios.
 * @param {object} criteria Objeto con los criterios de filtro (marca, color, precio_min, precio_max).
 * @returns {Promise<Array>} Una lista de productos filtrados.
 */
async function filtrarProductos(criteria) {
    console.log("--- [catalogLogic] INICIANDO filtrarProductos con criterios:", criteria);
    try {
        const query = {};
        const variacionesQuery = {};

        if (criteria.marca) {
            query.marca = new RegExp(criteria.marca.trim(), 'i');
        }
        if (criteria.color) {
            // Buscamos dentro del array de subdocumentos 'variaciones'
            variacionesQuery.color = new RegExp(criteria.color.trim(), 'i');
        }

        const precioFilter = {};
        if (criteria.precio_min) {
            precioFilter.$gte = parseFloat(criteria.precio_min);
        }
        if (criteria.precio_max) {
            precioFilter.$lte = parseFloat(criteria.precio_max);
        }
        if (Object.keys(precioFilter).length > 0) {
            variacionesQuery.precio = precioFilter;
        }

        // Si hay criterios para las variaciones, usamos $elemMatch para asegurar que
        // un solo subdocumento de variación cumpla con todos los criterios.
        if (Object.keys(variacionesQuery).length > 0) {
            query.variaciones = { $elemMatch: variacionesQuery };
        }
        
        const productos = await Product.find(query).select('nombre marca categoria variaciones').lean();
        console.log(`--- [catalogLogic] ÉXITO: Encontrados ${productos.length} productos con los filtros aplicados.`);
        return productos;

    } catch (error) {
        console.error("--- [catalogLogic] ERROR en filtrarProductos ---:", error);
        throw new Error("Error al aplicar los filtros a los productos.");
    }
}

// RF5

/**
 * @description Obtiene los detalles completos de un único producto por su ID.
 * @param {string} productoId El ID del producto.
 * @returns {Promise<Object>} El documento completo del producto.
 */
async function obtenerDetallesProducto(productoId) {
    console.log(`--- [catalogLogic] INICIANDO obtenerDetallesProducto para ID: ${productoId} ---`);
    if (!productoId) throw new Error("Se requiere un ID de producto.");
    
    try {
        const producto = await Product.findById(productoId);
        if (!producto) throw new Error(`Producto con ID ${productoId} no encontrado.`);
        
        console.log(`--- [catalogLogic] ÉXITO: Detalles de '${producto.nombre}' encontrados.`);
        return producto;
    } catch (error) {
        console.error("--- [catalogLogic] ERROR en obtenerDetallesProducto ---:", error);
        // Lanza el error para que el servicio que llama lo maneje
        throw error;
    }
}


module.exports = {
    listarTodosLosProductos,
    buscarProductos,
    filtrarProductos,
    obtenerDetallesProducto
};