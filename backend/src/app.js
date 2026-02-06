import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Importar Rutas
import authRoutes from './routes/auth.js';
import materialRoutes from './routes/materiales.js';
import estadisticasRoutes from './routes/estadisticas.js';
import gestionRoutes from './routes/gestionAlmacen.js';
import usuariosRoutes from './routes/usuarios.js'; 
import valesRoutes from './routes/vales.js'; 
import incidenciasRoutes from './routes/incidencias.js';
import mantenimientoRoutes from './routes/mantenimiento.js'; 
import configuracionRoutes from './routes/configuracion.js';
import { iniciarCronJobs } from './tasks/cronScheduler.js';

// Configurar variables de entorno
dotenv.config();

const app = express();

// --- 1. CONFIGURACIÓN DE CORS ROBUSTA ---
// Esto es vital para que el botón "Copiar" del frontend pueda descargar la imagen
app.use(cors({
    origin: '*', // Permite peticiones desde cualquier origen (útil para desarrollo)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.use(express.json());

// Logger de Peticiones
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// --- 2. CONFIGURACIÓN DE CARPETAS ESTÁTICAS (CORREGIDA) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // Esto es .../backend/src

// Servir la carpeta 'public' que está en la raíz del backend (.../backend/public)
// De esta forma, si accedes a /barcodes/algo.png, Express lo busca automáticamente ahí.
app.use(express.static(path.join(__dirname, '../public')));

// --- RUTAS API ---
app.use('/api/auth', authRoutes);
app.use('/api/materiales', materialRoutes);
app.use('/api/estadisticas', estadisticasRoutes);
app.use('/api/gestion', gestionRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/vales', valesRoutes); 
app.use('/api/incidencias', incidenciasRoutes);
app.use('/api/mantenimientos', mantenimientoRoutes); 
app.use('/api/configuracion', configuracionRoutes);

// Ruta de prueba base
app.get('/', (req, res) => {
    res.send('API Sistema Inventario CETI - Funcionando 🚀');
});

// Iniciar tareas programadas
iniciarCronJobs();

// --- INICIAR SERVIDOR ---
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 SERVIDOR CORRIENDO EN: http://localhost:${PORT}`);
    console.log(`📁 Carpeta Pública expuesta: ${path.join(__dirname, '../public')}`);
    console.log(`==================================================\n`);
});

export default app;