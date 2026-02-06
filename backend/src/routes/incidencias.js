import { Router } from 'express';
import { 
    getIncidencias, 
    crearIncidencia, 
    resolverIncidencia, 
    getDetalleIncidencia,
    getMisIncidencias,
    getTiposIncidencia,
    getUnidadesParaSelect 
} from '../controllers/incidenciasController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

// 1. Rutas específicas (STATIC FIRST) - El orden importa
router.get('/mis-incidencias', authMiddleware, getMisIncidencias);
router.get('/tipos', authMiddleware, getTiposIncidencia);
router.get('/unidades-select', authMiddleware, getUnidadesParaSelect); // <--- NUEVA RUTA RQF28

// 2. Rutas generales
router.get('/', authMiddleware, getIncidencias);
router.post('/', authMiddleware, crearIncidencia);

// 3. Rutas parametrizadas (DYNAMIC LAST)
router.get('/:id', authMiddleware, getDetalleIncidencia);
router.put('/:id/resolver', authMiddleware, resolverIncidencia);

export default router;