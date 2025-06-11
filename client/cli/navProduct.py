# --- START OF FILE navProduct.py ---

import socket
import json
import uuid
import threading
from InquirerPy import inquirer
from InquirerPy.validator import EmptyInputValidator, NumberValidator

# --- Configuración del Cliente ---
BUS_HOST = 'localhost'
BUS_PORT = 5001
CLIENT_ID = str(uuid.uuid4())[:5]
SERVICE_TO_CALL = 'prodc'

# --- Lógica de Comunicación con el Bus ---
def send_message(sock, service, message):
    if isinstance(message, dict):
        message = json.dumps(message)
    payload = service + message
    header = str(len(payload)).zfill(5)
    full_message = header + payload
    sock.sendall(full_message.encode('utf-8'))

def print_products(products):
    """Imprime una lista de productos y sus variaciones de forma legible."""
    if not products:
        print("\n>> No se encontraron productos que coincidan con su criterio.")
        return
    
    print("\n" + "="*50)
    print(" " * 15 + "CATÁLOGO DE PRODUCTOS")
    print("="*50)
    
    for i, p in enumerate(products, 1):
        print(f"\n{i}. {p.get('nombre', 'N/A').upper()} (Marca: {p.get('marca', 'N/A')})")
        print(f"   Categoría: {p.get('categoria', 'N/A')}")
        print(f"   Descripción: {p.get('descripcion', 'Sin descripción')}")
        
        variaciones = p.get('variaciones', [])
        if variaciones:
            print("   --- Variaciones Disponibles ---")
            for var in variaciones:
                talla = var.get('talla', 'Talla única')
                color = var.get('color', 'Color único')
                precio = var.get('precio', 0)
                stock = var.get('stock', 0)
                print(f"     - Talla: {talla:<10} | Color: {color:<15} | Precio: ${precio:<8.2f} | Stock: {stock}")
        else:
            print("   (Sin variaciones disponibles)")
    print("\n" + "="*50 + "\n")


def listen_for_responses(sock, stop_event):
    """Escucha respuestas del bus en un hilo separado."""
    while not stop_event.is_set():
        try:
            sock.settimeout(1.0) # Desbloquear cada segundo para chequear stop_event
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
                print("[Cliente] Registro en el bus confirmado.")
                continue

            response = json.loads(message)
            
            print(f"\n[Cliente] Respuesta recibida de '{sender}':")
            if response.get("status") == "success":
                print_products(response.get("data", []))
            else:
                print(f"!! Error del servicio: {response.get('message', 'Error desconocido.')}\n")
            
            print(">> ¿Qué deseas hacer ahora? (Escribe un comando o 'salir')")

        except socket.timeout:
            continue
        except (ConnectionAbortedError, OSError):
            print("\n[Cliente] Conexión con el bus perdida.")
            break
        except Exception as e:
            print(f"\n[Cliente] Error recibiendo datos: {e}")
            break


def main_menu(sock):
    """Muestra el menú principal y gestiona la entrada del usuario."""
    print("\n--- Cliente de Navegación de Productos ---")
    print("Comandos: 'ver catalogo', 'buscar <termino>', 'filtrar', 'salir'")
    
    while True:
        try:
            action = inquirer.text(
                message=">>",
                long_instruction="Escribe un comando ('ayuda' para más info):"
            ).execute()

            parts = action.lower().strip().split()
            if not parts: continue

            command_word = parts[0]
            
            if command_word == "salir":
                break
            
            elif command_word == "ayuda":
                print("Comandos disponibles:\n"
                      "  - ver catalogo: Muestra todos los productos.\n"
                      "  - buscar <termino>: Busca productos por nombre, marca, etc.\n"
                      "  - filtrar: Inicia un asistente para filtrar productos.\n"
                      "  - salir: Cierra el cliente.")
                continue

            request = None
            if action == "ver catalogo":
                request = {"command": "ver_catalogo"}

            elif command_word == "buscar":
                if len(parts) < 2:
                    print("!! Uso: buscar <termino de busqueda>"); continue
                termino = " ".join(parts[1:])
                request = {"command": "buscar", "args": {"termino": termino}}

            elif command_word == "filtrar":
                print("--- Filtro Interactivo (deja en blanco para ignorar) ---")
                marca = inquirer.text(message="Marca:").execute()
                categoria = inquirer.text(message="Categoría:").execute()
                color = inquirer.text(message="Color de variación:").execute()
                talla = inquirer.text(message="Talla de variación:").execute()
                precio_min = inquirer.text(message="Precio mínimo:", validate=NumberValidator(float_allowed=True, default=None)).execute()
                precio_max = inquirer.text(message="Precio máximo:", validate=NumberValidator(float_allowed=True, default=None)).execute()

                filtros = {k: v for k, v in {
                    "marca": marca, "categoria": categoria, "color": color, "talla": talla, 
                    "precio_min": precio_min, "precio_max": precio_max
                }.items() if v}
                
                if not filtros:
                    print("!! No se especificó ningún filtro."); continue
                
                request = {"command": "filtrar", "args": {"filtros": filtros}}
            
            if request:
                send_message(sock, SERVICE_TO_CALL, request)
                print("[Cliente] Solicitud enviada. Esperando respuesta...")
            else:
                print(f"!! Comando '{action}' no reconocido.")

        except (KeyboardInterrupt, TypeError): # TypeError en InquirerPy al salir con Ctrl+C
            break

# --- Función Principal ---
def run_client():
    stop_event = threading.Event()
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.connect((BUS_HOST, BUS_PORT))
            print(f"[Cliente] Conectado al bus en {BUS_HOST}:{BUS_PORT}")
            send_message(sock, 'sinit', CLIENT_ID)

            listener_thread = threading.Thread(target=listen_for_responses, args=(sock, stop_event))
            listener_thread.start()

            main_menu(sock)

        except ConnectionRefusedError:
            print("[Cliente] Error: No se pudo conectar al bus.")
        finally:
            print("\n[Cliente] Desconectando...")
            stop_event.set()
            sock.close() # Cierra el socket para desbloquear el hilo listener
            if 'listener_thread' in locals() and listener_thread.is_alive():
                listener_thread.join()

if __name__ == "__main__":
    run_client()