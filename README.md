# Sistema de Inventario CETTCEN (CETI)

Sistema integral para la gestión de préstamos, inventario y control de almacenes escolares, desarrollado para manejar múltiples almacenes, carreras y roles de usuario.

##  Tecnologías Utilizadas

### Core
* **Frontend:** React.js (SPA), React Router DOM, Context API.
* **Backend:** Node.js, Express.
* **Base de Datos:** MySQL / MariaDB (con Triggers y Stored Procedures).

### Librerías Clave
* **BWIP-JS:** Generación dinámica de códigos de barras (Code 128).
* **PDFKit / jsPDF:** Generación de reportes y catálogos en PDF.
* **MySQL2:** Conexión a base de datos con soporte de promesas.
* **CORS:** Gestión de seguridad de recursos cruzados.
* **Dotenv:** Manejo de variables de entorno.

##  Funcionalidades Principales

1.  **Gestión de Inventario:**
    * Alta de materiales con lógica de stock (Equipos vs Consumibles).
    * Generación automática de códigos de barras (PNG).
    * Filtros por carrera, tipo de usuario y semestre.

2.  **Sistema de Vales (Préstamos):**
    * Solicitud de material con validación de horarios (evita traslapes).
    * **Multivales:** Soporte para múltiples préstamos diarios (Máx 5).
    * Lista de Espera automática cuando no hay stock.
    * Historial diferenciado para Alumnos y Maestros.

3.  **Control de Devoluciones e Incidencias:**
    * Registro de devoluciones con evaluación de estado físico.
    * Generación automática de incidencias y mantenimiento si el material se devuelve dañado.
    * Cálculo automático de multas por retraso.

4.  **Reportes y Scripts:**
    * Carga Masiva de datos mediante Stored Procedures.
    * Scripts de "Seeding" para generar miles de registros de prueba.
    * Reportes de Rechazos y Préstamos Activos exportables.

