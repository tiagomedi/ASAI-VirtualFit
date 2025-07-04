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
        console.log(`[MainGUI] El script '${scriptName}' ha finalizado con código ${code}.`);
    });

    child.on('error', (err) => {
        console.error(`[MainGUI] ❌ Error al intentar iniciar '${scriptName}':`, err);
    });

    return child;
}

/**
 * Función para mostrar opciones de inicio
 */
function showStartupOptions() {
    console.log('\n🚀 ===== VIRTUAL FIT - SISTEMA DE GESTIÓN ===== 🚀');
    console.log('');
    console.log('Opciones de inicio disponibles:');
    console.log('');
    console.log('1. 🎛️  GUI Mode (Recomendado)');
    console.log('   - Interfaz web profesional en http://localhost:3000');
    console.log('   - Control visual de todos los servicios');
    console.log('   - Monitoreo en tiempo real');
    console.log('   - Logs organizados por servicio');
    console.log('');
    console.log('2. 🖥️  CLI Mode (Clásico)');
    console.log('   - Interfaz de línea de comandos tradicional');
    console.log('   - Control desde terminal');
    console.log('   - Ideal para servidores sin interfaz gráfica');
    console.log('');
    console.log('3. 🔧 Services Only');
    console.log('   - Solo servicios backend');
    console.log('   - Sin interfaz de usuario');
    console.log('   - Para integración con otros sistemas');
    console.log('');
    console.log('=====================================================');
    console.log('');
}

/**
 * Función para iniciar el modo GUI
 */
function startGUIMode() {
    console.log('🎛️ [MainGUI] Iniciando VIRTUAL FIT en modo GUI...');
    console.log('');
    
    // 1. Iniciar la interfaz GUI
    console.log('📊 [MainGUI] Paso 1: Lanzando interfaz GUI...');
    const guiProcess = executeScript('GUI Interface', 'guiApp.js', false);
    
    // Mostrar logs de la GUI
    guiProcess.stdout.on('data', (data) => {
        console.log(`[GUI] ${data.toString().trim()}`);
    });
    
    guiProcess.stderr.on('data', (data) => {
        console.log(`[GUI-ERROR] ${data.toString().trim()}`);
    });
    
    // 2. Esperar a que la GUI se inicialice
    setTimeout(() => {
        console.log('');
        console.log('✅ [MainGUI] ¡Sistema iniciado exitosamente!');
        console.log('');
        console.log('🌐 Accede a la interfaz GUI en: http://localhost:3000');
        console.log('');
        console.log('📋 Funcionalidades disponibles:');
        console.log('   • Control individual de servicios');
        console.log('   • Monitoreo en tiempo real');
        console.log('   • Logs organizados por servicio');
        console.log('   • Estadísticas del sistema');
        console.log('   • Interfaz responsive');
        console.log('');
        console.log('💡 Tip: Mantén esta terminal abierta para ver los logs del sistema.');
        console.log('');
    }, 3000);
}

/**
 * Función para iniciar el modo CLI tradicional
 */
function startCLIMode() {
    console.log('🖥️ [MainGUI] Iniciando VIRTUAL FIT en modo CLI...');
    console.log('');
    
    // 1. Iniciar todos los microservicios
    console.log('⚡ [MainGUI] Paso 1: Lanzando los microservicios...');
    executeScript('Services Backend (app.js)', 'app.js');

    // 2. Esperar a que los servicios se inicialicen
    const startupDelay = 10000;
    console.log(`⏱️ [MainGUI] Paso 2: Esperando ${startupDelay / 1000} segundos para que los servicios se estabilicen...`);

    setTimeout(() => {
        // 3. Iniciar la interfaz CLI
        console.log('');
        console.log('💻 [MainGUI] Paso 3: Lanzando el cliente CLI...');
        console.log('=====================================================');
        console.log('');
        executeScript('User CLI', 'client/cli/usuarioCLI2.js');
    }, startupDelay);
}

/**
 * Función para iniciar solo los servicios
 */
function startServicesOnly() {
    console.log('🔧 [MainGUI] Iniciando solo los servicios backend...');
    console.log('');
    
    executeScript('Services Backend (app.js)', 'app.js');
    
    setTimeout(() => {
        console.log('');
        console.log('✅ [MainGUI] Servicios backend iniciados.');
        console.log('🌐 Los servicios están disponibles en sus puertos correspondientes.');
        console.log('📡 Puedes conectarte a través de clientes externos.');
        console.log('');
    }, 3000);
}

/**
 * Función principal que determina el modo de inicio
 */
function startApplication() {
    // Verificar argumentos de línea de comandos
    const args = process.argv.slice(2);
    const mode = args[0] || 'gui'; // Por defecto, modo GUI
    
    showStartupOptions();
    
    switch(mode.toLowerCase()) {
        case 'gui':
        case 'web':
        case 'interface':
            startGUIMode();
            break;
            
        case 'cli':
        case 'terminal':
        case 'classic':
            startCLIMode();
            break;
            
        case 'services':
        case 'backend':
        case 'server':
            startServicesOnly();
            break;
            
        default:
            console.log('❓ Modo no reconocido. Iniciando modo GUI por defecto...');
            console.log('');
            console.log('💡 Modos disponibles:');
            console.log('   node mainGUI.js gui      # Modo GUI (por defecto)');
            console.log('   node mainGUI.js cli      # Modo CLI');
            console.log('   node mainGUI.js services # Solo servicios');
            console.log('');
            setTimeout(() => startGUIMode(), 2000);
    }
}

// Manejo de señales para cierre limpio
process.on('SIGINT', () => {
    console.log('\n🛑 [MainGUI] Cerrando aplicación...');
    console.log('👋 [MainGUI] ¡Hasta luego!');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 [MainGUI] Terminando aplicación...');
    process.exit(0);
});

// Manejo de errores no capturados
process.on('uncaughtException', (err) => {
    console.error('❌ [MainGUI] Error no capturado:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [MainGUI] Rechazo no manejado en:', promise, 'razón:', reason);
    process.exit(1);
});

// Mostrar información de ayuda si se solicita
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('\n🚀 VIRTUAL FIT - Sistema de Gestión');
    console.log('');
    console.log('Uso: node mainGUI.js [modo]');
    console.log('');
    console.log('Modos disponibles:');
    console.log('  gui      Interfaz web profesional (por defecto)');
    console.log('  cli      Interfaz de línea de comandos');
    console.log('  services Solo servicios backend');
    console.log('');
    console.log('Opciones:');
    console.log('  --help, -h  Mostrar esta ayuda');
    console.log('');
    console.log('Ejemplos:');
    console.log('  node mainGUI.js                 # Modo GUI');
    console.log('  node mainGUI.js gui              # Modo GUI');
    console.log('  node mainGUI.js cli              # Modo CLI');
    console.log('  node mainGUI.js services         # Solo servicios');
    console.log('');
    process.exit(0);
}

// Iniciar la aplicación
startApplication(); 