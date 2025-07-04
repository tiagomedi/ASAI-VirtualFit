const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Configuración de servicios
const SERVICES_CONFIG = {
    catalogService: {
        name: 'Catálogo',
        path: 'services/service/catalogService.js',
        port: 5002,
        description: 'Gestión de productos y catálogo'
    },
    wishlistService: {
        name: 'Lista de Deseos',
        path: 'services/service/wishlistService.js',
        port: 5003,
        description: 'Gestión de lista de deseos'
    },
    cartService: {
        name: 'Carrito',
        path: 'services/service/cartService.js',
        port: 5001,
        description: 'Gestión del carrito de compras'
    },
    orderService: {
        name: 'Órdenes',
        path: 'services/service/orderService.js',
        port: 5001,
        description: 'Procesamiento de órdenes'
    },
    authService: {
        name: 'Autenticación',
        path: 'services/service/authService.js',
        port: 5001,
        description: 'Registro y autenticación de usuarios'
    },
    perfilservice: {
        name: 'Perfil',
        path: 'services/service/perfilservice.js',
        port: 5001,
        description: 'Gestión de perfiles de usuario'
    },
    reseñaService: {
        name: 'Reseñas',
        path: 'services/service/reseñaService.js',
        port: 5001,
        description: 'Sistema de reseñas y valoraciones'
    },
    pointService: {
        name: 'Puntos',
        path: 'services/service/pointService.js',
        port: 5001,
        description: 'Sistema de puntos y recompensas'
    },
    pagosServices: {
        name: 'Pagos',
        path: 'services/service/pagosServices.js',
        port: 5001,
        description: 'Procesamiento de pagos'
    },
    asaiService: {
        name: 'ASAI Assistant',
        path: 'services/service/asaiService.js',
        port: 5001,
        description: 'Asistente virtual inteligente'
    }
};

// Estado de los servicios
let servicesStatus = {};
let activeProcesses = {};

