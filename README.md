# Proyecto de Arquitectura de Software - Arquitectura SOA
Este repositorio contiene el proyecto realizado el 2025 del curso de Arquitectura de Software de la Universidad Diego Portales (UDP).

## Prerrequisitos
* Tener Docker y Docker Compose instalados (Docker Desktop).

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
    El Bus estará escuchando en `localhost:5000`.

3. Para detener el bus:
    ```bash
    docker-compose down
    ```