// Inicializar todos los servicios (service)
const { spawn } = require('child_process');
const path = require('path');

const services = [
    'services/service/catalogService.js',
    'services/service/cartService.js',
    'services/service/orderService.js',
    'services/service/wishlistService.js',
    'services/service/authService.js',
    'services/service/orderService.js',
    //'services/service/productService.js',
    'services/service/reseñaService.js'
    //'services/service/userService.js'

];

console.log('--- 🚀 Iniciando todos los servicios... ---');

services.forEach(servicePath => {
    const fullPath = path.join(__dirname, servicePath);
    const serviceProcess = spawn('node', [fullPath], { stdio: 'inherit' });

    console.log(`[App] Iniciando servicio: ${servicePath} (PID: ${serviceProcess.pid})`);

    serviceProcess.on('close', (code) => {
        console.log(`[App] ‼️ Servicio ${servicePath} se ha detenido con código ${code}.`);
    });

    serviceProcess.on('error', (err) => {
        console.error(`[App] ❌ Error al iniciar ${servicePath}:`, err);
    });
});

console.log('\n--- ✅ Todos los servicios han sido lanzados. Revisa los logs de cada uno. ---');