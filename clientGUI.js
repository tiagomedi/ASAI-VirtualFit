const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const net = require('net');
const { v4: uuidv4 } = require('uuid');
const { connectDB } = require('./database/db.js');
const User = require('./database/models/user.model.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.CLIENT_PORT || 3001;
const BUS_HOST = 'localhost';
const BUS_PORT = 5001;

// Gestión de conexiones y usuarios
let connectedUsers = new Map();
let activeConnections = new Map();

// Middleware
app.use(express.static(path.join(__dirname, 'clientPublic')));
app.use(express.json());

// Clase para manejar conexiones de cliente al bus
class ClientBusConnection {
    constructor(clientId, socket) {
        this.clientId = clientId;
        this.socket = socket;
        this.busSocket = null;
        this.buffer = '';
        this.pendingResponses = new Map();
        this.user = null;
        this.connected = false;
        this.isAuthenticated = false;
    }

    async connectToBus() {
        return new Promise((resolve, reject) => {
            this.busSocket = new net.Socket();
            
            this.busSocket.connect(BUS_PORT, BUS_HOST, () => {
                console.log(`[ClientGUI] Cliente ${this.clientId} conectado al bus`);
                this.connected = true;
                
                // Registrar cliente en el bus
                this.sendMessage('sinit', this.clientId);
                
                resolve();
            });

            this.busSocket.on('data', (chunk) => {
                this.buffer += chunk.toString();
                this.processBuffer();
            });

            this.busSocket.on('close', () => {
                console.log(`[ClientGUI] Conexión al bus cerrada para cliente ${this.clientId}`);
                this.connected = false;
                this.socket.emit('busDisconnected');
            });

            this.busSocket.on('error', (error) => {
                console.error(`[ClientGUI] Error en conexión al bus:`, error);
                reject(error);
            });
        });
    }

    processBuffer() {
        while (this.buffer.length >= 5) {
            const lengthStr = this.buffer.substring(0, 5);
            const length = parseInt(lengthStr, 10);
            
            if (isNaN(length)) {
                console.error(`[ClientGUI] Header inválido: ${lengthStr}`);
                this.buffer = '';
                break;
            }
            
            if (this.buffer.length < 5 + length) {
                break; // Esperar más datos
            }
            
            const fullMessage = this.buffer.substring(0, 5 + length);
            this.buffer = this.buffer.substring(5 + length);
            
            this.handleMessage(fullMessage);
        }
    }

    handleMessage(fullMessage) {
        if (fullMessage.length < 17) {
            console.error('[ClientGUI] Mensaje muy corto, ignorando');
            return;
        }
        
        const messageContent = fullMessage.substring(5);
        const destination = messageContent.substring(0, 5).trim();
        const serviceName = messageContent.substring(5, 10).trim();
        const status = messageContent.substring(10, 12).trim();
        const responseJson = messageContent.substring(12);
        
        try {
            const response = JSON.parse(responseJson);
            
            if (response.correlationId && this.pendingResponses.has(response.correlationId)) {
                const { resolve, reject } = this.pendingResponses.get(response.correlationId);
                this.pendingResponses.delete(response.correlationId);
                
                if (status === 'OK') {
                    resolve(response);
                } else {
                    reject(new Error(`Error del servicio ${serviceName}: ${response.message || 'Error desconocido'}`));
                }
            }
        } catch (e) {
            console.error(`[ClientGUI] Error al procesar mensaje JSON:`, e);
        }
    }

    sendMessage(service, message) {
        if (!this.connected || !this.busSocket) {
            throw new Error('No hay conexión activa al bus');
        }
        
        const body = service + message;
        const header = String(Buffer.byteLength(body, 'utf8')).padStart(5, '0');
        this.busSocket.write(header + body);
    }

    async sendRequest(service, requestData, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const correlationId = uuidv4();
            requestData.correlationId = correlationId;
            requestData.clientId = this.clientId;
            
            this.pendingResponses.set(correlationId, { resolve, reject });
            
            this.sendMessage(service, JSON.stringify(requestData));
            
            setTimeout(() => {
                if (this.pendingResponses.has(correlationId)) {
                    this.pendingResponses.delete(correlationId);
                    reject(new Error(`Timeout esperando respuesta del servicio: ${service}`));
                }
            }, timeoutMs);
        });
    }

    async authenticateUser(credentials, isLogin = true) {
        try {
            const serviceToCall = isLogin ? 'logns' : 'auths';
            const response = await this.sendRequest(serviceToCall, credentials);
            
            if (response.data) {
                this.user = response.data;
                this.isAuthenticated = true;
                
                // Cargar información completa del usuario desde la base de datos
                if (this.user._id) {
                    const fullUser = await User.findById(this.user._id);
                    if (fullUser) {
                        this.user = fullUser.toObject();
                    }
                }
                
                return this.user;
            }
            
            throw new Error('Credenciales inválidas');
        } catch (error) {
            throw error;
        }
    }

    async getCatalog(page = 1, limit = 4) {
        try {
            const response = await this.sendRequest('catal', { 
                action: 'list_all', 
                page, 
                limit 
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    async searchProducts(term) {
        try {
            const response = await this.sendRequest('catal', { 
                action: 'search', 
                term 
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    async filterProducts(criteria) {
        try {
            const response = await this.sendRequest('catal', { 
                action: 'filter', 
                criteria 
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    async getWishlist(page = 1, limit = 4) {
        try {
            const response = await this.sendRequest('deseo', { 
                action: 'get', 
                user_id: this.user._id,
                page,
                limit
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    async addToWishlist(productId) {
        try {
            const response = await this.sendRequest('deseo', { 
                action: 'add', 
                user_id: this.user._id,
                producto_id: productId
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    async removeFromWishlist(productId) {
        try {
            const response = await this.sendRequest('deseo', { 
                action: 'remove', 
                user_id: this.user._id,
                producto_id: productId
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    async getCart() {
        try {
            const response = await this.sendRequest('carro', { 
                action: 'view', 
                user_id: this.user._id
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    async addToCart(productId, quantity = 1) {
        try {
            const response = await this.sendRequest('carro', { 
                action: 'add', 
                user_id: this.user._id,
                producto_id: productId,
                cantidad: quantity
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    async updateCartItem(productVariationId, newQuantity) {
        try {
            const response = await this.sendRequest('carro', { 
                action: 'update', 
                user_id: this.user._id,
                producto_variacion_id: productVariationId,
                nueva_cantidad: newQuantity
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    async removeFromCart(productVariationId) {
        try {
            const response = await this.sendRequest('carro', { 
                action: 'remove', 
                user_id: this.user._id,
                producto_variacion_id: productVariationId
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    async processPayment(paymentData) {
        try {
            const response = await this.sendRequest('pagos', { 
                action: 'procesar_pago', 
                payload: {
                    user_id: this.user._id,
                    ...paymentData
                }
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    async getOrders() {
        try {
            const response = await this.sendRequest('order', { 
                action: 'find_orders', 
                payload: { 
                    email: this.user.correo 
                }
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    async chatWithASAI(query) {
        try {
            const response = await this.sendRequest('asais', { 
                userId: this.user._id,
                query: query
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    disconnect() {
        if (this.busSocket) {
            this.busSocket.end();
        }
    }
}

// Conexiones WebSocket
io.on('connection', (socket) => {
    console.log(`[ClientGUI] Nueva conexión WebSocket: ${socket.id}`);
    
    const clientId = uuidv4().substring(0, 5);
    const clientConnection = new ClientBusConnection(clientId, socket);
    
    connectedUsers.set(socket.id, clientConnection);
    
    socket.on('connectToBus', async () => {
        try {
            await clientConnection.connectToBus();
            socket.emit('busConnected', { clientId });
        } catch (error) {
            socket.emit('busConnectionError', { error: error.message });
        }
    });

    socket.on('authenticate', async (data) => {
        try {
            const { credentials, isLogin } = data;
            const user = await clientConnection.authenticateUser(credentials, isLogin);
            socket.emit('authSuccess', { user });
        } catch (error) {
            socket.emit('authError', { error: error.message });
        }
    });

    socket.on('getCatalog', async (data) => {
        try {
            const { page = 1, limit = 4 } = data;
            const result = await clientConnection.getCatalog(page, limit);
            socket.emit('catalogData', result);
        } catch (error) {
            socket.emit('catalogError', { error: error.message });
        }
    });

    socket.on('searchProducts', async (data) => {
        try {
            const { term } = data;
            const result = await clientConnection.searchProducts(term);
            socket.emit('searchResults', result);
        } catch (error) {
            socket.emit('searchError', { error: error.message });
        }
    });

    socket.on('filterProducts', async (data) => {
        try {
            const { criteria } = data;
            const result = await clientConnection.filterProducts(criteria);
            socket.emit('filterResults', result);
        } catch (error) {
            socket.emit('filterError', { error: error.message });
        }
    });

    socket.on('getWishlist', async (data) => {
        try {
            const { page = 1, limit = 4 } = data;
            const result = await clientConnection.getWishlist(page, limit);
            socket.emit('wishlistData', result);
        } catch (error) {
            socket.emit('wishlistError', { error: error.message });
        }
    });

    socket.on('addToWishlist', async (data) => {
        try {
            const { productId } = data;
            const result = await clientConnection.addToWishlist(productId);
            socket.emit('wishlistUpdated', result);
        } catch (error) {
            socket.emit('wishlistError', { error: error.message });
        }
    });

    socket.on('removeFromWishlist', async (data) => {
        try {
            const { productId } = data;
            const result = await clientConnection.removeFromWishlist(productId);
            socket.emit('wishlistUpdated', result);
        } catch (error) {
            socket.emit('wishlistError', { error: error.message });
        }
    });

    socket.on('getCart', async () => {
        try {
            const result = await clientConnection.getCart();
            socket.emit('cartData', result);
        } catch (error) {
            socket.emit('cartError', { error: error.message });
        }
    });

    socket.on('addToCart', async (data) => {
        try {
            const { productId, quantity } = data;
            const result = await clientConnection.addToCart(productId, quantity);
            socket.emit('cartUpdated', result);
        } catch (error) {
            socket.emit('cartError', { error: error.message });
        }
    });

    socket.on('updateCartItem', async (data) => {
        try {
            const { productVariationId, newQuantity } = data;
            const result = await clientConnection.updateCartItem(productVariationId, newQuantity);
            socket.emit('cartUpdated', result);
        } catch (error) {
            socket.emit('cartError', { error: error.message });
        }
    });

    socket.on('removeFromCart', async (data) => {
        try {
            const { productVariationId } = data;
            const result = await clientConnection.removeFromCart(productVariationId);
            socket.emit('cartUpdated', result);
        } catch (error) {
            socket.emit('cartError', { error: error.message });
        }
    });

    socket.on('processPayment', async (data) => {
        try {
            const result = await clientConnection.processPayment(data);
            socket.emit('paymentSuccess', result);
        } catch (error) {
            socket.emit('paymentError', { error: error.message });
        }
    });

    socket.on('getOrders', async () => {
        try {
            const result = await clientConnection.getOrders();
            socket.emit('ordersData', result);
        } catch (error) {
            socket.emit('ordersError', { error: error.message });
        }
    });

    socket.on('chatWithASAI', async (data) => {
        try {
            const { query } = data;
            const result = await clientConnection.chatWithASAI(query);
            socket.emit('asaiResponse', result);
        } catch (error) {
            socket.emit('asaiError', { error: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[ClientGUI] Cliente desconectado: ${socket.id}`);
        
        if (connectedUsers.has(socket.id)) {
            const clientConnection = connectedUsers.get(socket.id);
            clientConnection.disconnect();
            connectedUsers.delete(socket.id);
        }
    });
});

// Inicializar base de datos y servidor
async function startServer() {
    try {
        await connectDB();
        console.log('[ClientGUI] Conectado a la base de datos');
        
        server.listen(PORT, () => {
            console.log(`🚀 [ClientGUI] Interfaz GUI de Cliente iniciada en http://localhost:${PORT}`);
            console.log(`📊 [ClientGUI] Lista para conectar con el bus en ${BUS_HOST}:${BUS_PORT}`);
        });
    } catch (error) {
        console.error('[ClientGUI] Error al inicializar:', error);
        process.exit(1);
    }
}

// Manejo de cierre limpio
process.on('SIGINT', () => {
    console.log('\n[ClientGUI] Cerrando interfaz GUI de cliente...');
    
    // Cerrar todas las conexiones
    connectedUsers.forEach((clientConnection) => {
        clientConnection.disconnect();
    });
    
    setTimeout(() => {
        process.exit(0);
    }, 2000);
});

startServer(); 