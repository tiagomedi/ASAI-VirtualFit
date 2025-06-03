# client/calculator_client.py
import socket
import sys

# Configuración del BUS SOA (jrgiadach/soabus:v1)
HOST_BUS = 'localhost'
PORT_BUS = 5001  # Puerto del host mapeado al bus en docker-compose.yml

# Configuración de nuestro SERVICIO DE SUMA EXTERNO
HOST_EXT_SUM_SERVICE = 'localhost'
PORT_EXT_SUM_SERVICE = 5002

def format_message_for_soabus(service_name, data):
    """Prepara el mensaje para el formato NNNNNSSSSSData del bus soabus."""
    if len(service_name) > 5:
        raise ValueError("El nombre del servicio para soabus no puede tener más de 5 caracteres.")
    
    formatted_service_name = service_name.ljust(5) # Rellena SSSSS con espacios
    payload = formatted_service_name + data
    length_of_payload = str(len(payload)).zfill(5) # NNNNN
    
    message = length_of_payload + payload
    return message

def communicate_with_soabus(message_to_bus):
    """Envía un mensaje formateado al bus soabus y recibe su respuesta."""
    print(f"\n[Cliente->SOABus@{PORT_BUS}] Enviando: '{message_to_bus}'")
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((HOST_BUS, PORT_BUS))
            s.sendall(message_to_bus.encode('utf-8'))

            response_length_str = s.recv(5).decode('utf-8')
            if not response_length_str:
                print(f"[SOABus@{PORT_BUS}->Cliente] No se recibió longitud de respuesta.")
                return None
            
            response_payload_length = int(response_length_str)
            response_payload_data = s.recv(response_payload_length).decode('utf-8')
            
            full_response = response_length_str + response_payload_data
            print(f"[SOABus@{PORT_BUS}->Cliente] Recibido: '{full_response}'")
            return full_response
    except Exception as e:
        print(f"[Cliente] Error comunicando con SOABus: {e}")
        return None

def parse_soabus_response(response_str):
    """Parsea la respuesta del bus soabus."""
    if not response_str or len(response_str) < 12: # NNNNN SSSSS ST
        return None, "Respuesta inválida", ""
    
    service_name = response_str[5:10].strip()
    status = response_str[10:12]
    data = response_str[12:]
    return service_name, status, data

def call_external_sum_service(num1_str, num2_str):
    """Llama a nuestro servicio de suma externo."""
    data_to_send = f"{num1_str} {num2_str}"
    print(f"\n[Cliente->SumService@{PORT_EXT_SUM_SERVICE}] Solicitando suma de: '{data_to_send}'")
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((HOST_EXT_SUM_SERVICE, PORT_EXT_SUM_SERVICE))
            s.sendall(data_to_send.encode('utf-8'))
            response = s.recv(1024).decode('utf-8')
            print(f"[SumService@{PORT_EXT_SUM_SERVICE}->Cliente] Recibido: '{response}'")
            
            # Verificar si la respuesta del servicio externo fue un error
            if response.startswith("ERROR:"):
                print(f"[Cliente] Error del servicio de suma externo: {response}")
                return None
            return float(response) # Asumimos que el servicio devuelve el número directamente
    except Exception as e:
        print(f"[Cliente] Error llamando al servicio de suma externo: {e}")
        return None

if __name__ == "__main__":
    print("Calculadora Cliente SOA")
    print("----------------------")

    try:
        n1_str = input("Introduce el primer número: ")
        n2_str = input("Introduce el segundo número: ")
        # Validar que son números antes de enviarlos
        float(n1_str)
        float(n2_str)
    except ValueError:
        print("Entrada inválida. Por favor, introduce números.")
        sys.exit(1)

    # --- PASO 1: Usar nuestro servicio de suma externo ---
    print("\n--- Interactuando con el SERVICIO DE SUMA EXTERNO ---")
    external_sum_result = call_external_sum_service(n1_str, n2_str)

    if external_sum_result is not None:
        print(f"[Cliente] Resultado de SumService externo: {external_sum_result}")
    else:
        print("[Cliente] No se pudo obtener resultado del servicio de suma externo.")

    # --- PASO 2: Interactuar con el BUS SOA (jrgiadach/soabus:v1) ---
    # Vamos a enviar los números originales al servicio 'sumar' del bus.
    print("\n--- Interactuando con el BUS SOA (jrgiadach/soabus:v1) ---")
    data_for_soabus_sumar = f"{n1_str} {n2_str}" # ej: "10 20"
    message_for_bus = format_message_for_soabus("sumar", data_for_soabus_sumar)
    
    bus_response_str = communicate_with_soabus(message_for_bus)

    if bus_response_str:
        bus_service, bus_status, bus_data = parse_soabus_response(bus_response_str)
        print("\n[Cliente] Respuesta del BUS SOA:")
        print(f"  Servicio del Bus: {bus_service}")
        print(f"  Estado del Bus:   {bus_status}")
        print(f"  Datos del Bus:    {bus_data}")
    else:
        print("\n[Cliente] No se recibió respuesta del BUS SOA.")

    print("\n--- Fin de la demostración ---")