# services/sum_service.py
import socket
import threading

HOST = 'localhost'
PORT = 5002  # Puerto para este servicio de suma externo

def handle_sum_request(client_socket):
    try:
        # Esperamos recibir datos en formato "NUM1 NUM2"
        request_data = client_socket.recv(1024).decode('utf-8').strip()
        print(f"[SumService@:{PORT}] Recibido: '{request_data}'")

        parts = request_data.split()
        if len(parts) == 2:
            try:
                num1 = float(parts[0])
                num2 = float(parts[1])
                result = num1 + num2
                # Respondemos con el resultado simple, el cliente parseará esto.
                # Podríamos usar un formato como "OK:resultado" o "NK:error"
                response = str(result) 
            except ValueError:
                response = "ERROR:Operandos inválidos. Deben ser números."
        else:
            response = "ERROR:Formato incorrecto. Se esperan dos números separados por espacio."

        client_socket.sendall(response.encode('utf-8'))
        print(f"[SumService@:{PORT}] Enviado: '{response}'")

    except ConnectionResetError:
        print(f"[SumService@:{PORT}] Conexión reseteada por el cliente.")
    except Exception as e:
        print(f"[SumService@:{PORT}] Error: {e}")
    finally:
        client_socket.close()

def start_sum_service():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((HOST, PORT))
    server.listen(5)
    print(f"[SumService] Servicio de suma externo escuchando en {HOST}:{PORT}")

    while True:
        try:
            client_sock, address = server.accept()
            # print(f"[SumService] Conexión aceptada de {address}")
            client_handler = threading.Thread(
                target=handle_sum_request,
                args=(client_sock,)
            )
            client_handler.start()
        except KeyboardInterrupt:
            print("\n[SumService] Deteniendo servicio de suma externo.")
            break
        except Exception as e:
            print(f"[SumService] Error en el bucle principal del servidor: {e}")
            break
    server.close()

if __name__ == "__main__":
    start_sum_service()