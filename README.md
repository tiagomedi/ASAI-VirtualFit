# Virtual Fit - Interfaz GUI Profesional / Proyecto de Arquitectura de Software - Arquitectura SOA
Este repositorio contiene el proyecto realizado el 2025 del curso de Arquitectura de Software de la Universidad Diego Portales (UDP).

## 🚀 Descripción
Interfaz web para el control y monitoreo de todos los servicios del sistema Virtual Fit. Esta aplicación proporciona una experiencia visual moderna y en tiempo real para gestionar los microservicios de la tienda virtual.

## ✨ Características

- **🎛️ Control Total**: Inicia, detiene y monitorea todos los servicios desde una sola interfaz
- **⚡ Tiempo Real**: Actualizaciones instantáneas del estado de servicios usando WebSockets
- **📊 Dashboard Intuitivo**: Vista general con estadísticas en tiempo real
- **🔍 Monitoreo Detallado**: Logs individuales por servicio con filtros y búsqueda
- **📱 Responsive**: Interfaz adaptable a dispositivos móviles y escritorio
- **🎨 Diseño Moderno**: UI/UX profesional con animaciones y efectos visuales
- **🔄 Auto-reconexión**: Recuperación automática de conexiones perdidas

## 🏗️ Arquitectura

La interfaz GUI está construida con:

- **Backend**: Node.js + Express.js + Socket.IO
- **Frontend**: HTML5 + CSS3 + JavaScript ES6
- **Comunicación**: WebSockets para actualizaciones en tiempo real
- **Diseño**: CSS Grid + Flexbox + Animaciones CSS

## 📋 Servicios Gestionados

La interfaz controla los siguientes servicios:

| Servicio | Puerto | Descripción |
|----------|---------|-------------|
| **Catálogo** | 5002 | Gestión de productos y catálogo |
| **Lista de Deseos** | 5003 | Gestión de wishlist |
| **Carrito** | 5001 | Gestión del carrito de compras |
| **Órdenes** | 5001 | Procesamiento de órdenes |
| **Autenticación** | 5001 | Registro y autenticación |
| **Perfil** | 5001 | Gestión de perfiles |
| **Reseñas** | 5001 | Sistema de reseñas |
| **Puntos** | 5001 | Sistema de puntos |
| **Pagos** | 5001 | Procesamiento de pagos |
| **ASAI Assistant** | 5001 | Asistente virtual |

## 🛠️ Instalación

### Prerequisitos

- Node.js (versión 14 o superior)
- npm o yarn
- Base de datos MongoDB corriendo

### Pasos de Instalación

1. **Instalar dependencias**:
```bash
npm install
```

2. **Iniciar la interfaz GUI**:
```bash
npm start
```

3. **Acceder a la interfaz**:
   - Abrir navegador en: `http://localhost:3000`

## 🎯 Uso

### Inicio Rápido

1. **Ejecutar la GUI**:
```bash
node guiApp.js
```

2. **Abrir el navegador** en `http://localhost:3000`

3. **Controlar servicios**:
   - Hacer clic en "Iniciar Todos" para arrancar todos los servicios
   - Usar los botones individuales para controlar servicios específicos
   - Ver logs en tiempo real en la sección inferior

### Comandos Disponibles

```bash
# Iniciar solo la interfaz GUI
npm run gui

# Iniciar solo los servicios (sin GUI)
npm run services

# Iniciar todo el sistema completo
npm run full

# Modo desarrollo con auto-reload
npm run dev
```

### Funcionalidades Principales

#### 🎛️ Control de Servicios
- **Iniciar/Detener**: Botones individuales para cada servicio
- **Iniciar/Detener Todo**: Controles globales para todos los servicios
- **Estado Visual**: Indicadores de color para el estado de cada servicio

#### 📊 Monitoreo
- **Estadísticas en Tiempo Real**: Contador de servicios activos, detenidos y errores
- **Logs del Sistema**: Vista consolidada de todos los logs
- **Detalles por Servicio**: Modal con información detallada y logs específicos

#### 🔧 Herramientas
- **Pausar/Reanudar Logs**: Control del flujo de logs
- **Limpiar Logs**: Borrar historial de logs
- **Información Detallada**: PID, tiempo de actividad, puertos, etc.

## 🎨 Interfaz de Usuario

### Secciones Principales

1. **Header**: Logo, estado de conexión, controles globales
2. **Resumen**: Estadísticas generales del sistema
3. **Servicios**: Grid de tarjetas con cada servicio
4. **Logs**: Consola de logs del sistema en tiempo real

### Indicadores Visuales

- 🟢 **Verde**: Servicio activo
- 🔴 **Rojo**: Servicio detenido/error
- 🟡 **Amarillo**: Servicio en transición
- 🔵 **Azul**: Información adicional

### Atajos de Teclado

- `Escape`: Cerrar modal
- `F5`: Actualizar página

## 🔧 Configuración

### Variables de Entorno

```bash
# Puerto de la interfaz GUI (por defecto: 3000)
PORT=3000

# Configuraciones adicionales se pueden añadir en guiApp.js
```

### Personalización

La configuración de servicios se puede modificar en `guiApp.js`:

```javascript
const SERVICES_CONFIG = {
    // Añadir nuevos servicios aquí
    nuevoServicio: {
        name: 'Nuevo Servicio',
        path: 'ruta/al/servicio.js',
        port: 5004,
        description: 'Descripción del servicio'
    }
};
```

---

💡 **Tip**: Para una experiencia óptima, usa la GUI en pantalla completa con un navegador moderno como Chrome, Firefox o Safari.

🚀 **¡Disfruta gestionando tus servicios con estilo!** 

## 🛒 Guía para Simular una Compra

Para simular una compra dentro del ecosistema de Virtual Fit, se deben activar y coordinar los siguientes servicios:

### 🔧 Servicios Requeridos

| Servicio           | Archivo              | Descripción                                       |
|--------------------|----------------------|---------------------------------------------------|
| **Órdenes**        | `orderService.js`    | Gestiona y procesa las órdenes de compra         |
| **Pagos**          | `pagosService.js`    | Encargado de procesar el pago del pedido         |
| **Puntos**         | `pointService.js`    | Administra la asignación de puntos por compra    |
| **Cliente Carrito**| `cartClient.js`      | Cliente que simula la compra y dispara el flujo  |

---

### 🧪 Pasos para Ejecutar una Compra

1. **Iniciar Servicios Necesarios**  
   Desde la GUI, activa los siguientes servicios en orden:
   - `orderService.js`
   - `pagosService.js`
   - `pointService.js`
   - `cartService.js`

2. **Ejecutar el Cliente de Compra**  
   Abre una terminal y ejecuta el siguiente comando:
   ```bash
   node cartClient.js

💡 **Nota Importante**: Durante el proceso de compra, puede aparecer el siguiente mensaje de error:

> ❌ **Error en la gestión del carrito**: Timeout - El servicio de pagos no respondió dentro del tiempo límite (5000ms)

A pesar de este mensaje, **la compra se completa exitosamente** y los servicios de órdenes y puntos procesan correctamente la transacción. Este error indica únicamente un retraso temporal en la respuesta del servicio de pagos y no afecta la integridad del flujo de compra.