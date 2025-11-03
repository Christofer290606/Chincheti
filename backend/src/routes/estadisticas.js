import { Router } from 'express';
import {
  getResumenGeneral,
  getUsoMateriales,
  getValesPorTipo,
  getIncidenciasPorTipo,
  getRankingMateriales
} from '../controllers/estadisticasController.js';

import {
  authMiddleware,
  almacenistaCoordinadorMiddleware
} from '../middlewares/auth.js';

const router = Router();

/*
 * Estas rutas son de uso exclusivo para Almacenistas, Coordinadores y Administradores
 */
router.use(authMiddleware, almacenistaCoordinadorMiddleware);

// GET /api/estadisticas/resumen - Tarjetas con conteos rápidos
router.get('/resumen', getResumenGeneral);

// GET /api/estadisticas/uso-materiales - Gráfica de uso por categoría
router.get('/uso-materiales', getUsoMateriales);

// GET /api/estadisticas/vales-tipo - Gráfica de vales Clase vs. Extra-clase
router.get('/vales-tipo', getValesPorTipo);

// GET /api/estadisticas/incidencias-tipo - Gráfica de incidencias por tipo
router.get('/incidencias-tipo', getIncidenciasPorTipo);

// GET /api/estadisticas/ranking-materiales - Gráfica de Top 10 materiales más solicitados
router.get('/ranking-materiales', getRankingMateriales);


export default router;