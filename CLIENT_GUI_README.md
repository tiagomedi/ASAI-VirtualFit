# VirtualFit - Cliente GUI

## 📋 Descripción

El Cliente GUI de VirtualFit es una interfaz web moderna y responsive que permite a los usuarios interactuar con la tienda virtual de manera intuitiva. Utiliza la misma lógica del cliente CLI pero presentada en una interfaz web profesional.

## 🚀 Características Principales

### 🔐 Autenticación
- **Inicio de sesión** con credenciales existentes
- **Registro** de nuevos usuarios
- **Gestión de sesión** automática

### 🏪 Catálogo de Productos
- **Navegación paginada** (4 productos por página)
- **Búsqueda** por términos específicos
- **Filtros avanzados** por marca, categoría, color, talla, precio
- **Visualización detallada** de variaciones de productos

### ❤️ Lista de Deseos
- **Paginación** igual que el catálogo (4 productos por página) [[memory:2197676]]
- **Agregar/eliminar** productos de la lista
- **Navegación** entre páginas de la lista

### 🛒 Carrito de Compras
- **Gestión de items** (agregar, modificar cantidad, eliminar)
- **Cálculo automático** de totales
- **Visualización en tiempo real** del número de items

### 💳 Proceso de Pago
- **Selección de dirección** de envío
- **Selección de método de pago**
- **Sistema de puntos ASAIpoints** (100 puntos = 20% descuento)
- **Confirmación** de orden

### 📋 Historial de Órdenes
- **Visualización** de órdenes anteriores
- **Detalles** de cada orden (fecha, estado, total, items)
- **Información** de puntos utilizados

### 🤖 Chat ASAI
- **Asistente virtual** inteligente
- **Preguntas sugeridas** para facilitar la interacción
- **Respuestas** en tiempo real
- **Interfaz de chat** moderna

## 🛠️ Instalación y Configuración

### Requisitos Previos

1. **Bus de mensajería** ejecutándose:
   ```bash
   node app.js
   ```

2. **Servicios backend** activos:
   ```bash
   node mainGUI.js services
   ```

3. **Base de datos MongoDB** conectada

### Iniciar el Cliente GUI

```bash
# Opción 1: Usar el launcher (recomendado)
node clientLauncher.js

# Opción 2: Ejecutar directamente
node clientGUI.js
```

### Verificar Dependencias

```bash
node clientLauncher.js --check
```

### Ver Ayuda

```bash
node clientLauncher.js --help
```

## 🌐 Acceso

Una vez iniciado, el cliente estará disponible en:
- **URL**: http://localhost:3001
- **Puerto**: 3001 (configurable con variable de entorno CLIENT_PORT)

## 📁 Estructura de Archivos

```
ASAI-VirtualFit/
├── clientGUI.js              # Servidor Express + Socket.io
├── clientLauncher.js         # Launcher del cliente
├── clientPublic/             # Archivos estáticos
│   ├── index.html           # Interfaz HTML
│   ├── style.css            # Estilos CSS
│   └── script.js            # Lógica JavaScript
└── CLIENT_GUI_README.md     # Este archivo
```

## 🎯 Funcionalidades Detalladas

### Catálogo
- **Paginación**: Navega entre páginas de productos
- **Búsqueda**: Busca productos por nombre, marca, etc.
- **Filtros**: Aplica múltiples filtros simultáneamente
- **Acciones**: Agrega productos al carrito o lista de deseos

### Lista de Deseos
- **Visualización paginada**: 4 productos por página
- **Gestión**: Agrega desde catálogo, elimina desde lista
- **Conversión**: Agrega productos de la lista al carrito

### Carrito
- **Gestión de cantidad**: Modifica cantidades con controles +/-
- **Eliminación**: Remueve items individuales
- **Resumen**: Visualiza subtotal y total
- **Checkout**: Procede al pago cuando hay items

### Proceso de Pago
- **Direcciones**: Selecciona de direcciones guardadas del usuario
- **Métodos de pago**: Selecciona de métodos guardados
- **Descuentos**: Usa puntos ASAIpoints para descuentos
- **Confirmación**: Procesa el pago y crea la orden

### Chat ASAI
- **Consultas libres**: Pregunta cualquier cosa sobre productos
- **Sugerencias**: Botones con preguntas frecuentes
- **Respuestas inteligentes**: ASAI responde basado en el catálogo

## 🔧 Servicios Utilizados

El cliente se comunica con estos servicios a través del bus:

- **auths**: Registro de usuarios
- **logns**: Inicio de sesión  
- **catal**: Catálogo de productos
- **deseo**: Lista de deseos
- **carro**: Carrito de compras
- **pagos**: Procesamiento de pagos
- **order**: Gestión de órdenes
- **asais**: Chat con ASAI

## 🎨 Interfaz de Usuario

### Diseño
- **Responsive**: Se adapta a dispositivos móviles
- **Moderno**: Usa CSS moderno con variables y gradientes
- **Intuitivo**: Navegación clara y botones descriptivos
- **Accesible**: Iconos FontAwesome y colores contrastantes

### Navegación
- **Header fijo**: Siempre visible con navegación principal
- **Badges**: Contador de items en el carrito
- **Estados**: Visual feedback para loading, errores, éxito
- **Modales**: Para filtros y checkout

### Responsive
- **Desktop**: Layout completo con sidebar y grid
- **Tablet**: Navegación adaptada y grid responsivo
- **Mobile**: Navegación vertical y layout de una columna

## 🐛 Resolución de Problemas

### Cliente no se conecta
1. Verificar que el bus esté ejecutándose (puerto 5001)
2. Verificar que los servicios estén activos
3. Revisar la consola del navegador para errores

### Errores de autenticación
1. Verificar que el servicio `auths`/`logns` esté activo
2. Revisar credenciales en la base de datos
3. Verificar logs del servidor

### Productos no se cargan
1. Verificar que el servicio `catal` esté activo
2. Revisar que haya productos en la base de datos
3. Verificar logs del servicio de catálogo

### Chat ASAI no responde
1. Verificar que el servicio `asais` esté activo
2. Revisar logs del servicio ASAI
3. Verificar conexión con la base de datos

## 📝 Notas Técnicas

### Arquitectura
- **Frontend**: HTML5 + CSS3 + JavaScript ES6
- **Backend**: Node.js + Express + Socket.io
- **Comunicación**: WebSockets en tiempo real
- **Protocolo**: Mismo protocolo del CLI (headers de 5 bytes)

### Seguridad
- **Validación**: En frontend y backend
- **Sanitización**: De datos de entrada
- **Gestión de sesión**: A través de Socket.io

### Performance
- **Paginación**: Reduce carga de datos
- **Lazy loading**: Carga solo cuando es necesario
- **Cacheo**: De datos del usuario y carrito

## 🆘 Soporte

Para problemas o preguntas:
1. Revisar este README
2. Verificar logs del cliente y servicios
3. Usar `node clientLauncher.js --check` para diagnóstico
4. Revisar la consola del navegador

---

¡Disfruta usando VirtualFit Cliente GUI! 🛍️✨ 