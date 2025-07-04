// Cliente GUI JavaScript
class VirtualFitClient {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.currentView = 'catalog';
        this.currentPage = {
            catalog: 1,
            wishlist: 1
        };
        this.currentCart = null;
        this.init();
    }

    init() {
        this.setupSocket();
        this.setupEventListeners();
        this.showScreen('login');
    }

    setupSocket() {
        this.socket = io();
        
        // Eventos de conexión
        this.socket.on('connect', () => {
            console.log('Conectado al servidor');
            this.socket.emit('connectToBus');
        });

        this.socket.on('disconnect', () => {
            console.log('Desconectado del servidor');
            this.showToast('Conexión perdida', 'error');
        });

        this.socket.on('busConnected', (data) => {
            console.log('Conectado al bus:', data.clientId);
        });

        this.socket.on('busConnectionError', (data) => {
            console.error('Error conectando al bus:', data.error);
            this.showToast('Error de conexión al sistema', 'error');
        });

        // Eventos de autenticación
        this.socket.on('authSuccess', (data) => {
            this.currentUser = data.user;
            this.showScreen('main');
            this.updateUserInfo();
            this.loadCatalog();
            this.hideLoading();
        });

        this.socket.on('authError', (data) => {
            this.showError('authError', data.error);
            this.hideLoading();
        });

        // Eventos de catálogo
        this.socket.on('catalogData', (data) => {
            this.displayCatalog(data);
            this.hideLoading();
        });

        this.socket.on('catalogError', (data) => {
            this.showToast('Error cargando catálogo: ' + data.error, 'error');
            this.hideLoading();
        });

        this.socket.on('searchResults', (data) => {
            this.displaySearchResults(data);
            this.hideLoading();
        });

        this.socket.on('searchError', (data) => {
            this.showToast('Error en búsqueda: ' + data.error, 'error');
            this.hideLoading();
        });

        this.socket.on('filterResults', (data) => {
            this.displayFilterResults(data);
            this.hideLoading();
        });

        this.socket.on('filterError', (data) => {
            this.showToast('Error en filtros: ' + data.error, 'error');
            this.hideLoading();
        });

        // Eventos de wishlist
        this.socket.on('wishlistData', (data) => {
            this.displayWishlist(data);
            this.hideLoading();
        });

        this.socket.on('wishlistUpdated', (data) => {
            this.showToast('Lista de deseos actualizada', 'success');
            this.loadWishlist();
        });

        this.socket.on('wishlistError', (data) => {
            this.showToast('Error en lista de deseos: ' + data.error, 'error');
            this.hideLoading();
        });

        // Eventos de carrito
        this.socket.on('cartData', (data) => {
            this.currentCart = data;
            this.displayCart(data);
            this.updateCartCount();
            this.hideLoading();
        });

        this.socket.on('cartUpdated', (data) => {
            this.showToast('Carrito actualizado', 'success');
            this.loadCart();
        });

        this.socket.on('cartError', (data) => {
            this.showToast('Error en carrito: ' + data.error, 'error');
            this.hideLoading();
        });

        // Eventos de pago
        this.socket.on('paymentSuccess', (data) => {
            this.showToast('¡Pago procesado exitosamente!', 'success');
            this.closeModal('checkoutModal');
            this.loadCart();
            this.loadOrders();
            this.hideLoading();
        });

        this.socket.on('paymentError', (data) => {
            this.showToast('Error en pago: ' + data.error, 'error');
            this.hideLoading();
        });

        // Eventos de órdenes
        this.socket.on('ordersData', (data) => {
            this.displayOrders(data);
            this.hideLoading();
        });

        this.socket.on('ordersError', (data) => {
            this.showToast('Error cargando órdenes: ' + data.error, 'error');
            this.hideLoading();
        });

        // Eventos de ASAI
        this.socket.on('asaiResponse', (data) => {
            this.addChatMessage('assistant', data.data?.respuesta || 'Lo siento, no pude procesar tu consulta.');
            this.hideLoading();
        });

        this.socket.on('asaiError', (data) => {
            this.addChatMessage('assistant', 'Lo siento, ocurrió un error: ' + data.error);
            this.hideLoading();
        });
    }

    setupEventListeners() {
        // Tabs de login
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Formularios de autenticación
        document.getElementById('loginFormElement').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        document.getElementById('registerFormElement').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

        // Navegación principal
        document.querySelectorAll('.nav-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchView(e.target.dataset.view);
            });
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.handleLogout();
        });

        // Búsqueda
        document.getElementById('searchBtn').addEventListener('click', () => {
            this.handleSearch();
        });

        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSearch();
            }
        });

        // Filtros
        document.getElementById('filterBtn').addEventListener('click', () => {
            this.showModal('filterModal');
        });

        document.getElementById('applyFiltersBtn').addEventListener('click', () => {
            this.applyFilters();
        });

        document.getElementById('clearFiltersBtn').addEventListener('click', () => {
            this.clearFilters();
        });

        // Paginación de catálogo
        document.getElementById('catalogPrevBtn').addEventListener('click', () => {
            this.changePage('catalog', -1);
        });

        document.getElementById('catalogNextBtn').addEventListener('click', () => {
            this.changePage('catalog', 1);
        });

        // Paginación de wishlist
        document.getElementById('wishlistPrevBtn').addEventListener('click', () => {
            this.changePage('wishlist', -1);
        });

        document.getElementById('wishlistNextBtn').addEventListener('click', () => {
            this.changePage('wishlist', 1);
        });

        // Checkout
        document.getElementById('checkoutBtn').addEventListener('click', () => {
            this.handleCheckout();
        });

        document.getElementById('confirmPaymentBtn').addEventListener('click', () => {
            this.processPayment();
        });

        // Chat ASAI
        document.getElementById('chatSendBtn').addEventListener('click', () => {
            this.sendChatMessage();
        });

        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        // Sugerencias de chat
        document.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.getElementById('chatInput').value = e.target.textContent;
                this.sendChatMessage();
            });
        });

        // Cerrar modales
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                this.closeModal(modal.id);
            });
        });

        // Cerrar modales al hacer clic fuera
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });
    }

    // Manejo de pantallas
    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenName + 'Screen').classList.add('active');
    }

    // Manejo de tabs de login
    switchTab(tabName) {
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.remove('active');
        });

        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(tabName + 'Form').classList.add('active');
    }

    // Autenticación
    handleLogin() {
        const formData = new FormData(document.getElementById('loginFormElement'));
        const credentials = {
            correo: formData.get('correo'),
            password: formData.get('password')
        };

        this.showLoading();
        this.socket.emit('authenticate', { credentials, isLogin: true });
    }

    handleRegister() {
        const formData = new FormData(document.getElementById('registerFormElement'));
        const credentials = {
            correo: formData.get('correo'),
            password: formData.get('password')
        };

        this.showLoading();
        this.socket.emit('authenticate', { credentials, isLogin: false });
    }

    handleLogout() {
        this.currentUser = null;
        this.currentCart = null;
        this.showScreen('login');
        this.clearForms();
    }

    clearForms() {
        document.getElementById('loginFormElement').reset();
        document.getElementById('registerFormElement').reset();
    }

    updateUserInfo() {
        if (this.currentUser) {
            document.getElementById('userEmail').textContent = this.currentUser.correo;
            document.getElementById('userPoints').textContent = `${this.currentUser.asai_points || 0} ASAIpoints`;
        }
    }

    // Navegación
    switchView(viewName) {
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        document.querySelector(`[data-view="${viewName}"]`).classList.add('active');
        document.getElementById(viewName + 'View').classList.add('active');

        this.currentView = viewName;

        // Cargar datos según la vista
        switch (viewName) {
            case 'catalog':
                this.loadCatalog();
                break;
            case 'wishlist':
                this.loadWishlist();
                break;
            case 'cart':
                this.loadCart();
                break;
            case 'orders':
                this.loadOrders();
                break;
            case 'asai':
                // No necesita cargar datos adicionales
                break;
        }
    }

    // Catálogo
    loadCatalog() {
        this.showLoading();
        this.socket.emit('getCatalog', { 
            page: this.currentPage.catalog, 
            limit: 4 
        });
    }

    displayCatalog(data) {
        const container = document.getElementById('catalogProducts');
        const products = data.products || [];
        
        container.innerHTML = '';
        
        if (products.length === 0) {
            container.innerHTML = '<p>No se encontraron productos.</p>';
            return;
        }

        products.forEach(product => {
            const productCard = this.createProductCard(product, 'catalog');
            container.appendChild(productCard);
        });

        this.updatePagination('catalog', data.page || 1, data.totalPages || 1);
    }

    createProductCard(product, context) {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        const variations = product.variaciones || [];
        let variationsHTML = '';
        
        variations.forEach(variation => {
            variationsHTML += `
                <div class="variation" data-variation-id="${variation._id}">
                    <span class="variation-info">${variation.talla} / ${variation.color}</span>
                    <span class="variation-price">$${variation.precio}</span>
                </div>
            `;
        });

        card.innerHTML = `
            <div class="product-image">
                <i class="fas fa-tshirt"></i>
            </div>
            <div class="product-info">
                <div class="product-name">${product.nombre}</div>
                <div class="product-brand">${product.marca}</div>
                <div class="product-variations">
                    ${variationsHTML}
                </div>
                <div class="product-actions">
                    ${context === 'catalog' ? `
                        <button class="btn btn-primary" onclick="client.addToCart('${product._id}')">
                            <i class="fas fa-shopping-cart"></i> Carrito
                        </button>
                        <button class="btn btn-secondary" onclick="client.addToWishlist('${product._id}')">
                            <i class="fas fa-heart"></i> Deseos
                        </button>
                    ` : `
                        <button class="btn btn-primary" onclick="client.addToCart('${product._id}')">
                            <i class="fas fa-shopping-cart"></i> Carrito
                        </button>
                        <button class="btn btn-danger" onclick="client.removeFromWishlist('${product._id}')">
                            <i class="fas fa-trash"></i> Eliminar
                        </button>
                    `}
                </div>
            </div>
        `;
        
        return card;
    }

    updatePagination(context, currentPage, totalPages) {
        const pageInfo = document.getElementById(context + 'PageInfo');
        const prevBtn = document.getElementById(context + 'PrevBtn');
        const nextBtn = document.getElementById(context + 'NextBtn');
        
        pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
        
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= totalPages;
    }

    changePage(context, direction) {
        const newPage = this.currentPage[context] + direction;
        if (newPage >= 1) {
            this.currentPage[context] = newPage;
            if (context === 'catalog') {
                this.loadCatalog();
            } else if (context === 'wishlist') {
                this.loadWishlist();
            }
        }
    }

    // Búsqueda
    handleSearch() {
        const searchTerm = document.getElementById('searchInput').value.trim();
        if (searchTerm) {
            this.showLoading();
            this.socket.emit('searchProducts', { term: searchTerm });
        }
    }

    displaySearchResults(data) {
        const container = document.getElementById('catalogProducts');
        const products = data || [];
        
        container.innerHTML = '';
        
        if (products.length === 0) {
            container.innerHTML = '<p>No se encontraron productos con ese término.</p>';
            return;
        }

        products.forEach(product => {
            const productCard = this.createProductCard(product, 'catalog');
            container.appendChild(productCard);
        });

        // Ocultar paginación para resultados de búsqueda
        document.getElementById('catalogPagination').style.display = 'none';
    }

    // Filtros
    applyFilters() {
        const form = document.getElementById('filterForm');
        const formData = new FormData(form);
        const criteria = {};

        for (const [key, value] of formData.entries()) {
            if (value.trim()) {
                if (key === 'precio_min' || key === 'precio_max') {
                    criteria[key] = parseFloat(value);
                } else if (key === 'solo_disponibles') {
                    criteria[key] = true;
                } else {
                    criteria[key] = value.trim();
                }
            }
        }

        this.showLoading();
        this.socket.emit('filterProducts', { criteria });
        this.closeModal('filterModal');
    }

    clearFilters() {
        document.getElementById('filterForm').reset();
        this.loadCatalog();
        this.closeModal('filterModal');
    }

    displayFilterResults(data) {
        const container = document.getElementById('catalogProducts');
        const products = data || [];
        
        container.innerHTML = '';
        
        if (products.length === 0) {
            container.innerHTML = '<p>No se encontraron productos con esos filtros.</p>';
            return;
        }

        products.forEach(product => {
            const productCard = this.createProductCard(product, 'catalog');
            container.appendChild(productCard);
        });

        // Ocultar paginación para resultados de filtros
        document.getElementById('catalogPagination').style.display = 'none';
    }

    // Wishlist
    loadWishlist() {
        this.showLoading();
        this.socket.emit('getWishlist', { 
            page: this.currentPage.wishlist, 
            limit: 4 
        });
    }

    displayWishlist(data) {
        const container = document.getElementById('wishlistProducts');
        const products = data.products || [];
        
        container.innerHTML = '';
        
        if (products.length === 0) {
            container.innerHTML = '<p>Tu lista de deseos está vacía.</p>';
            return;
        }

        products.forEach(product => {
            const productCard = this.createProductCard(product, 'wishlist');
            container.appendChild(productCard);
        });

        this.updatePagination('wishlist', data.page || 1, data.totalPages || 1);
    }

    addToWishlist(productId) {
        this.showLoading();
        this.socket.emit('addToWishlist', { productId });
    }

    removeFromWishlist(productId) {
        this.showLoading();
        this.socket.emit('removeFromWishlist', { productId });
    }

    // Carrito
    loadCart() {
        this.showLoading();
        this.socket.emit('getCart');
    }

    displayCart(cart) {
        const container = document.getElementById('cartItems');
        const items = cart?.items || [];
        
        container.innerHTML = '';
        
        if (items.length === 0) {
            container.innerHTML = '<p>Tu carrito está vacío.</p>';
            document.getElementById('cartSummary').style.display = 'none';
            return;
        }

        document.getElementById('cartSummary').style.display = 'block';
        
        let total = 0;
        items.forEach(item => {
            const subtotal = item.cantidad * item.precio_snapshot;
            total += subtotal;
            
            const cartItem = document.createElement('div');
            cartItem.className = 'cart-item';
            cartItem.innerHTML = `
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.nombre_snapshot}</div>
                    <div class="cart-item-details">${item.talla} / ${item.color} - $${item.precio_snapshot}</div>
                </div>
                <div class="cart-item-controls">
                    <div class="quantity-controls">
                        <button class="quantity-btn" onclick="client.updateCartQuantity('${item.producto_variacion_id}', ${item.cantidad - 1})">-</button>
                        <input type="number" class="quantity-input" value="${item.cantidad}" min="1" onchange="client.updateCartQuantity('${item.producto_variacion_id}', this.value)">
                        <button class="quantity-btn" onclick="client.updateCartQuantity('${item.producto_variacion_id}', ${item.cantidad + 1})">+</button>
                    </div>
                    <button class="btn btn-danger" onclick="client.removeFromCart('${item.producto_variacion_id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(cartItem);
        });

        document.getElementById('cartSubtotal').textContent = `$${total.toFixed(2)}`;
        document.getElementById('cartTotal').textContent = `$${total.toFixed(2)}`;
    }

    updateCartCount() {
        const items = this.currentCart?.items || [];
        const totalItems = items.reduce((sum, item) => sum + item.cantidad, 0);
        document.getElementById('cartCount').textContent = totalItems;
    }

    addToCart(productId) {
        this.showLoading();
        this.socket.emit('addToCart', { productId, quantity: 1 });
    }

    updateCartQuantity(productVariationId, newQuantity) {
        const quantity = parseInt(newQuantity);
        if (quantity >= 1) {
            this.showLoading();
            this.socket.emit('updateCartItem', { productVariationId, newQuantity: quantity });
        }
    }

    removeFromCart(productVariationId) {
        this.showLoading();
        this.socket.emit('removeFromCart', { productVariationId });
    }

    // Checkout
    handleCheckout() {
        if (!this.currentUser) {
            this.showToast('Debe iniciar sesión para proceder', 'error');
            return;
        }

        const direcciones = this.currentUser.direcciones || [];
        const metodosPago = this.currentUser.metodos_pago || [];

        if (direcciones.length === 0) {
            this.showToast('Debe tener al menos una dirección registrada', 'error');
            return;
        }

        if (metodosPago.length === 0) {
            this.showToast('Debe tener al menos un método de pago registrado', 'error');
            return;
        }

        // Llenar los selects del modal
        const direccionSelect = document.getElementById('checkoutDireccion');
        const metodoPagoSelect = document.getElementById('checkoutMetodoPago');
        
        direccionSelect.innerHTML = '<option value="">Selecciona una dirección</option>';
        direcciones.forEach(dir => {
            const option = document.createElement('option');
            option.value = dir._id;
            option.textContent = `${dir.nombre_direccion}: ${dir.calle}, ${dir.ciudad}`;
            direccionSelect.appendChild(option);
        });

        metodoPagoSelect.innerHTML = '<option value="">Selecciona un método de pago</option>';
        metodosPago.forEach(metodo => {
            const option = document.createElement('option');
            option.value = metodo._id;
            option.textContent = `${metodo.tipo} - ${metodo.detalle}`;
            metodoPagoSelect.appendChild(option);
        });

        // Mostrar opción de puntos si tiene suficientes
        const pointsDiscount = document.getElementById('pointsDiscount');
        if (this.currentUser.asai_points >= 100) {
            pointsDiscount.style.display = 'block';
        } else {
            pointsDiscount.style.display = 'none';
        }

        this.showModal('checkoutModal');
    }

    processPayment() {
        const form = document.getElementById('checkoutForm');
        const formData = new FormData(form);
        
        const paymentData = {
            direccion_id: formData.get('direccion_id'),
            metodo_pago_id: formData.get('metodo_pago_id'),
            pointsToUse: formData.get('use_points') ? 100 : 0
        };

        if (!paymentData.direccion_id || !paymentData.metodo_pago_id) {
            this.showToast('Por favor complete todos los campos', 'error');
            return;
        }

        this.showLoading();
        this.socket.emit('processPayment', paymentData);
    }

    // Órdenes
    loadOrders() {
        this.showLoading();
        this.socket.emit('getOrders');
    }

    displayOrders(orders) {
        const container = document.getElementById('ordersList');
        
        container.innerHTML = '';
        
        if (!orders || orders.length === 0) {
            container.innerHTML = '<p>No tienes órdenes recientes.</p>';
            return;
        }

        orders.forEach(order => {
            const orderCard = document.createElement('div');
            orderCard.className = 'order-card';
            orderCard.innerHTML = `
                <div class="order-header">
                    <span class="order-id">#${order._id}</span>
                    <span class="order-date">${new Date(order.createdAt).toLocaleDateString('es-ES')}</span>
                </div>
                <div class="order-status ${order.estado}">
                    ${order.estado}
                </div>
                <div class="order-details">
                    <span>Items: ${order.itemCount}</span>
                    <span class="order-total">Total: $${order.total_pago}</span>
                </div>
                ${order.points_used > 0 ? `<div>Puntos usados: ${order.points_used}</div>` : ''}
            `;
            container.appendChild(orderCard);
        });
    }

    // Chat ASAI
    sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (!message) return;

        this.addChatMessage('user', message);
        input.value = '';

        this.showLoading();
        this.socket.emit('chatWithASAI', { query: message });
    }

    addChatMessage(sender, message) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}`;
        
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-${sender === 'user' ? 'user' : 'robot'}"></i>
            </div>
            <div class="message-content">${message}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Utilidades
    showModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    showLoading() {
        document.getElementById('loadingOverlay').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    showError(elementId, message) {
        const errorElement = document.getElementById(elementId);
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 5000);
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        document.getElementById('toastContainer').appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }
}

// Inicializar la aplicación
const client = new VirtualFitClient(); 