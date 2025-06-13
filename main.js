const { spawn } = require('child_process');
const path = require('path');

/**
 * @param {string} scriptName - Un nombre descriptivo para los logs.
 * @param {string} scriptPath - La ruta relativa al script a ejecutar.
 */
function executeScript(scriptName, scriptPath) {
    const fullPath = path.join(__dirname, scriptPath);
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

    console.log(`\n[MainOrchestrator] Paso 2: Esperando ${startupDelay / 1000} segundos para que los servicios se estabilicen...`);

    setTimeout(() => {
        console.log('\n[MainOrchestrator] Paso 3: Lanzando el cliente CLI (usuarioCLI.js)...');
        console.log('-------------------------------------------------------------------\n');
        executeScript('User CLI', 'client/cli/usuarioCLI.js');
    }, startupDelay);
}


startApplication();