// service/catalogLogic.js
// VERSIÓN FINAL Y CORRECTA
const Product = require('../../database/models/product.model');

async function listarTodosLosProductos(page = 1, limit = 4) {
    console.log(`--- [catalogLogic] INICIANDO listarTodosLosProductos con AGREGACIÓN (Página: ${page}, Límite: ${limit}) ---`);
    try {
        const pageNum = Number(page) || 1;
        const limitNum = Number(limit) || 4;
        const skip = (pageNum - 1) * limitNum;

        // Primero contamos el total de documentos para la paginación
        const totalProducts = await Product.countDocuments({});

        // Luego, ejecutamos el pipeline de agregación para obtener solo la página actual
        const productos = await Product.aggregate([
            { $sort: { nombre: 1 } },
            { $skip: skip },
            { $limit: limitNum },
            {
                $project: {
                    _id: 1,
                    nombre: 1,
                    marca: 1,
                    variaciones: { $slice: ['$variaciones', 1] } 
                }
            }
        ]);

        console.log(`--- [catalogLogic] ÉXITO: La AGREGACIÓN a la DB devolvió ${productos.length} productos optimizados.`);
        
        return {
            products: productos,
            totalPages: Math.ceil(totalProducts / limitNum),
            currentPage: pageNum,
            totalProducts: totalProducts
        };
    } catch (error) {
        console.error("--- [catalogLogic] ERROR en listarTodosLosProductos con AGREGACIÓN ---:", error);
        throw new Error("No se pudieron obtener los productos de la base de datos.");
    }
}

async function buscarProductos(termino) {
    return Product.find({ $text: { $search: termino } }).lean();
}

async function filtrarProductos(criteria) {
    const query = {};
    if (criteria.marca) query.marca = { $regex: criteria.marca, $options: 'i' };
    if (criteria.color) query['variaciones.color'] = { $regex: criteria.color, $options: 'i' };
    if (criteria.precio_min || criteria.precio_max) {
        query['variaciones.precio'] = {};
        if (criteria.precio_min) query['variaciones.precio'].$gte = criteria.precio_min;
        if (criteria.precio_max) query['variaciones.precio'].$lte = criteria.precio_max;
    }
    return Product.find(query).lean();
}

async function obtenerDetallesProducto(productoId) {
    return Product.findById(productoId).lean();
}

module.exports = {
    listarTodosLosProductos,
    buscarProductos,
    filtrarProductos,
    obtenerDetallesProducto
};