// Inicializar estado de servicios
Object.keys(SERVICES_CONFIG).forEach(key => {
    servicesStatus[key] = {
        status: 'stopped',
        pid: null,
        startTime: null,
        logs: [],
        errors: []
    };
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Rutas API
app.get('/api/services', (req, res) => {
    const services = Object.keys(SERVICES_CONFIG).map(key => ({
        id: key,
        name: SERVICES_CONFIG[key].name,
        description: SERVICES_CONFIG[key].description,
        port: SERVICES_CONFIG[key].port,
        status: servicesStatus[key].status,
        pid: servicesStatus[key].pid,
        startTime: servicesStatus[key].startTime,
        logsCount: servicesStatus[key].logs.length,
        errorsCount: servicesStatus[key].errors.length
    }));
    res.json(services);
});

app.get('/api/services/:id/logs', (req, res) => {
    const serviceId = req.params.id;
    if (!servicesStatus[serviceId]) {
        return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    res.json({
        logs: servicesStatus[serviceId].logs,
        errors: servicesStatus[serviceId].errors
    });
});

app.post('/api/services/:id/start', (req, res) => {
    const serviceId = req.params.id;
    if (!SERVICES_CONFIG[serviceId]) {
        return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    
    if (servicesStatus[serviceId].status === 'running') {
        return res.status(400).json({ error: 'El servicio ya está ejecutándose' });
    }
    
    startService(serviceId);
    res.json({ message: 'Servicio iniciado' });
});

app.post('/api/services/:id/stop', (req, res) => {
    const serviceId = req.params.id;
    if (!SERVICES_CONFIG[serviceId]) {
        return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    
    if (servicesStatus[serviceId].status === 'stopped') {
        return res.status(400).json({ error: 'El servicio ya está detenido' });
    }
    
    stopService(serviceId);
    res.json({ message: 'Servicio detenido' });
});

app.post('/api/services/start-all', (req, res) => {
    Object.keys(SERVICES_CONFIG).forEach(serviceId => {
        if (servicesStatus[serviceId].status === 'stopped') {
            startService(serviceId);
        }
    });
    res.json({ message: 'Iniciando todos los servicios' });
});

app.post('/api/services/stop-all', (req, res) => {
    Object.keys(SERVICES_CONFIG).forEach(serviceId => {
        if (servicesStatus[serviceId].status === 'running') {
            stopService(serviceId);
        }
    });
    res.json({ message: 'Deteniendo todos los servicios' });
});

// Función para iniciar un servicio
function startService(serviceId) {
    const config = SERVICES_CONFIG[serviceId];
    const fullPath = path.join(__dirname, config.path);
    
    // Verificar si el archivo existe
    if (!fs.existsSync(fullPath)) {
        const errorMsg = `Archivo de servicio no encontrado: ${fullPath}`;
        servicesStatus[serviceId].errors.push({
            timestamp: new Date().toISOString(),
            message: errorMsg
        });
        io.emit('serviceError', { serviceId, message: errorMsg });
        return;
    }
    
    const serviceProcess = spawn('node', [fullPath], { 
        stdio: ['inherit', 'pipe', 'pipe'],
        detached: false
    });
    
    servicesStatus[serviceId].status = 'running';
    servicesStatus[serviceId].pid = serviceProcess.pid;
    servicesStatus[serviceId].startTime = new Date().toISOString();
    activeProcesses[serviceId] = serviceProcess;
    
    // Capturar logs stdout
    serviceProcess.stdout.on('data', (data) => {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: data.toString().trim()
        };
        servicesStatus[serviceId].logs.push(logEntry);
        
        // Mantener solo los últimos 100 logs
        if (servicesStatus[serviceId].logs.length > 100) {
            servicesStatus[serviceId].logs = servicesStatus[serviceId].logs.slice(-100);
        }
        
        io.emit('serviceLog', { serviceId, log: logEntry });
    });
    
    // Capturar logs stderr
    serviceProcess.stderr.on('data', (data) => {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: data.toString().trim()
        };
        servicesStatus[serviceId].errors.push(errorEntry);
        
        // Mantener solo los últimos 50 errores
        if (servicesStatus[serviceId].errors.length > 50) {
            servicesStatus[serviceId].errors = servicesStatus[serviceId].errors.slice(-50);
        }
        
        io.emit('serviceError', { serviceId, error: errorEntry });
    });
    
    // Manejar cierre del proceso
    serviceProcess.on('close', (code) => {
        servicesStatus[serviceId].status = 'stopped';
        servicesStatus[serviceId].pid = null;
        servicesStatus[serviceId].startTime = null;
        delete activeProcesses[serviceId];
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: 'warning',
            message: `Servicio terminado con código: ${code}`
        };
        servicesStatus[serviceId].logs.push(logEntry);
        
        io.emit('serviceStatusChange', { 
            serviceId, 
            status: 'stopped', 
            pid: null,
            log: logEntry
        });
    });
    
    // Manejar errores del proceso
    serviceProcess.on('error', (err) => {
        servicesStatus[serviceId].status = 'error';
        const errorEntry = {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: `Error al iniciar servicio: ${err.message}`
        };
        servicesStatus[serviceId].errors.push(errorEntry);
        
        io.emit('serviceError', { serviceId, error: errorEntry });
    });
    
    io.emit('serviceStatusChange', { 
        serviceId, 
        status: 'running', 
        pid: serviceProcess.pid,
        startTime: servicesStatus[serviceId].startTime
    });
    
    console.log(`[GUI] Servicio ${config.name} iniciado (PID: ${serviceProcess.pid})`);
}

// Función para detener un servicio
function stopService(serviceId) {
    const process = activeProcesses[serviceId];
    if (process) {
        process.kill('SIGTERM');
        
        // Forzar cierre después de 10 segundos
        setTimeout(() => {
            if (activeProcesses[serviceId]) {
                activeProcesses[serviceId].kill('SIGKILL');
            }
        }, 10000);
        
        console.log(`[GUI] Deteniendo servicio ${SERVICES_CONFIG[serviceId].name}`);
    }
}

// Manejo de conexiones WebSocket
io.on('connection', (socket) => {
    console.log('Cliente conectado a la interfaz GUI');
    
    // Enviar estado inicial
    socket.emit('servicesStatus', servicesStatus);
    
    socket.on('disconnect', () => {
        console.log('Cliente desconectado de la interfaz GUI');
    });
    
    // Manejar comandos del cliente
    socket.on('startService', (serviceId) => {
        if (SERVICES_CONFIG[serviceId] && servicesStatus[serviceId].status === 'stopped') {
            startService(serviceId);
        }
    });
    
    socket.on('stopService', (serviceId) => {
        if (SERVICES_CONFIG[serviceId] && servicesStatus[serviceId].status === 'running') {
            stopService(serviceId);
        }
    });
    
    socket.on('startAllServices', () => {
        Object.keys(SERVICES_CONFIG).forEach(serviceId => {
            if (servicesStatus[serviceId].status === 'stopped') {
                startService(serviceId);
            }
        });
    });
    
    socket.on('stopAllServices', () => {
        Object.keys(SERVICES_CONFIG).forEach(serviceId => {
            if (servicesStatus[serviceId].status === 'running') {
                stopService(serviceId);
            }
        });
    });
});

// Manejo de cierre de la aplicación
process.on('SIGINT', () => {
    console.log('\n[GUI] Cerrando interfaz GUI...');
    
    // Detener todos los servicios
    Object.keys(activeProcesses).forEach(serviceId => {
        stopService(serviceId);
    });
    
    setTimeout(() => {
        process.exit(0);
    }, 5000);
});

// Iniciar servidor
server.listen(PORT, () => {
    console.log(`🚀 [GUI] Interfaz GUI de Virtual Fit iniciada en http://localhost:${PORT}`);
    console.log(`📊 [GUI] Panel de control disponible para ${Object.keys(SERVICES_CONFIG).length} servicios`);
}); 