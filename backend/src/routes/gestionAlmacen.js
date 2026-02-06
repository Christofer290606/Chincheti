import { Router } from 'express';
import { authMiddleware, almacenistaCoordinadorMiddleware } from '../middlewares/auth.js';

// Importar Controladores de Mantenimiento
import { 
  getHistorialUnidad, 
  registrarMantenimiento, 
  finalizarMantenimiento 
} from '../controllers/gestionAlmacenController.js';

// Importar Controladores de Incidencias (NUEVO)
import {
  getIncidencias,
  crearIncidencia,
  resolverIncidencia,
  getDetalleIncidencia
} from '../controllers/incidenciasController.js';

const router = Router();

// ==========================================
// RUTAS DE MANTENIMIENTO
// ==========================================
// Ver historial completo de una unidad (disponible para todos los roles logueados)
router.get('/mantenimiento/:id', authMiddleware, getHistorialUnidad);

// Registrar nuevo mantenimiento (Almacenista/Coord)
router.post('/mantenimiento', authMiddleware, almacenistaCoordinadorMiddleware, registrarMantenimiento);

// Finalizar mantenimiento (Almacenista/Coord)
router.put('/mantenimiento/:id/finalizar', authMiddleware, almacenistaCoordinadorMiddleware, finalizarMantenimiento);


// ==========================================
// RUTAS DE INCIDENCIAS
// ==========================================
// Listar incidencias (filtro ?estado=Abierta opcional)
router.get('/incidencias', authMiddleware, getIncidencias);

// Detalle de una incidencia
router.get('/incidencias/:id', authMiddleware, getDetalleIncidencia);

// Crear incidencia
router.post('/incidencias', authMiddleware, crearIncidencia);

// Resolver/Cerrar incidencia (Almacenista/Coord)
router.put('/incidencias/:id/resolver', authMiddleware, almacenistaCoordinadorMiddleware, resolverIncidencia);

export default router;