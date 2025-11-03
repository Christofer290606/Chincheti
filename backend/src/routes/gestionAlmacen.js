import { Router } from 'express';
import {
  crearIncidencia,
  getIncidencias,
  getIncidenciaById,
  resolverIncidencia,
  crearRegistroMantenimiento,
  getHistorialMantenimiento,
  completarMantenimiento
} from '../controllers/gestionAlmacenController.js';

// Importamos los middlewares
import {
  authMiddleware,
  almacenistaCoordinadorMiddleware
} from '../middlewares/auth.js';

const router = Router();

/*
 * Estas rutas son de uso exclusivo para Almacenistas, Coordinadores y Administradores
 */
router.use(authMiddleware, almacenistaCoordinadorMiddleware);

// Rutas de Incidencias

// POST /api/gestion/incidencias - Registrar una nueva incidencia
router.post('/incidencias', crearIncidencia);

// GET /api/gestion/incidencias - Obtener listado de incidencias
router.get('/incidencias', getIncidencias);

// GET /api/gestion/incidencias/:id - Ver detalle de una incidencia
router.get('/incidencias/:id', getIncidenciaById);

// PATCH /api/gestion/incidencias/:id/resolver - Marcar una incidencia como cerrada
router.patch('/incidencias/:id/resolver', resolverIncidencia);

// Rutas de Mantenimiento

// POST /api/gestion/mantenimiento - Enviar una unidad a mantenimiento
router.post('/mantenimiento', crearRegistroMantenimiento);

// GET /api/gestion/mantenimiento/:id_unidad - Ver historial de mto. de una unidad
router.get('/mantenimiento/:id_unidad', getHistorialMantenimiento);

// PATCH /api/gestion/mantenimiento/:id/completar - Marcar un mto. como completado
router.patch('/mantenimiento/:id/completar', completarMantenimiento);

export default router;