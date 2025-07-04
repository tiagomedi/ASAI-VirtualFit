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
    console.log(`[notifLogic] -> Preparando para enviar correo ultra compacto a ${payload.to}.`);

    const { to, order, total, items } = payload;
    
    if (!to || !order) {
        throw new Error("Faltan datos esenciales para el correo (destinatario u order).");
    }

    // 2. Construir el cuerpo del correo en formato HTML ultra simplificado
    const emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 400px; margin: auto; padding: 15px;">
            <h2 style="color: #4CAF50;">ASAI - Orden Confirmada</h2>
            <p>Hola,</p>
            <p>Tu orden #${order} ha sido procesada.</p>
            <p><strong>Items:</strong> ${items} productos</p>
            <p><strong>Total:</strong> $${total}</p>
            <p>Gracias por tu compra.</p>
        </div>
    `;

    // 3. Definir las opciones del correo
    const mailOptions = {
        from: `"ASAI Store" <${process.env.EMAIL_SENDER}>`,
        to: to,
        subject: `✅ Orden #${order} confirmada - ASAI`,
        html: emailHtml
    };

    // 4. Enviar el correo y manejar el resultado
    try {
        let info = await transporter.sendMail(mailOptions);
        console.log(`[notifLogic] Correo enviado exitosamente a ${to}. Message ID: ${info.messageId}`);
        return { status: 'ok', message: `Correo enviado para orden ${order} a ${to}.` };
    } catch (error) {
        console.error(`[notifLogic] ❌ Error al enviar correo:`, error);
        throw new Error(`Error al enviar el correo a ${to}: ${error.message}`);
    }
}

module.exports = { sendEmail };