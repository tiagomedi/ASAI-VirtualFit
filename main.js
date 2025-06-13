// Intefaz de Usuario (CLI)
// Login -> 
//          - Usuario
//          - Catalogo
//          - Carrito
//          - Lista de Deseos
//          - Asistente ASAI
//          - Gestión Productos (modo admin)

const { spawn } = require('child_process');
const path = require('path');

/**
 * @param {string} scriptName - Un nombre descriptivo para los logs.
 * @param {string} scriptPath - La ruta relativa al script a ejecutar.
 */
function executeScript(scriptName, scriptPath) {
    const fullPath = path.join(__dirname, scriptPath);
    
    // Inicia el script en un nuevo proceso de Node.
    // 'stdio: inherit' asegura que veamos los logs de ese script en esta terminal.
    const child = spawn('node', [fullPath], { stdio: 'inherit' });

    child.on('close', (code) => {
        console.log(`[MainOrchestrator] El script '${scriptName}' ha finalizado con código ${code}.`);
    });

    child.on('error', (err) => {
        console.error(`[MainOrchestrator] ❌ Error al intentar iniciar '${scriptName}':`, err);
    });

    return child;
}

function startApplication() {
    console.log('--- 🚀 [MainOrchestrator] Iniciando la aplicación ASAI VirtualFit ---');
    
    // 1. Iniciar todos los microservicios a través de app.js
    console.log('\n[MainOrchestrator] Paso 1: Lanzando los microservicios...');
    executeScript('Services Backend (app.js)', 'app.js');

    // 2. Esperar a que los servicios se inicialicen
    const startupDelay = 10000; // 10 segundos, ajústalo si tus servicios tardan más.
    console.log(`\n[MainOrchestrator] Paso 2: Esperando ${startupDelay / 1000} segundos para que los servicios se estabilicen...`);

    setTimeout(() => {
        // 3. Iniciar la interfaz de línea de comandos para el usuario
        console.log('\n[MainOrchestrator] Paso 3: Lanzando el cliente CLI (usuarioCLI.js)...');
        console.log('-------------------------------------------------------------------\n');
        executeScript('User CLI', 'client/cli/usuarioCLI2.js'); // Cambiar a usuarioCLI.js para el cliente original.
    }, startupDelay);
}

// Iniciar todo el proceso.
startApplication();