import { Router } from 'express';
import { 
    registrarMantenimiento, 
    finalizarMantenimiento,
    getConfiguracion,
    updateConfiguracion,
    generarYObtenerAlertas,
    descartarAlerta,
    getHistorialPorUnidad,
    getReporteActivos
} from '../controllers/mantenimientoController.js';
import { authMiddleware, almacenistaCoordinadorMiddleware } from '../middlewares/auth.js';

const router = Router();

// Operaciones
router.post('/', authMiddleware, almacenistaCoordinadorMiddleware, registrarMantenimiento);
router.put('/finalizar', authMiddleware, almacenistaCoordinadorMiddleware, finalizarMantenimiento);

// Configuración (RQNF22.1)
router.get('/configuracion', authMiddleware, getConfiguracion);
router.put('/configuracion', authMiddleware, updateConfiguracion);

// Alertas (RQF22)
router.get('/alertas', authMiddleware, generarYObtenerAlertas);
router.put('/alertas/:id_alerta/descartar', authMiddleware, descartarAlerta);

router.get('/unidad/:id_unidad/historial', authMiddleware, almacenistaCoordinadorMiddleware, getHistorialPorUnidad);
router.get('/reporte-activos', authMiddleware, almacenistaCoordinadorMiddleware, getReporteActivos);

export default router;