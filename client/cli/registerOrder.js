// createOrderBusClient_withProductSchema.js

const net = require('net');
const { v4: uuidv4 } = require('uuid');

// --- Configuración del Bus ---
const BUS_HOST = 'localhost'; // Ajusta si tu bus está en otra IP/host
const BUS_PORT = 5001;      // Ajusta el puerto de tu bus
const CLIENT_ID = uuidv4().substring(0, 5); // ID único para este cliente (5 caracteres)
const SERVICE_TO_CALL = 'orders'; // <<<--- ID del servicio que maneja la creación de órdenes

// --- Datos de la Orden a Enviar ---
// **** ¡IMPORTANTE! DEBES EDITAR ESTA SECCIÓN CON LOS DATOS REALES DE LA ORDEN ****
// Asegúrate de usar IDs válidos de tu base de datos de desarrollo
const orderDataToSend = {
    // user_id: Debe ser un ObjectId válido (string) de un usuario existente en tu BD
    userId: '68487c3423f837087c8b8b19', // <<<--- ¡REEMPLAZA ESTO! Ejemplo: '60c72b2f9b1d8e001c8e4a5d'

    // items: Array de productos/variaciones específicas en la orden
    items: [
        {
            // producto_id: ObjectId válido (string) del documento Product principal
            producto_id: '6848e24d98766234fe88f3b3', // <<<--- ¡REEMPLAZA ESTO! Ejemplo: '60d5ec49b123c1f0b3a4d5e6'
            // producto_variacion_id: ObjectId válido (string) de una variación *dentro* del array 'variaciones' de ese producto
            producto_variacion_id: 'ID_DE_VARIACION_1_AQUI', // <<<--- ¡REEMPLAZA ESTO! Ejemplo: '60d5ec49b123c1f0b3a4d5e7'
            // Datos snapshot de la variación y el producto en el momento de la compra:
            nombre: 'Camiseta Básica', // Nombre del producto principal
            talla: 'M',              // Talla de la variación
            color: 'Rojo',           // Color de la variación
            cantidad: 1,             // Cantidad comprada
            precio_unitario: 25.99   // Precio de la variación en el momento de la compra
        },
        {
            producto_id: 'ID_DEL_PRODUCTO_2_AQUI', // <<<--- ¡REEMPLAZA ESTO! Ejemplo: '60f1a8d0c456e2b1d0f7g8h9'
            producto_variacion_id: 'ID_DE_VARIACION_2_AQUI', // <<<--- ¡REEMPLAZA ESTO! Ejemplo: '60f1a8d0c456e2b1d0f7g8ha'
            nombre: 'Pantalón Vaquero',
            talla: 'L',
            color: 'Azul Oscuro',
            cantidad: 2,
            precio_unitario: 55.00
        }
        // Puedes añadir más items aquí. Cada item debe referenciar UN producto y UNA variación específica de ese producto.
    ],

    // direccion_envio: Detalles de la dirección (snapshot)
    direccion_envio: {
        calle: 'Avenida Principal 123',
        ciudad: 'Metrópolis',
        region: 'Capital',
        codigo_postal: '98765'
    },

    // metodo_pago_usado: Detalles del método de pago (snapshot)
    metodo_pago_usado: {
        tipo: 'PayPal', // Ej: 'Tarjeta de Crédito', 'PayPal', 'Transferencia'
        detalle: 'user@example.com' // Ej: 'Visa terminada en 1234', 'Nº Referencia XYZ'
    }

    // El servicio calculará 'total_pago' y establecerá 'estado' por defecto ('Procesando')
};
// ******************************************************************************

// --- Función para enviar un mensaje con el formato del bus ---
function sendMessage(socket, service, payloadString) {
    const fullPayload = service + payloadString;
    const header = String(fullPayload.length).padStart(5, '0');
    const fullMessage = header + fullPayload;
    console.log(`[Cliente ${CLIENT_ID}] Enviando mensaje al servicio '${service}': ${fullMessage}`);
    socket.write(fullMessage);
}

// --- Lógica del Cliente ---
const client = new net.Socket();

