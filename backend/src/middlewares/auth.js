import jwt from 'jsonwebtoken';
import db from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'tu-llave-secreta-para-jwt-muy-segura';

/**
 * Middleware de Autenticación. Verifica el Token
 */
export const authMiddleware = async (req, res, next) => {
  let token;
  
  // 1. Leer el token del header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // 2. Verificar el token
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // 3. Obtiene el usuario de la BD y lo adjunta a 'req'
      // Usa el id que guarda en el payload del token al hacer login
      const query = `
        SELECT
          u.id_usuario,
          u.correo,
          u.estatus,
          r.nombre_rol
        FROM Tbl_Usuarios u
        JOIN Tbl_Roles r ON u.id_rol = r.id_rol
        WHERE u.id_usuario = ?
      `;

      db.query(query, [decoded.id], (err, results) => {
        if (err || results.length === 0) {
          return res.status(401).json({ error: 'Usuario no encontrado o token inválido' });
        }
        
        // 4. Adjunta el usuario al request para usarlo en los controladores
        req.usuario = results[0];
        
        // 5. Pasa a la siguiente función
        next();
      });

    } catch (error) {
      console.error(error);
      // Token expirado o inválido
      return res.status(401).json({ error: 'Token no válido o expirado' });
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Acceso no autorizado, token no proporcionado' });
  }
};

/**
 * Middleware de Autorización 
 * Este middleware debe ejecutarse despues de authMiddleware
 */
export const adminCoordinadorMiddleware = (req, res, next) => {
  const { nombre_rol } = req.usuario; // req.usuario es añadido por authMiddleware

  if (nombre_rol === 'administrador' || nombre_rol === 'coordinador') {
    next(); // si el usuario tiene permiso, continua
  } else {
    res.status(403).json({ error: 'Acceso denegado. Se requiere rol de Administrador o Coordinador.' });
  }
};

/**
 * Middleware de Autorización para Almacenista o superior
 * Este middleware debe ejecutarse despues de authMiddleware
 */
export const almacenistaCoordinadorMiddleware = (req, res, next) => {
  const { nombre_rol } = req.usuario; // req.usuario es añadido por authMiddleware

  // El admin también debe tener acceso a todo
  if (nombre_rol === 'administrador' || nombre_rol === 'coordinador' || nombre_rol === 'almacenista') {
    next(); // si el usuario tiene permiso, puede continuar
  } else {
    res.status(403).json({ error: 'Acceso denegado. Se requiere rol de Almacenista o superior.' });
  }
};      