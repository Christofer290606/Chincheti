import { Router } from 'express';
import { loginUsuario, cambiarPassword } from '../controllers/authController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', loginUsuario);

// POST /api/auth/cambiar-password
// solo un usuario logueado, con token, puede cambiar su pass
router.post('/cambiar-password', authMiddleware, cambiarPassword);

export default router;