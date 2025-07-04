const { spawn } = require('child_process');
const path = require('path');

/**
 * Función helper para ejecutar un script de Node.js en un nuevo proceso.
 * @param {string} scriptName - Un nombre descriptivo para los logs.
 * @param {string} scriptPath - La ruta relativa al script a ejecutar.
 * @param {boolean} inherit - Si debe heredar los stdio del proceso principal.
 */
function executeScript(scriptName, scriptPath, inherit = true) {
    const fullPath = path.join(__dirname, scriptPath);
    
    // Configurar stdio según si queremos heredar o no
    const stdio = inherit ? 'inherit' : ['inherit', 'pipe', 'pipe'];
    
    const child = spawn('node', [fullPath], { stdio });

    child.on('close', (code) => {
        console.log(`[ClientLauncher] El script '${scriptName}' ha finalizado con código ${code}.`);
    });

    child.on('error', (err) => {
        console.error(`[ClientLauncher] ❌ Error al intentar iniciar '${scriptName}':`, err);
    });

    return child;
}

/**
 * Función para mostrar opciones de inicio del cliente
 */
function showClientStartupOptions() {
    console.log('\n🛍️ ===== VIRTUAL FIT - CLIENTE GUI ===== 🛍️');
    console.log('');
    console.log('🎯 Interfaz GUI para Cliente VirtualFit');
    console.log('');
    console.log('✨ Características:');
    console.log('   • 🏪 Catálogo de productos con paginación');
    console.log('   • 🔍 Búsqueda y filtros avanzados');
    console.log('   • ❤️ Lista de deseos personalizada');
    console.log('   • 🛒 Carrito de compras interactivo');
    console.log('   • 💳 Proceso de pago completo');
    console.log('   • 📋 Historial de órdenes');
    console.log('   • 🤖 Chat con ASAI Assistant');
    console.log('   • 📱 Interfaz responsive');
    console.log('');
    console.log('📡 Requisitos:');
    console.log('   • Bus de mensajería activo (app.js)');
    console.log('   • Servicios backend ejecutándose');
    console.log('   • Base de datos MongoDB conectada');
    console.log('');
    console.log('=====================================================');
    console.log('');
}

/**
 * Función para verificar dependencias
 */
function checkDependencies() {
    console.log('🔍 [ClientLauncher] Verificando dependencias...');
    
    const fs = require('fs');
    const requiredFiles = [
        'clientGUI.js',
        'clientPublic/index.html',
        'clientPublic/style.css',
        'clientPublic/script.js'
    ];
    
    let allFilesExist = true;
    
    requiredFiles.forEach(file => {
        if (!fs.existsSync(path.join(__dirname, file))) {
            console.error(`❌ [ClientLauncher] Archivo requerido no encontrado: ${file}`);
            allFilesExist = false;
        } else {
            console.log(`✅ [ClientLauncher] ${file} encontrado`);
        }
    });
    
    if (!allFilesExist) {
        console.error('\n❌ [ClientLauncher] Faltan archivos necesarios. Por favor verifique la instalación.');
        process.exit(1);
    }
    
    console.log('✅ [ClientLauncher] Todas las dependencias están disponibles');
}

/**
 * Función principal para iniciar el cliente GUI
 */
function startClientGUI() {
    console.log('🛍️ [ClientLauncher] Iniciando VIRTUAL FIT Cliente GUI...');
    console.log('');
    
    // Verificar dependencias
    checkDependencies();
    
    console.log('🚀 [ClientLauncher] Lanzando servidor del cliente...');
    const clientProcess = executeScript('Cliente GUI Server', 'clientGUI.js', false);
    
    // Mostrar logs del cliente
    clientProcess.stdout.on('data', (data) => {
        console.log(`[CLIENT] ${data.toString().trim()}`);
    });
    
    clientProcess.stderr.on('data', (data) => {
        console.log(`[CLIENT-ERROR] ${data.toString().trim()}`);
    });
    
    // Mostrar información de acceso después de un delay
    setTimeout(() => {
        console.log('');
        console.log('✅ [ClientLauncher] ¡Cliente GUI iniciado exitosamente!');
        console.log('');
        console.log('🌐 Accede a la interfaz del cliente en: http://localhost:3001');
        console.log('');
        console.log('📋 Funcionalidades disponibles:');
        console.log('   • Inicio de sesión y registro');
        console.log('   • Navegación por el catálogo');
        console.log('   • Gestión de lista de deseos');
        console.log('   • Gestión del carrito de compras');
        console.log('   • Proceso de pago y checkout');
        console.log('   • Historial de órdenes');
        console.log('   • Chat inteligente con ASAI');
        console.log('');
        console.log('💡 Tip: Asegúrate de que el bus y servicios estén ejecutándose.');
        console.log('💡 Para servicios: node mainGUI.js services');
        console.log('');
    }, 3000);
    
    return clientProcess;
}

