import jwt from 'jsonwebtoken';
import db from '../config/db.js';

// IMPORTANTE: Esta llave debe ser IGUAL a la del authController.js
// He puesto la misma que usamos en el login ('secreto_super_seguro')
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_super_seguro';

export const authMiddleware = async (req, res, next) => {
  let token;
  
  // 1. Verificar si viene el header Authorization: Bearer <token>
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      
      // 2. Verificar la firma del token
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // 3. Buscar al usuario en la BD para traer sus datos frescos
      // (Mantenemos tu query original que ya usaba nombre_completo, ¡estaba bien!)
      const query = `
        SELECT
          u.id_usuario,
          u.correo,
          u.estatus,
          u.necesita_cambio_pass, -- Agregado para validaciones extra
          r.nombre_rol,
          -- COALESCE toma el primer valor no nulo (Busca en Alumnos, si no, Trabajadores)
          COALESCE(a.nombre_completo, t.nombre_completo, 'Usuario Sistema') AS nombre_completo,
          t.id_almacen, 
          t.id_carrera
        FROM Tbl_Usuarios u
        JOIN Tbl_Roles r ON u.id_rol = r.id_rol
        LEFT JOIN Tbl_Alumnos a ON u.id_usuario = a.id_usuario 
        LEFT JOIN Tbl_Trabajadores t ON u.id_usuario = t.id_usuario
        WHERE u.id_usuario = ?
      `;

      db.query(query, [decoded.id], (err, results) => {
        if (err) {
            console.error("Error SQL en Auth Middleware:", err);
            return res.status(500).json({ error: 'Error al verificar identidad' });
        }

        if (results.length === 0) {
          return res.status(401).json({ error: 'El usuario del token ya no existe.' });
        }
        
        // Guardamos TODA la info del usuario en la petición
        req.usuario = results[0];
        next();
      });

    } catch (error) {
      console.error("Error de Token:", error.message);
      return res.status(401).json({ error: 'Token no válido o expirado' });
    }
  }

  if (!token) {
    // Si no entra al if de arriba, es que no había token
    return res.status(401).json({ error: 'Acceso denegado. No se proporcionó token.' });
  }
};

// --- MIDDLEWARES DE ROLES (Se quedan igual, funcionan bien) ---

export const adminCoordinadorMiddleware = (req, res, next) => {
  if (!req.usuario) {
      return res.status(401).json({ error: 'Usuario no identificado (req.usuario vacío)' });
  }

  const { nombre_rol } = req.usuario;
  
  // 1. Normalizamos a minúsculas para evitar errores (Admin vs admin)
  const rol = nombre_rol ? nombre_rol.toLowerCase().trim() : '';

  console.log(`[AUTH CHECK] Usuario: ${req.usuario.correo} | Rol detectado: '${rol}'`);

  if (rol === 'administrador' || rol === 'coordinador') {
    next();
  } else {
    console.log(`⛔ ACCESO DENEGADO. Se requería admin/coord, se recibió: ${rol}`);
    res.status(403).json({ error: `Acceso denegado. Tu rol es: ${nombre_rol}` });
  }
};

export const almacenistaCoordinadorMiddleware = (req, res, next) => {
  if (!req.usuario) return res.status(401).json({ error: 'Usuario no identificado' });

  const { nombre_rol } = req.usuario;
  const rol = nombre_rol ? nombre_rol.toLowerCase().trim() : '';

  if (rol === 'administrador' || rol === 'coordinador' || rol === 'almacenista') {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado. Permisos insuficientes.' });
  }
};