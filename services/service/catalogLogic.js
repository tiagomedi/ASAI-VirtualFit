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
    console.log(`--- [catalogLogic] INICIANDO buscarProductos con término: "${termino}" ---`);
    try {
        if (!termino || termino.trim() === '') {
            throw new Error("El término de búsqueda no puede estar vacío.");
        }

        const terminoLimpio = termino.trim();
        
        // Búsqueda flexible usando regex en múltiples campos
        const productos = await Product.find({
            $or: [
                { nombre: { $regex: terminoLimpio, $options: 'i' } },
                { marca: { $regex: terminoLimpio, $options: 'i' } },
                { categoria: { $regex: terminoLimpio, $options: 'i' } },
                { descripcion: { $regex: terminoLimpio, $options: 'i' } },
                { tags: { $regex: terminoLimpio, $options: 'i' } },
                { 'variaciones.color': { $regex: terminoLimpio, $options: 'i' } },
                { 'variaciones.talla': { $regex: terminoLimpio, $options: 'i' } }
            ]
        }).lean();

        console.log(`--- [catalogLogic] ÉXITO: Búsqueda devolvió ${productos.length} productos ---`);
        return productos;
    } catch (error) {
        console.error("--- [catalogLogic] ERROR en buscarProductos ---:", error);
        throw new Error("Error al buscar productos: " + error.message);
    }
}

async function filtrarProductos(criteria) {
    console.log(`--- [catalogLogic] INICIANDO filtrarProductos con criterios:`, criteria);
    try {
        const query = {};
        
        // Filtro por marca
        if (criteria.marca && criteria.marca.trim()) {
            query.marca = { $regex: criteria.marca.trim(), $options: 'i' };
        }
        
        // Filtro por categoría
        if (criteria.categoria && criteria.categoria.trim()) {
            query.categoria = { $regex: criteria.categoria.trim(), $options: 'i' };
        }
        
        // Filtro por color
        if (criteria.color && criteria.color.trim()) {
            query['variaciones.color'] = { $regex: criteria.color.trim(), $options: 'i' };
        }
        
        // Filtro por talla
        if (criteria.talla && criteria.talla.trim()) {
            query['variaciones.talla'] = { $regex: criteria.talla.trim(), $options: 'i' };
        }
        
        // Filtro por rango de precios
        if (criteria.precio_min || criteria.precio_max) {
            query['variaciones.precio'] = {};
            if (criteria.precio_min) {
                query['variaciones.precio'].$gte = Number(criteria.precio_min);
            }
            if (criteria.precio_max) {
                query['variaciones.precio'].$lte = Number(criteria.precio_max);
            }
        }
        
        // Filtro por disponibilidad en stock
        if (criteria.solo_disponibles === true) {
            query['variaciones.stock'] = { $gt: 0 };
        }

        console.log(`--- [catalogLogic] Query construida:`, JSON.stringify(query, null, 2));
        
        const productos = await Product.find(query).lean();
        
        console.log(`--- [catalogLogic] ÉXITO: Filtros devolvieron ${productos.length} productos ---`);
        return productos;
    } catch (error) {
        console.error("--- [catalogLogic] ERROR en filtrarProductos ---:", error);
        throw new Error("Error al filtrar productos: " + error.message);
    }
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