/**
 * Función para mostrar ayuda
 */
function showHelp() {
    console.log('\n🛍️ VIRTUAL FIT - Cliente GUI');
    console.log('');
    console.log('Uso: node clientLauncher.js [opciones]');
    console.log('');
    console.log('Opciones:');
    console.log('  --help, -h     Mostrar esta ayuda');
    console.log('  --check        Verificar dependencias solamente');
    console.log('');
    console.log('Funcionalidades del Cliente:');
    console.log('  • Catálogo de productos con paginación (4 por página)');
    console.log('  • Búsqueda y filtros avanzados');
    console.log('  • Lista de deseos con paginación (4 por página)');
    console.log('  • Carrito de compras interactivo');
    console.log('  • Proceso de pago con direcciones y métodos de pago');
    console.log('  • Sistema de puntos ASAIpoints (descuentos)');
    console.log('  • Historial de órdenes');
    console.log('  • Chat inteligente con ASAI Assistant');
    console.log('  • Interfaz responsive y moderna');
    console.log('');
    console.log('Requisitos previos:');
    console.log('  1. Bus de mensajería ejecutándose (node app.js)');
    console.log('  2. Servicios backend activos (node mainGUI.js services)');
    console.log('  3. Base de datos MongoDB conectada');
    console.log('');
    console.log('Puertos utilizados:');
    console.log('  • Cliente GUI: http://localhost:3001');
    console.log('  • Bus de mensajería: localhost:5001');
    console.log('');
    console.log('Ejemplos:');
    console.log('  node clientLauncher.js           # Iniciar cliente GUI');
    console.log('  node clientLauncher.js --check   # Verificar dependencias');
    console.log('  node clientLauncher.js --help    # Mostrar ayuda');
    console.log('');
}

/**
 * Función principal de arranque
 */
function main() {
    const args = process.argv.slice(2);
    
    // Verificar argumentos
    if (args.includes('--help') || args.includes('-h')) {
        showHelp();
        return;
    }
    
    if (args.includes('--check')) {
        console.log('🔍 [ClientLauncher] Modo verificación de dependencias');
        checkDependencies();
        console.log('✅ [ClientLauncher] Verificación completada');
        return;
    }
    
    // Mostrar información de inicio
    showClientStartupOptions();
    
    // Iniciar el cliente
    const clientProcess = startClientGUI();
    
    // Manejo de señales para cierre limpio
    process.on('SIGINT', () => {
        console.log('\n🛑 [ClientLauncher] Cerrando cliente GUI...');
        
        if (clientProcess) {
            clientProcess.kill('SIGTERM');
        }
        
        setTimeout(() => {
            console.log('👋 [ClientLauncher] ¡Cliente cerrado correctamente!');
            process.exit(0);
        }, 2000);
    });
    
    process.on('SIGTERM', () => {
        console.log('\n🛑 [ClientLauncher] Terminando cliente GUI...');
        if (clientProcess) {
            clientProcess.kill('SIGTERM');
        }
        process.exit(0);
    });
}

// Manejo de errores no capturados
process.on('uncaughtException', (err) => {
    console.error('❌ [ClientLauncher] Error no capturado:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [ClientLauncher] Rechazo no manejado en:', promise, 'razón:', reason);
    process.exit(1);
});

// Mostrar información de startup si no hay argumentos de ayuda
if (!process.argv.includes('--help') && !process.argv.includes('-h')) {
    console.log('💡 [ClientLauncher] Usa --help para ver todas las opciones disponibles');
}

// Ejecutar la función principal
main(); 