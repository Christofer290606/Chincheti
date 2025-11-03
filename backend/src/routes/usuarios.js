import { Router } from 'express';
import {
  getUsuarios,
  getUsuarioById,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario
} from '../controllers/usuarioController.js';
import { authMiddleware, adminCoordinadorMiddleware } from '../middlewares/auth.js';

const router = Router();



// GET /api/usuarios - Obtener lista de usuarios
router.get(
  '/',
  authMiddleware, 
  adminCoordinadorMiddleware,
  getUsuarios
);

// GET /api/usuarios/:id - Obtener un usuario por ID
router.get(
  '/:id',
  authMiddleware,
  adminCoordinadorMiddleware,
  getUsuarioById
);

// POST /api/usuarios - Crear un nuevo usuario
router.post(
  '/',
  authMiddleware,
  adminCoordinadorMiddleware,
  crearUsuario
);

// PUT /api/usuarios/:id - Actualizar un usuario
router.put(
  '/:id',
  authMiddleware,
  adminCoordinadorMiddleware,
  actualizarUsuario
);

// DELETE /api/usuarios/:id - Eliminar un usuario
router.delete(
  '/:id',
  authMiddleware,
  adminCoordinadorMiddleware,
  eliminarUsuario
);

export default router;