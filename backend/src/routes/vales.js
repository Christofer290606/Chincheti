import { Router } from 'express';
import {
  crearVale,
  getVales,
  getValeById,
  gestionarVale,
  registrarEntrega,
  registrarDevolucion
} from '../controllers/valeController.js';

import {
  authMiddleware,
  almacenistaCoordinadorMiddleware,
} from '../middlewares/auth.js';

const router = Router();


// POST /api/vales - Crear una nueva solicitud de vale
router.post(
  '/',
  authMiddleware, // Todos los autenticados pueden crear
  crearVale
);

// GET /api/vales - Obtener lista de vales, filtrada por rol
router.get(
  '/',
  authMiddleware, // Todos ven sus vales o los que gestionan
  getVales
);

// GET /api/vales/:id - Obtener detalle de 1 vale
router.get(
  '/:id',
  authMiddleware, // Todos pueden ver, con la logica de permisos aplicada
  getValeById
);

// PATCH /api/vales/:id/gestion - Aprobar o Rechazar un vale
router.patch(
  '/:id/gestion',
  authMiddleware, // Debería ser Maestro, Almacenista o Coordinador
  gestionarVale
);

// POST /api/vales/:id/entregar - Almacenista registra la entrega, con lector
router.post(
  '/:id/entregar',
  authMiddleware,
  almacenistaCoordinadorMiddleware, // Solo Almacenista/Coordinador
  registrarEntrega
);

// POST /api/vales/:id/devolver - Almacenista registra la devolución, con lector
router.post(
  '/:id/devolver',
  authMiddleware,
  almacenistaCoordinadorMiddleware, // Solo Almacenista/Coord
  registrarDevolucion
);


export default router;