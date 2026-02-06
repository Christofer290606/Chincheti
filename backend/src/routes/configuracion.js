import { Router } from 'express';
import { 
    getFullConfig, 
    updateUmbrales, 
    manageTipoMantenimiento 
} from '../controllers/configuracionController.js';
import { authMiddleware, almacenistaCoordinadorMiddleware } from '../middlewares/auth.js';

const router = Router();

router.get('/', authMiddleware, almacenistaCoordinadorMiddleware, getFullConfig);
router.put('/umbrales', authMiddleware, almacenistaCoordinadorMiddleware, updateUmbrales);
router.post('/tipos', authMiddleware, almacenistaCoordinadorMiddleware, manageTipoMantenimiento);

export default router;