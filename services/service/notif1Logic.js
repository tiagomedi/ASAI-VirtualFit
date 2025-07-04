// notif1Logic.js

const nodemailer = require('nodemailer');

// 1. Configurar el "transportador" de correo
// Usa las credenciales seguras desde el fichero .env
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // false para puerto 587 (usa STARTTLS)
    auth: {
        user: process.env.EMAIL_SENDER, // Tu correo de Gmail
        pass: process.env.EMAIL_PASSWORD  // Tu contraseña de aplicación de Gmail
    }
});

/**
 * Envía un correo de confirmación de pedido.
 * @param {object} payload - Los datos para el correo.
 * @returns {Promise<object>} - Un objeto con el estado del envío.
 */
async function sendEmail(payload) {
    console.log(`[notifLogic] -> Preparando para enviar correo real a ${payload.to}.`);

    const { to, order_id, order_date, address, products, total_pagado, mensaje } = payload;
    
    if (!to || !order_id) {
        throw new Error("Faltan datos esenciales para el correo (destinatario u order_id).");
    }

    // 2. Construir el cuerpo del correo en formato HTML
    let productsHtml = products.map(p => `
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${p.nombre} (${p.talla}/${p.color})</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${p.cantidad}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">$${(p.precio_unitario * p.cantidad).toFixed(2)}</td>
        </tr>
    `).join('');

    const emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
            <h2 style="color: #4CAF50; text-align: center; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">Confirmación de Pedido - ASAI</h2>
            <p>Hola,</p>
            <p>${mensaje}</p>
            <hr style="border: 0; border-top: 1px solid #eee;">
            <h3>Detalles del Pedido</h3>
            <p><strong>ID de Orden:</strong> ${order_id}</p>
            <p><strong>Fecha:</strong> ${new Date(order_date).toLocaleDateString('es-ES')}</p>
            <hr style="border: 0; border-top: 1px solid #eee;">
            <h3>Dirección de Envío</h3>
            <p style="background-color: #f9f9f9; padding: 10px; border-radius: 5px;">
                ${address.nombre_direccion || ''}<br>
                ${address.calle}, ${address.ciudad}<br>
                ${address.region || ''}, CP: ${address.codigo_postal}
            </p>
            <hr style="border: 0; border-top: 1px solid #eee;">
            <h3>Resumen de la Compra</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th style="text-align: left; padding: 10px; background-color: #f2f2f2;">Producto</th>
                        <th style="text-align: center; padding: 10px; background-color: #f2f2f2;">Cantidad</th>
                        <th style="text-align: right; padding: 10px; background-color: #f2f2f2;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${productsHtml}
                </tbody>
            </table>
            <h3 style="text-align: right; margin-top: 20px; color: #4CAF50;">TOTAL PAGADO: $${total_pagado.toFixed(2)}</h3>
            <hr style="border: 0; border-top: 1px solid #eee;">
            <p style="text-align: center; font-size: 12px; color: #777;">Gracias por tu compra,<br>El equipo de ASAI</p>
        </div>
    `;

    // 3. Definir las opciones del correo
    const mailOptions = {
        from: `"ASAI Store" <${process.env.EMAIL_SENDER}>`,
        to: to,
        subject: `✅ Confirmación de tu pedido en ASAI #${order_id}`,
        html: emailHtml
    };

    // 4. Enviar el correo y manejar el resultado
    try {
        let info = await transporter.sendMail(mailOptions);
        console.log(`[notifLogic] Correo enviado exitosamente a ${to}. Message ID: ${info.messageId}`);
        return { status: 'ok', message: `Correo de confirmación para la orden ${order_id} enviado a ${to}.` };
    } catch (error) {
        console.error(`[notifLogic] ❌ Error al enviar correo:`, error);
        throw new Error(`Error al enviar el correo a ${to}: ${error.message}`);
    }
}

module.exports = { sendEmail };