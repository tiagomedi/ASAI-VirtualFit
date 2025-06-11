# --- START OF FILE productCatalogo.py ---

import socket
import json
import os
from pymongo import MongoClient
from dotenv import load_dotenv

# --- Configuración del Servicio ---
BUS_HOST = 'localhost'
BUS_PORT = 5001
SERVICE_NAME = 'prodc' # Nombre de 5 caracteres para este servicio

# --- Conexión a la Base de Datos ---
def connect_to_db():
    """Se conecta a MongoDB usando la URI del archivo .env y devuelve la colección de productos."""
    # Ruta al archivo .env en la carpeta 'database'
    dotenv_path = os.path.join(os.path.dirname(__file__), '../../database/.env')
    
    print(f"[productCatalogo] Buscando archivo .env en: {os.path.abspath(dotenv_path)}")
    load_dotenv(dotenv_path=dotenv_path)
    mongodb_uri = os.getenv('MONGODB_URI')
    print(f"[productCatalogo] Valor de MONGODB_URI: {mongodb_uri}")

    if not mongodb_uri:
        print("\n[productCatalogo] ERROR FATAL: MONGODB_URI no encontrada.")
        exit(1)

    try:
        print("[productCatalogo] Conectando a MongoDB...")
        client = MongoClient(mongodb_uri)
        db = client.get_default_database()
        products_collection = db.products # Colección 'products' según tu modelo
        print("[productCatalogo] Conexión a MongoDB exitosa.")
        return products_collection
    except Exception as e:
        print(f"[productCatalogo] Error al conectar con MongoDB: {e}")
        exit(1)

# --- Lógica de Comunicación con el Bus ---
def send_message(sock, service, message):
    """Prepara y envía un mensaje al bus."""
    if isinstance(message, dict) or isinstance(message, list):
        message = json.dumps(message, default=str) # default=str para manejar ObjectId

    payload = service + message
    header = str(len(payload)).zfill(5)
    full_message = header + payload
    print(f"[productCatalogo] Enviando: {full_message[:200]}...") # Limita el log para no saturar
    sock.sendall(full_message.encode('utf-8'))


def handle_request(collection, request_str):
    """Procesa la solicitud del cliente y devuelve una respuesta."""
    try:
        request = json.loads(request_str)
        command = request.get("command")
        args = request.get("args", {})

        print(f"[productCatalogo] Comando recibido: '{command}' con argumentos: {args}")

        response_data = []
        projection = {'_id': 0, 'reseñas': 0, 'createdAt': 0, 'updatedAt': 0, '__v': 0}

        if command == "ver_catalogo":
            cursor = collection.find({}, projection)
            response_data = list(cursor)

        elif command == "buscar":
            term = args.get("termino")
            if not term:
                raise ValueError("El término de búsqueda no puede estar vacío.")
            # Búsqueda en múltiples campos, incluyendo dentro de variaciones
            query = {
                "$or": [
                    {"nombre": {"$regex": term, "$options": "i"}},
                    {"marca": {"$regex": term, "$options": "i"}},
                    {"categoria": {"$regex": term, "$options": "i"}},
                    {"descripcion": {"$regex": term, "$options": "i"}},
                    {"tags": {"$regex": term, "$options": "i"}},
                    {"variaciones.color": {"$regex": term, "$options": "i"}},
                    {"variaciones.talla": {"$regex": term, "$options": "i"}}
                ]
            }
            cursor = collection.find(query, projection)
            response_data = list(cursor)

        elif command == "filtrar":
            filters = args.get("filtros", {})
            query = {}
            variation_filters = {}

            # Filtros a nivel de producto
            if filters.get("marca"):
                query["marca"] = {"$regex": filters["marca"], "$options": "i"}
            if filters.get("categoria"):
                query["categoria"] = {"$regex": filters["categoria"], "$options": "i"}

            # Filtros a nivel de variación (dentro del array)
            if filters.get("color"):
                variation_filters["color"] = {"$regex": filters["color"], "$options": "i"}
            if filters.get("talla"):
                variation_filters["talla"] = {"$regex": filters["talla"], "$options": "i"}
            
            price_query = {}
            if filters.get("precio_min"):
                price_query["$gte"] = float(filters["precio_min"])
            if filters.get("precio_max"):
                price_query["$lte"] = float(filters["precio_max"])
            if price_query:
                variation_filters["precio"] = price_query
            
            # Usamos $elemMatch para encontrar productos donde AL MENOS UNA variación cumpla TODOS los filtros de variación
            if variation_filters:
                query["variaciones"] = {"$elemMatch": variation_filters}
            
            print(f"[productCatalogo] Query MongoDB: {query}")
            cursor = collection.find(query, projection)
            response_data = list(cursor)

        else:
            raise ValueError(f"Comando desconocido: '{command}'")

        return {"status": "success", "data": response_data}

    except Exception as e:
        print(f"[productCatalogo] Error procesando la petición: {e}")
        return {"status": "error", "message": str(e)}

# --- Función Principal ---
def run_service():
    products_collection = connect_to_db()

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.connect((BUS_HOST, BUS_PORT))
            print(f"[productCatalogo] Conectado al bus en {BUS_HOST}:{BUS_PORT}")
            send_message(sock, 'sinit', SERVICE_NAME)

            while True:
                header_data = sock.recv(5)
                if not header_data:
                    break
                msg_len = int(header_data.decode('utf-8'))
                
                data_received = b''
                while len(data_received) < msg_len:
                    chunk = sock.recv(msg_len - len(data_received))
                    if not chunk: break
                    data_received += chunk
                
                payload = data_received.decode('utf-8')
                sender, message = payload[:5], payload[5:]

                if sender == 'sinit':
                    print("[productCatalogo] Registro en el bus confirmado.")
                    continue
                
                print(f"\n[productCatalogo] Petición recibida de '{sender}'")
                response_payload = handle_request(products_collection, message)
                send_message(sock, sender, response_payload)

        except ConnectionRefusedError:
            print("[productCatalogo] Error: No se pudo conectar al bus.")
        finally:
            print("[productCatalogo] Servicio detenido.")

if __name__ == "__main__":
    run_service()