const mongoose = require('mongoose');
const { Schema } = mongoose;

// --- Esquema Principal del Pedido ---

const orderSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    total_pago: { type: Number, required: true },
    estado: {
        type: String,
        required: true,
        enum: ['Procesando', 'Enviado', 'Entregado', 'Cancelado'],
        default: 'Procesando'
    },
    // --- Snapshot de datos ---
    direccion_envio: {
        type: {
            calle: String,
            ciudad: String,
            region: String,
            codigo_postal: String
        },
        required: true
    },
    metodo_pago_usado: {
        type: {
            tipo: String,
            detalle: String
        },
        required: true
    },
    items: [{
        _id: false, // No necesitamos ID para los items del pedido
        producto_id: { type: Schema.Types.ObjectId, ref: 'Product' },
        producto_variacion_id: { type: Schema.Types.ObjectId }, // No referenciamos, es solo ID
        nombre: String,
        talla: String,
        color: String,
        cantidad: Number,
        precio_unitario: Number
    }]
}, {
    timestamps: true // Para fecha de creación y actualización del pedido
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;