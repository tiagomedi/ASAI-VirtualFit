// db/User.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Schema para sub-documentos para mantener el código limpio
const DireccionSchema = new Schema({
    nombre_direccion: { type: String, required: true },
    calle: { type: String, required: true },
    ciudad: { type: String, required: true },
    region: String,
    codigo_postal: { type: String, required: true },
    es_predeterminada: { type: Boolean, default: false }
});

const MetodoPagoSchema = new Schema({
    tipo: { type: String, required: true },
    detalle: { type: String, required: true },
    expiracion: String
});

const ItemCarritoSchema = new Schema({
    producto_variacion_id: { type: Schema.Types.ObjectId, ref: 'Product.variaciones', required: true },
    producto_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    nombre_snapshot: { type: String, required: true },
    cantidad: { type: Number, required: true, min: 1 },
    precio_snapshot: { type: Number, required: true }
});

const CarritoSchema = new Schema({
    items: [ItemCarritoSchema],
    updated_at: { type: Date, default: Date.now }
});


// Schema principal del Usuario
const UserSchema = new Schema({
    correo: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    hash_password: {
        type: String,
        required: true
    },
    asai_points: {
        type: Number,
        default: 0
    },
    direcciones: [DireccionSchema],
    metodos_pago: [MetodoPagoSchema],
    carrito: CarritoSchema,
    lista_deseos: [{
        type: Schema.Types.ObjectId,
        ref: 'Product'
    }]
}, {
    timestamps: true // Añade createdAt y updatedAt automáticamente
});

// El primer argumento 'User' es el nombre singular del modelo.
// Mongoose automáticamente buscará la colección en plural 'users'.
module.exports = mongoose.model('User', UserSchema);