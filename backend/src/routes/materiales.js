import { Router } from 'express';
import { authMiddleware, almacenistaCoordinadorMiddleware } from '../middlewares/auth.js';
import { 
  getMateriales, 
  getMaterialById, 
  crearMaterial, 
  actualizarMaterial, 
  getCatalogos,
  bajaUnidad,
  getUnidadByBarcode,
  buscarMaterialesYUnidades 
} from '../controllers/materialController.js';

const router = Router();

// --- RUTAS PÚBLICAS (O REQUIEREN SOLO AUTH) ---
router.get('/', authMiddleware, getMateriales);
router.get('/catalogos', authMiddleware, getCatalogos);

// --- RUTA DE BÚSQUEDA POR BARCODE (NUEVA) ---
// Debe ir ANTES de /:id para evitar conflictos
router.get('/unidad/:barcode', authMiddleware, getUnidadByBarcode);
router.get('/buscador', authMiddleware, buscarMaterialesYUnidades);

// --- DETALLE POR ID ---
router.get('/:id', authMiddleware, getMaterialById);

// --- RUTAS PROTEGIDAS (ALMACENISTA/COORDINADOR) ---
router.post('/', authMiddleware, almacenistaCoordinadorMiddleware, crearMaterial);
router.put('/:id', authMiddleware, almacenistaCoordinadorMiddleware, actualizarMaterial);

// Baja de unidad específica
router.patch('/unidades/:id/baja', authMiddleware, almacenistaCoordinadorMiddleware, bajaUnidad);

export default router;