async function run() {
    client.connect(BUS_PORT, BUS_HOST, async () => {
        console.log(`[Cliente ${CLIENT_ID}] Conectado al bus en ${BUS_HOST}:${BUS_PORT}.`);

        try {
            // 1. Registrar el cliente con el bus
            sendMessage(client, 'sinit', CLIENT_ID);

            // Pequeña pausa para permitir que el bus procese el sinit
            await new Promise(resolve => setTimeout(resolve, 100));

            // 2. Preparar y enviar la solicitud de creación de orden
            const requestPayload = {
                // Enviamos todos los datos de la orden definidos arriba
                orderDetails: orderDataToSend,
                // Incluimos el ID del cliente en el payload para que el servicio sepa a quién responder
                clientId: CLIENT_ID
            };

            console.log(`[Cliente ${CLIENT_ID}] Preparando solicitud para crear orden...`);
            // console.log('Datos de la orden:', JSON.stringify(orderDataToSend, null, 2)); // Descomentar para ver los datos exactos enviados

            sendMessage(client, SERVICE_TO_CALL, JSON.stringify(requestPayload));
            console.log(`\n[Cliente ${CLIENT_ID}] Solicitud enviada al servicio '${SERVICE_TO_CALL}'. Esperando respuesta...`);

        } catch (error) {
            console.error(`[Cliente ${CLIENT_ID}] Error durante la interacción: ${error.message}`);
            client.end(); // Cerrar conexión en caso de error
        }
    });


    client.on('data', (data) => {
        const rawData = data.toString();
        // Basándonos en tu ejemplo, el bus parece reenviar la respuesta
        // al cliente_id que va al inicio del payload recibido, con el formato:
        // length(5) + recipient_id(5) + message (que es el JSON de respuesta del servicio)

        try {
            const length = parseInt(rawData.substring(0, 5), 10);
            if (isNaN(length) || rawData.length < 5 + length) {
                 console.warn(`[Cliente ${CLIENT_ID}] Datos incompletos o formato incorrecto recibido. Esperando más datos o error: ${rawData}`);
                 // En un escenario real, podrías necesitar un buffer para datos parciales.
                 // Para este script simple, si no es suficiente, lo tratamos como un posible error de formato.
                 if (rawData.length >= 5) { // Si al menos tenemos el encabezado de longitud
                      console.error(`[Cliente ${CLIENT_ID}] Error: Longitud especificada (${length}) excede datos recibidos (${rawData.length - 5} después del encabezado).`);
                      client.end();
                 }
                 return;
            }

            const fullPayload = rawData.substring(5, 5 + length);
            const recipientId = fullPayload.substring(0, 5); // Los primeros 5 caracteres después de la longitud
            const message = fullPayload.substring(5); // El resto es el mensaje (JSON)

            // Si el mensaje es la confirmación de sinit del bus
            // Algunos buses pueden responder sinit + client_id, otros solo confirmar
            // Adaptamos a tu patrón original de sinit + client_id
            if (fullPayload.substring(0, 5) === 'sinit' && message === CLIENT_ID) {
                 console.log(`[Cliente ${CLIENT_ID}] Registro en el bus confirmado.`);
                 // No cerramos la conexión, esperamos la respuesta de la orden
                 return;
            }

             // Si el mensaje no es para este cliente (si tu bus reenvía a todos, esto es necesario)
             if (recipientId !== CLIENT_ID) {
                 console.warn(`[Cliente ${CLIENT_ID}] Recibido mensaje no dirigido a este cliente (recipient: ${recipientId}). Ignorando.`);
                 // No cerramos la conexión, esperamos el mensaje correcto
                 return;
             }

            console.log(`\n[Cliente ${CLIENT_ID}] Respuesta recibida (dirigida a ${recipientId}):`);
            let response;
            try {
                 response = JSON.parse(message);
            } catch (e) {
                 console.error(`[Cliente ${CLIENT_ID}] Error parseando JSON de respuesta: ${e.message}`, message);
                 client.end(); // Cerrar conexión si la respuesta no es JSON válido
                 return;
            }


            if (response.status === 'success') {
                console.log('¡Éxito! Orden creada correctamente:');
                // Imprimir detalles de la orden creada desde la respuesta
                console.log(`- ID de Orden: ${response.data._id}`);
                console.log(`- Usuario ID: ${response.data.user_id}`);
                console.log(`- Total Pagado: ${response.data.total_pago}`);
                console.log(`- Estado: ${response.data.estado}`);
                console.log('- Dirección de Envío:', response.data.direccion_envio);
                console.log('- Método de Pago:', response.data.metodo_pago_usado);
                console.log('- Items en la Orden:');
                response.data.items.forEach(item => {
                     console.log(`  - ${item.cantidad}x ${item.nombre} (${item.talla}/${item.color}) @ ${item.precio_unitario} c/u`);
                });


            } else {
                console.error(`Error del servicio '${SERVICE_TO_CALL}': ${response.message}`);
                 // Muestra detalles adicionales del error si están presentes (ej: de validación)
                 if (response.errorDetails) {
                     console.error('Detalles del Error:', response.errorDetails);
                 }
            }

            client.end(); // Cerrar conexión después de recibir y procesar la respuesta final

        } catch (error) {
            console.error(`[Cliente ${CLIENT_ID}] Error procesando datos recibidos: ${error.message}`, error);
            client.end(); // Cerrar conexión ante error de procesamiento inesperado
        }
    });

    client.on('close', () => {
        console.log(`[Cliente ${CLIENT_ID}] Conexión cerrada.`);
    });

    client.on('error', (err) => {
        console.error(`[Cliente ${CLIENT_ID}] Error de conexión: ${err.message}`);
        client.end(); // Asegurarse de cerrar en caso de error de conexión
    });
}

run();