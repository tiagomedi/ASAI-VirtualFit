class VirtualFitGUI {
    constructor() {
        this.socket = null;
        this.services = [];
        this.isLogsPaused = false;
        this.currentServiceModal = null;
        this.systemLogs = [];
        this.maxSystemLogs = 100;
        
        this.initializeSocket();
        this.initializeEventListeners();
        this.showLoading();
    }

    initializeSocket() {
        this.socket = io();

        // Eventos de conexión
        this.socket.on('connect', () => {
            console.log('Conectado al servidor GUI');
            this.updateConnectionStatus('connected');
            this.hideLoading();
            this.loadServices();
        });

        this.socket.on('disconnect', () => {
            console.log('Desconectado del servidor GUI');
            this.updateConnectionStatus('disconnected');
            this.showNotification('Conexión perdida con el servidor', 'error');
        });

        this.socket.on('reconnect', () => {
            console.log('Reconectado al servidor GUI');
            this.updateConnectionStatus('connected');
            this.showNotification('Reconectado al servidor', 'success');
            this.loadServices();
        });

        // Eventos de servicios
        this.socket.on('servicesStatus', (servicesStatus) => {
            this.updateServicesFromStatus(servicesStatus);
        });

        this.socket.on('serviceStatusChange', (data) => {
            this.updateServiceStatus(data.serviceId, data.status, data.pid, data.startTime);
            if (data.log) {
                this.addServiceLog(data.serviceId, data.log);
            }
        });

        this.socket.on('serviceLog', (data) => {
            this.addServiceLog(data.serviceId, data.log);
        });

        this.socket.on('serviceError', (data) => {
            if (data.error) {
                this.addServiceLog(data.serviceId, data.error);
            }
            this.showNotification(`Error en ${data.serviceId}: ${data.message || data.error.message}`, 'error');
        });
    }

    initializeEventListeners() {
        // Botones principales
        document.getElementById('startAllBtn').addEventListener('click', () => this.startAllServices());
        document.getElementById('stopAllBtn').addEventListener('click', () => this.stopAllServices());
        
        // Controles de logs
        document.getElementById('clearLogsBtn').addEventListener('click', () => this.clearSystemLogs());
        document.getElementById('pauseLogsBtn').addEventListener('click', () => this.toggleLogsPause());
        
        // Modal
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('serviceModal').addEventListener('click', (e) => {
            if (e.target.id === 'serviceModal') this.closeModal();
        });
        
        // Teclas de atajo
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeModal();
        });
    }

    updateConnectionStatus(status) {
        const statusDot = document.getElementById('connectionStatus');
        const statusText = document.getElementById('connectionText');
        
        statusDot.className = 'status-dot';
        
        switch(status) {
            case 'connected':
                statusDot.classList.add('connected');
                statusText.textContent = 'Conectado';
                break;
            case 'disconnected':
                statusDot.classList.add('disconnected');
                statusText.textContent = 'Desconectado';
                break;
            case 'connecting':
                statusDot.classList.add('connecting');
                statusText.textContent = 'Conectando...';
                break;
        }
    }

    async loadServices() {
        try {
            const response = await fetch('/api/services');
            const services = await response.json();
            this.services = services;
            this.renderServices();
            this.updateStats();
        } catch (error) {
            console.error('Error cargando servicios:', error);
            this.showNotification('Error cargando servicios', 'error');
        }
    }

    updateServicesFromStatus(servicesStatus) {
        Object.keys(servicesStatus).forEach(serviceId => {
            const statusData = servicesStatus[serviceId];
            const service = this.services.find(s => s.id === serviceId);
            
            if (service) {
                service.status = statusData.status;
                service.pid = statusData.pid;
                service.startTime = statusData.startTime;
                service.logsCount = statusData.logs.length;
                service.errorsCount = statusData.errors.length;
            }
        });
        
        this.renderServices();
        this.updateStats();
    }

    updateServiceStatus(serviceId, status, pid, startTime) {
        const service = this.services.find(s => s.id === serviceId);
        if (service) {
            service.status = status;
            service.pid = pid;
            service.startTime = startTime;
            this.renderServices();
            this.updateStats();
        }
    }

    renderServices() {
        const servicesGrid = document.getElementById('servicesGrid');
        servicesGrid.innerHTML = '';

        this.services.forEach(service => {
            const serviceCard = this.createServiceCard(service);
            servicesGrid.appendChild(serviceCard);
        });
    }

    createServiceCard(service) {
        const card = document.createElement('div');
        card.className = `service-card ${service.status}`;
        card.innerHTML = `
            <div class="service-header">
                <div class="service-info">
                    <h3>${service.name}</h3>
                    <p>${service.description}</p>
                </div>
                <div class="service-status ${service.status}">
                    <i class="fas fa-circle"></i>
                    ${service.status === 'running' ? 'Activo' : 
                      service.status === 'error' ? 'Error' : 'Detenido'}
                </div>
            </div>
            
            <div class="service-details">
                <div class="service-detail">
                    <span>Puerto:</span>
                    <span>${service.port}</span>
                </div>
                <div class="service-detail">
                    <span>PID:</span>
                    <span>${service.pid || 'N/A'}</span>
                </div>
                <div class="service-detail">
                    <span>Tiempo activo:</span>
                    <span>${service.startTime ? this.formatUptime(service.startTime) : 'N/A'}</span>
                </div>
                <div class="service-detail">
                    <span>Logs:</span>
                    <span>${service.logsCount || 0}</span>
                </div>
                <div class="service-detail">
                    <span>Errores:</span>
                    <span>${service.errorsCount || 0}</span>
                </div>
            </div>
            
            <div class="service-actions">
                ${service.status === 'running' ? 
                    `<button class="btn btn-secondary" onclick="virtualFitGUI.stopService('${service.id}')">
                        <i class="fas fa-stop"></i>
                        Detener
                    </button>` :
                    `<button class="btn btn-primary" onclick="virtualFitGUI.startService('${service.id}')">
                        <i class="fas fa-play"></i>
                        Iniciar
                    </button>`
                }
                <button class="btn btn-info" onclick="virtualFitGUI.showServiceDetails('${service.id}')">
                    <i class="fas fa-info-circle"></i>
                    Detalles
                </button>
            </div>
        `;
        
        return card;
    }

    updateStats() {
        const running = this.services.filter(s => s.status === 'running').length;
        const stopped = this.services.filter(s => s.status === 'stopped').length;
        const totalErrors = this.services.reduce((sum, s) => sum + (s.errorsCount || 0), 0);
        
        document.getElementById('runningCount').textContent = running;
        document.getElementById('stoppedCount').textContent = stopped;
        document.getElementById('errorCount').textContent = totalErrors;
        document.getElementById('totalServices').textContent = this.services.length;
    }

    formatUptime(startTime) {
        if (!startTime) return 'N/A';
        
        const now = new Date();
        const start = new Date(startTime);
        const diff = now - start;
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    }

    startService(serviceId) {
        this.socket.emit('startService', serviceId);
        this.showNotification(`Iniciando servicio ${serviceId}...`, 'info');
    }

    stopService(serviceId) {
        this.socket.emit('stopService', serviceId);
        this.showNotification(`Deteniendo servicio ${serviceId}...`, 'warning');
    }

    startAllServices() {
        this.socket.emit('startAllServices');
        this.showNotification('Iniciando todos los servicios...', 'info');
    }

    stopAllServices() {
        this.socket.emit('stopAllServices');
        this.showNotification('Deteniendo todos los servicios...', 'warning');
    }

    async showServiceDetails(serviceId) {
        try {
            const service = this.services.find(s => s.id === serviceId);
            if (!service) return;

            const response = await fetch(`/api/services/${serviceId}/logs`);
            const logsData = await response.json();

            this.currentServiceModal = serviceId;
            this.renderServiceModal(service, logsData);
        } catch (error) {
            console.error('Error cargando detalles del servicio:', error);
            this.showNotification('Error cargando detalles del servicio', 'error');
        }
    }

    renderServiceModal(service, logsData) {
        const modal = document.getElementById('serviceModal');
        const modalTitle = document.getElementById('modalTitle');
        const serviceDetails = document.getElementById('serviceDetails');
        const serviceLogs = document.getElementById('serviceLogs');

        modalTitle.textContent = `${service.name} - Detalles`;

        serviceDetails.innerHTML = `
            <div class="service-detail">
                <span>Estado:</span>
                <span class="service-status ${service.status}">
                    <i class="fas fa-circle"></i>
                    ${service.status === 'running' ? 'Activo' : 
                      service.status === 'error' ? 'Error' : 'Detenido'}
                </span>
            </div>
            <div class="service-detail">
                <span>Puerto:</span>
                <span>${service.port}</span>
            </div>
            <div class="service-detail">
                <span>PID:</span>
                <span>${service.pid || 'N/A'}</span>
            </div>
            <div class="service-detail">
                <span>Tiempo activo:</span>
                <span>${service.startTime ? this.formatUptime(service.startTime) : 'N/A'}</span>
            </div>
            <div class="service-detail">
                <span>Descripción:</span>
                <span>${service.description}</span>
            </div>
            <div class="service-detail">
                <span>Logs totales:</span>
                <span>${logsData.logs.length}</span>
            </div>
            <div class="service-detail">
                <span>Errores totales:</span>
                <span>${logsData.errors.length}</span>
            </div>
        `;

        serviceLogs.innerHTML = '';
        const allLogs = [...logsData.logs, ...logsData.errors]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 50);

        allLogs.forEach(log => {
            const logElement = document.createElement('div');
            logElement.className = `log-message ${log.type}`;
            logElement.innerHTML = `
                <span class="log-time">${this.formatTime(log.timestamp)}</span>
                <span class="log-service">${service.name.toUpperCase()}</span>
                <span class="log-text">${log.message}</span>
            `;
            serviceLogs.appendChild(logElement);
        });

        modal.classList.add('active');
    }

    closeModal() {
        const modal = document.getElementById('serviceModal');
        modal.classList.remove('active');
        this.currentServiceModal = null;
    }

    addServiceLog(serviceId, log) {
        // Agregar al log del sistema
        this.addSystemLog(serviceId, log);
        
        // Si el modal está abierto para este servicio, actualizar los logs
        if (this.currentServiceModal === serviceId) {
            this.showServiceDetails(serviceId);
        }
    }

    addSystemLog(serviceId, log) {
        if (this.isLogsPaused) return;

        const service = this.services.find(s => s.id === serviceId);
        const serviceName = service ? service.name : serviceId;

        const systemLog = {
            timestamp: log.timestamp,
            service: serviceName,
            message: log.message,
            type: log.type || 'info'
        };

        this.systemLogs.unshift(systemLog);
        
        // Mantener solo los últimos logs
        if (this.systemLogs.length > this.maxSystemLogs) {
            this.systemLogs = this.systemLogs.slice(0, this.maxSystemLogs);
        }

        this.renderSystemLogs();
    }

    renderSystemLogs() {
        const logsContainer = document.getElementById('logsContainer');
        logsContainer.innerHTML = '';

        this.systemLogs.forEach(log => {
            const logElement = document.createElement('div');
            logElement.className = `log-message ${log.type}`;
            logElement.innerHTML = `
                <span class="log-time">${this.formatTime(log.timestamp)}</span>
                <span class="log-service">${log.service.toUpperCase()}</span>
                <span class="log-text">${log.message}</span>
            `;
            logsContainer.appendChild(logElement);
        });

        // Auto-scroll si no está pausado
        if (!this.isLogsPaused) {
            logsContainer.scrollTop = 0;
        }
    }

    clearSystemLogs() {
        this.systemLogs = [];
        this.renderSystemLogs();
        this.showNotification('Logs del sistema limpiados', 'info');
    }

    toggleLogsPause() {
        this.isLogsPaused = !this.isLogsPaused;
        const pauseBtn = document.getElementById('pauseLogsBtn');
        
        if (this.isLogsPaused) {
            pauseBtn.innerHTML = '<i class="fas fa-play"></i> Reanudar';
            pauseBtn.classList.add('btn-primary');
            pauseBtn.classList.remove('btn-secondary');
        } else {
            pauseBtn.innerHTML = '<i class="fas fa-pause"></i> Pausar';
            pauseBtn.classList.add('btn-secondary');
            pauseBtn.classList.remove('btn-primary');
        }
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 4000);
    }

    showLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        loadingOverlay.style.display = 'flex';
    }

    hideLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        loadingOverlay.style.display = 'none';
    }
}

// Inicializar la aplicación cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    window.virtualFitGUI = new VirtualFitGUI();
});

// Actualizar el tiempo de actividad cada segundo
setInterval(() => {
    if (window.virtualFitGUI) {
        window.virtualFitGUI.renderServices();
    }
}, 1000); 