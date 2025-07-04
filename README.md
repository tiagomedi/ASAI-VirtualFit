# Proyecto de Arquitectura de Software - Arquitectura SOA
Este repositorio contiene el proyecto realizado el 2025 del curso de Arquitectura de Software de la Universidad Diego Portales (UDP).

## Prerrequisitos
Tener Docker y Docker Compose instalados (Docker Desktop).

## Configuración y Ejecución del Bus de Servicios
1. Clona este repositorio:
    ```bash
    git clone https://github.com/i-samedi/ASAI-VirtualFit.git
    cd ASAI-VIRTUALFIT
    ```
2. Levantar el Bus de Servicios usando Docker Compose:
    ```bash
    docker-compose up -d
    ```
    Esto descargará la imagen `jrgiadach/soabus:v1` y la ejecutará en segundo plano.
    El Bus estará escuchando en `5001:5000`.

3. Para detener el bus:
    ```bash
    docker-compose down
    ```

## Pasos a ejecutar para `example_client.py` y `example_services.py`
1. Inicia el BUS SOA (soabus):
    * Abre una terminal en la raíz.
    * `docker-compose up -d`
    1.1. Para reiniciar el bus rapidamente:
    * `docker-compose restart soabus`
2. Inicia tu SERVICIO (example_services.py):
    * Abre una nueva terminal.
    * `cd services`
    * `python3 example_services.py`
    * Deberías ver: `Waiting for transaction`
3. Ejecuta el CLIENTE (example_client.py):
    * Abre una tercera terminal.
    * `cd client`
    * `python3 example_client.py`
    * Ingresa los números cuando se te solicite.