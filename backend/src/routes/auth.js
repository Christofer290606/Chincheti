import { Router } from 'express';
import { login, getPerfil, cambiarContrasenaInicial } from '../controllers/authController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

router.post('/login', login);
router.post('/cambiar-password', cambiarContrasenaInicial); 
router.get('/perfil', authMiddleware, getPerfil);

export default router;