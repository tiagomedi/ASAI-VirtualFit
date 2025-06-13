// database/models/user.model.js

const mongoose = require('mongoose');
const { Schema } = mongoose;

// --- Sub-esquemas para datos incrustados ---
// Ayudan a mantener el código del esquema principal más limpio y organizado.

const DireccionSchema = new Schema({
    nombre_direccion: { type: String, required: true },
    calle: { type: String, required: true },
    ciudad: { type: String, required: true },
    region: String,
    codigo_postal: { type: String, required: true },
    es_predeterminada: { type: Boolean, default: false }
});

const MetodoPagoSchema = new Schema({
    tipo: { type: String, required: true, enum: ['Tarjeta de Crédito', 'PayPal', 'Otro'] },
    detalle: { type: String, required: true }, // Ej: "**** **** **** 1234"
    expiracion: String // Ej: "12/26"
});

const ItemCarritoSchema = new Schema({
    producto_variacion_id: { type: Schema.Types.ObjectId, ref: 'Product.variaciones', required: true },
    producto_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    nombre_snapshot: { type: String, required: true },
    cantidad: { type: Number, required: true, min: 1 },
    precio_snapshot: { type: Number, required: true }
}, { _id: false }); // No es necesario un _id para cada item del carrito

const CarritoSchema = new Schema({
    items: [ItemCarritoSchema],
    updated_at: { type: Date, default: Date.now }
}, { _id: false }); // El carrito en sí no necesita su propio _id como sub-documento


// --- Esquema Principal del Usuario ---
// Define la estructura de los documentos en la colección 'users'.

const UserSchema = new Schema({
    correo: {
        type: String,
        required: [true, 'El correo electrónico es obligatorio.'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Por favor, introduce un correo electrónico válido.']
    },
    hash_password: {
        type: String,
        required: [true, 'La contraseña es obligatoria.']
    },
    rol: {
        type: String,
        required: true,
        enum: ['admin', 'cliente'], // El rol solo puede ser uno de estos dos valores.
        default: 'cliente'         // Los nuevos usuarios son 'cliente' por defecto.
    },
    
    // --- Campos específicos para el rol 'cliente' ---
    // Estos campos no son obligatorios, ya que un 'admin' no los tendrá.
    asai_points: {
        type: Number,
        default: 0
    },
    direcciones: [DireccionSchema],
    metodos_pago: [MetodoPagoSchema],
    carrito: {
        type: CarritoSchema,
        default: () => ({ items: [] }) // Valor por defecto para asegurar que el carrito se cree para los nuevos clientes.
    },
    lista_deseos: [{
        type: Schema.Types.ObjectId,
        ref: 'Product'
    }]
}, {
    // Opciones del esquema:
    timestamps: true // Añade automáticamente los campos 'createdAt' y 'updatedAt'.
});

// El primer argumento 'User' es el nombre singular del modelo.
// Mongoose automáticamente buscará la colección en plural y minúsculas: 'users'.
module.exports = mongoose.model('User', UserSchema);