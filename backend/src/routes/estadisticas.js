import { Router } from 'express';
import { 
  getResumen, 
  getCatalogosEstadisticas,
  getUsoMateriales,
  getValesTipo,
  getIncidenciasTipo,
  getRankingMateriales,
  getEstadoInventario,
  getMantenimientos,      // <--- Nuevo
  getCumplimientoEntregas // <--- Nuevo
} from '../controllers/estadisticasController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

router.get('/resumen', authMiddleware, getResumen);
router.get('/catalogos', authMiddleware, getCatalogosEstadisticas);

router.get('/uso-materiales', authMiddleware, getUsoMateriales);
router.get('/vales-tipo', authMiddleware, getValesTipo);
router.get('/incidencias-tipo', authMiddleware, getIncidenciasTipo);
router.get('/ranking-materiales', authMiddleware, getRankingMateriales);
router.get('/inventario-estado', authMiddleware, getEstadoInventario);

// Rutas Nuevas RQF18
router.get('/mantenimientos', authMiddleware, getMantenimientos);
router.get('/cumplimiento', authMiddleware, getCumplimientoEntregas);

export default router;