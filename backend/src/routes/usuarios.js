import { Router } from 'express';
// Asegúrate de que apunte al controlador correcto (singular o plural según tu archivo)
import { getUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario, getDatosRegistro, registrarUsuariosMasivo } from '../controllers/usuarioController.js';

// Importamos los middlewares desde auth.js
import { authMiddleware, adminCoordinadorMiddleware } from '../middlewares/auth.js';

const router = Router();

// --- RUTAS LIMPIAS ---
// El orden es: 1. ¿Tienes Token? (authMiddleware) -> 2. ¿Eres Admin? (adminCoordinadorMiddleware) -> 3. Ejecuta la función
router.get('/datos-registro', authMiddleware, getDatosRegistro);
router.get('/', authMiddleware, adminCoordinadorMiddleware, getUsuarios);
router.post('/', authMiddleware, adminCoordinadorMiddleware, crearUsuario);
router.put('/:id', authMiddleware, adminCoordinadorMiddleware, actualizarUsuario);
router.delete('/:id', authMiddleware, adminCoordinadorMiddleware, eliminarUsuario);
router.post('/masivo', authMiddleware, registrarUsuariosMasivo);

export default router;