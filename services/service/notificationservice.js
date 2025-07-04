// notificationservice.js

require('dotenv').config();
const net = require('net');
const nodemailer = require('nodemailer');

// Configuración del transporte de correo
const transporter = nodemailer.createTransport({
  service: 'gmail', // Cambia si usas otro proveedor, ej: 'hotmail', 'yahoo'
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// Genera el texto del correo con los datos del pedido
function crearCuerpoCorreo(data) {
  let productos = data.products.map(prod =>
    `- ${prod.nombre} (${prod.marca}, ${prod.color}, Talla: ${prod.talla}): ${prod.cantidad} x $${prod.precio_unitario}`
  ).join('\n');

  return `
¡Hola!

Gracias por tu compra en VirtualFit.

Resumen de tu pedido:
ID de Orden: ${data.order_id}
Fecha: ${data.order_date}
Dirección de envío:
  ${data.address.nombre_direccion}, ${data.address.calle}, ${data.address.ciudad}, ${data.address.region}, CP: ${data.address.codigo_postal}

Productos:
${productos}

Total pagado: $${data.total_pagado}

${data.mensaje || 'Tu pedido está siendo procesado y pronto recibirás un número de seguimiento.'}

¡Gracias por confiar en VirtualFit!
  `;
}

// Parámetros de conexión al bus
const BUS_HOST = process.env.BUS_HOST || 'localhost';
const BUS_PORT = process.env.BUS_PORT || 5000;
const SERVICE_ID = 'notf1';

// Función para procesar los mensajes entrantes
async function procesarMensaje(datos, responder) {
  try {
    const data = JSON.parse(datos.DATOS);

    if (data.action === 'send_email') {
      const mailOptions = {
        from: process.env.MAIL_USER,
        to: data.to,
        subject: 'Confirmación de compra - VirtualFit',
        text: crearCuerpoCorreo(data)
      };

      await transporter.sendMail(mailOptions);
      console.log(`[notificationservice] ✅ Correo enviado a ${data.to}`);
      responder('OK', 'Correo enviado con éxito');
    } else {
      responder('NK', 'Acción no reconocida');
    }
  } catch (err) {
    console.error(`[notificationservice] ❌ Error al enviar correo:`, err.message);
    responder('NK', `Error: ${err.message}`);
  }
}

// --- INICIO SERVICIO TCP ---

const cliente = new net.Socket();

cliente.connect(BUS_PORT, BUS_HOST, () => {
  console.log('🟢 Servicio de Notificación conectado al BUS');
  cliente.write(formatearMensaje(`${SERVICE_ID}INIT`, 'init'));
});

let buffer = '';

cliente.on('data', (data) => {
  buffer += data.toString();

  let match;
  const regex = /^(\d{5})(.{5})(.{5})([\s\S]+)$/;
  while ((match = buffer.match(regex))) {
    const [full, len, sid, code, payload] = match;
    const esperado = parseInt(len, 10);
    if (buffer.length < esperado) break;

    const mensaje = {
      LEN: len,
      SID: sid,
      CODE: code,
      DATOS: payload.slice(0, esperado - 15)
    };

    const responder = (status, texto) => {
      const resp = formatearMensaje(`${SERVICE_ID}${status}`, texto);
      cliente.write(resp);
    };

    procesarMensaje(mensaje, responder);

    buffer = buffer.slice(esperado);
  }
});

cliente.on('error', (err) => {
  console.error('❌ Error en conexión al BUS:', err.message);
});

cliente.on('close', () => {
  console.log('🔴 Servicio de Notificación desconectado del BUS');
});

// Función utilitaria para formatear mensajes al BUS
function formatearMensaje(service, datos) {
  const body = `${service}${datos}`;
  const longitud = String(body.length).padStart(5, '0');
  return `${longitud}${body}`;
}
