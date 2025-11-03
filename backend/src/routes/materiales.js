import { Router } from 'express';
import {
  getCatalogos,
  crearMaterial,
  getMateriales,
  getMaterialById,
  actualizarMaterial,
  bajaUnidad,
  getUnidadByBarcode
} from '../controllers/materialController.js';

import { 
  authMiddleware, 
  almacenistaCoordinadorMiddleware 
} from '../middlewares/auth.js';

const router = Router();


// GET /catalogos -> authMiddleware -> getCatalogos 
router.get(
  '/catalogos',
  authMiddleware,
  getCatalogos
);

// POST /materiales -> authMiddleware -> almacenistaCoordinadorMiddleware -> crearMaterial
router.post(
  '/',
  authMiddleware,
  almacenistaCoordinadorMiddleware,
  crearMaterial
);

router.get(
  '/',
  authMiddleware, // Todos los usuarios autenticados pueden ver la lista
  getMateriales
);

router.get(
  '/:id',
  authMiddleware, // Todos pueden ver el detalle
  getMaterialById
);

router.put(
  '/:id',
  authMiddleware,
  almacenistaCoordinadorMiddleware,
  actualizarMaterial
);

router.get(
  '/unidades/barcode/:barcode',
  authMiddleware, // Solo usuarios autenticados pueden acceder
  getUnidadByBarcode
);

router.patch(
  '/unidades/:id/baja',
  authMiddleware,
  almacenistaCoordinadorMiddleware,
  bajaUnidad
);

export default router;