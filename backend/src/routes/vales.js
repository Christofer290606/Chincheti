import { Router } from 'express';
import {
  crearVale,
  getVales,
  getValeById,
  gestionarVale,
  registrarEntrega,
  registrarDevolucion,
  actualizarVale,
  getAsesores,
  getReporteRechazos,
  cancelarVale,
  getHistorialUsuario,
  getReportePrestamos,
  validarDuplicidadPrevia
} from '../controllers/valeController.js';

import {
  authMiddleware,
  almacenistaCoordinadorMiddleware,
} from '../middlewares/auth.js';

const router = Router();

router.get('/asesores', authMiddleware, getAsesores);

// POST /api/vales
router.post('/', authMiddleware, crearVale);
router.post('/validar-duplicidad', authMiddleware, validarDuplicidadPrevia);

// GET /api/vales
router.get('/', authMiddleware, getVales);

router.get('/reporte-rechazos', authMiddleware, getReporteRechazos);
router.get('/historial/:id_usuario', authMiddleware, getHistorialUsuario);
router.put( 
  '/:id/gestionar', // <--- Debe coincidir con la URL del frontend (/gestionar)
  authMiddleware, 
  gestionarVale
);

router.get('/reporte-prestamos', authMiddleware, getReportePrestamos);
// ----------------------------------

// POST /api/vales/:id/entregar
router.post(
  '/:id/entregar', // Ojo: Verifica si tu frontend llama a 'entregar' o 'entrega'
  authMiddleware,
  almacenistaCoordinadorMiddleware,
  registrarEntrega
);

// POST /api/vales/:id/devolver
router.post(
  '/:id/devolver', // Ojo: Verifica si tu frontend llama a 'devolver' o 'devolucion'
  authMiddleware,
  almacenistaCoordinadorMiddleware,
  registrarDevolucion
);

router.put('/:id/cancelar', authMiddleware, cancelarVale);

// GET /api/vales/:id
router.get('/:id', authMiddleware, getValeById);

// PUT /api/vales/:id
router.put('/:id', authMiddleware, actualizarVale);

export default router;