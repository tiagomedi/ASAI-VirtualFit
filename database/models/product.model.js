const mongoose = require('mongoose');
const { Schema } = mongoose;

// --- Sub-esquemas ---
const variacionSchema = new Schema({
    // Mongoose añadirá un _id a cada variación automáticamente, lo cual es útil.
    talla: String,
    color: String,
    precio: { type: Number, required: true },
    stock: { type: Number, required: true, default: 0 },
    sku: { type: String, unique: true, sparse: true } // sparse:true permite valores null sin violar la unicidad
});

const reseñaSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    nombre_usuario_snapshot: String,
    puntuacion: { type: Number, required: true, min: 1, max: 5 },
    comentario: String
}, { timestamps: true });


// --- Esquema Principal del Producto ---

const productSchema = new Schema({
    nombre: { type: String, required: true, trim: true },
    marca: String,
    categoria: String,
    descripcion: String,
    tags: [String],
    variaciones: [variacionSchema], // Array de variaciones incrustadas
    reseñas: [reseñaSchema]       // Array de reseñas incrustadas
}, {
    timestamps: true
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;