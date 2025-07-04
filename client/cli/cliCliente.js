/* ------------------------  CLIENTE CLI  ------------------------------- */
const net = require('net');
const inquirer = require('inquirer').default;

const PERFIL_HOST = 'localhost';
const PERFIL_PORT = 5010;
let correoAutenticado = null;

console.log(`Conectando al servicio de perfil en ${PERFIL_HOST}:${PERFIL_PORT}…`);

/* ---------------------  Función para enviar petición directa  ---------- */
async function enviarPeticionDirecta(request) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = '';
    
    socket.setEncoding('utf8');
    
    socket.connect(PERFIL_PORT, PERFIL_HOST, () => {
      const payload = JSON.stringify(request);
      const header = String(payload.length).padStart(5, '0');
      socket.write(header + payload);
    });
    
    socket.on('data', (data) => {
      buffer += data;
      
      if (buffer.length >= 5) {
        const length = parseInt(buffer.substring(0, 5), 10);
        if (buffer.length >= 5 + length) {
          const responsePayload = buffer.substring(5, 5 + length);
          try {
            const response = JSON.parse(responsePayload);
            socket.end();
            resolve(response);
          } catch (error) {
            socket.end();
            reject(new Error('Error al parsear respuesta del servidor'));
          }
        }
      }
    });
    
    socket.on('error', (err) => {
      reject(new Error(`Error de conexión: ${err.message}`));
    });
    
    socket.on('close', () => {
      if (buffer.length === 0) {
        reject(new Error('Conexión cerrada sin respuesta'));
      }
    });
  });
}

/* ---------------------  Función para autenticar correo  --------------- */
async function autenticarCorreo() {
  while (!correoAutenticado) {
    const { correo } = await inquirer.prompt({
      type: 'input',
      name: 'correo',
      message: '📧 Ingresa tu correo electrónico para autenticarte:',
      validate: (input) => {
        if (!input.trim()) return 'El correo es requerido';
        if (!input.includes('@')) return 'Formato de correo inválido';
        return true;
      }
    });
    
    try {
      console.log('🔍 Verificando usuario...');
      const response = await enviarPeticionDirecta({
        action: 'ver_perfil',
        correo: correo.trim().toLowerCase()
      });
      
      if (response.status === 'success') {
        correoAutenticado = correo.trim().toLowerCase();
        console.log(`✅ Usuario autenticado correctamente: ${correoAutenticado}`);
        return;
      } else {
        console.log(`❌ Error: ${response.message}`);
      }
    } catch (error) {
      console.log(`❌ Error de conexión: ${error.message}`);
    }
  }
}

/* ---------------------  Función para ver perfil  --------------------- */
async function verPerfil() {
  try {
    console.log('📋 Obteniendo información del perfil...');
    const response = await enviarPeticionDirecta({
      action: 'ver_perfil',
      correo: correoAutenticado
    });
    
    if (response.status === 'success') {
      const perfil = JSON.parse(response.data);
      console.log('\n📋 INFORMACIÓN DEL PERFIL:');
      console.log(`📧 Correo: ${perfil.correo}`);
      console.log(`👤 Nombre: ${perfil.nombre || 'No especificado'}`);
      console.log(`🏠 Direcciones: ${perfil.direcciones?.length || 0}`);
      console.log(`💳 Métodos de pago: ${perfil.metodos_pago?.length || 0}`);
      
      if (perfil.direcciones && perfil.direcciones.length > 0) {
        console.log('\n🏠 DIRECCIONES:');
        perfil.direcciones.forEach((dir, index) => {
          console.log(`  ${index + 1}. ${dir.nombre_direccion || 'Sin nombre'}: ${dir.calle}, ${dir.ciudad}, ${dir.region} (${dir.codigo_postal})`);
        });
      }
      
      if (perfil.metodos_pago && perfil.metodos_pago.length > 0) {
        console.log('\n💳 MÉTODOS DE PAGO:');
        perfil.metodos_pago.forEach((pago, index) => {
          console.log(`  ${index + 1}. ${pago.tipo}: ${pago.detalle} (Exp: ${pago.expiracion})`);
        });
      }
    } else {
      console.log(`❌ Error: ${response.message}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

/* ---------------------  Función para agregar dirección  --------------- */
async function agregarDireccion() {
  try {
    const direccion = await inquirer.prompt([
      { name: 'nombre_direccion', message: '🏷️  Nombre de la dirección:' },
      { name: 'calle', message: '🛣️  Calle:' },
      { name: 'ciudad', message: '🏙️  Ciudad:' },
      { name: 'region', message: '🌎 Región:' },
      { name: 'codigo_postal', message: '📮 Código postal:' }
    ]);
    
    console.log('💾 Guardando dirección...');
    const response = await enviarPeticionDirecta({
      action: 'agregar_direccion',
      correo: correoAutenticado,
      direccion: direccion
    });
    
    if (response.status === 'success') {
      console.log(`✅ ${response.data}`);
    } else {
      console.log(`❌ Error: ${response.message}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

/* ---------------------  Función para agregar método de pago  ---------- */
async function agregarMetodoPago() {
  try {
    const metodoPago = await inquirer.prompt([
      { 
        type: 'list',
        name: 'tipo',
        message: '💳 Tipo de método de pago:',
        choices: ['Visa', 'Tarjeta de Crédito', 'PayPal', 'Otro']
      },
      { name: 'detalle', message: '💳 Detalle del método de pago:' },
      { name: 'expiracion', message: '📅 Fecha de expiración (MM/YY):' }
    ]);
    
    console.log('💾 Guardando método de pago...');
    const response = await enviarPeticionDirecta({
      action: 'agregar_pago',
      correo: correoAutenticado,
      metodo_pago: metodoPago
    });
    
    if (response.status === 'success') {
      console.log(`✅ ${response.data}`);
    } else {
      console.log(`❌ Error: ${response.message}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

/* ----------------------  Menú interactivo  ---------------------------- */
async function mostrarMenu() {
  while (true) {
    console.log('\n' + '='.repeat(50));
    console.log(`👤 Usuario: ${correoAutenticado}`);
    console.log('='.repeat(50));
    
    const { opcion } = await inquirer.prompt({
      type: 'list',
      name: 'opcion',
      message: '📋 Selecciona una opción:',
      choices: [
        { name: '👤 Ver perfil completo', value: 'ver' },
        { name: '🏠 Agregar dirección', value: 'direccion' },
        { name: '💳 Agregar método de pago', value: 'pago' },
        { name: '🔄 Cambiar usuario', value: 'cambiar' },
        { name: '❌ Salir', value: 'salir' }
      ]
    });
    
    switch (opcion) {
      case 'ver':
        await verPerfil();
        break;
      case 'direccion':
        await agregarDireccion();
        break;
      case 'pago':
        await agregarMetodoPago();
        break;
      case 'cambiar':
        correoAutenticado = null;
        await autenticarCorreo();
        break;
      case 'salir':
        console.log('👋 ¡Hasta luego!');
        process.exit(0);
        break;
    }
  }
}

/* ----------------------  Inicio de la aplicación  -------------------- */
async function iniciarApp() {
  try {
    console.log('🚀 Iniciando Cliente CLI de Perfil...\n');
    await autenticarCorreo();
    await mostrarMenu();
  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  }
}

iniciarApp();
