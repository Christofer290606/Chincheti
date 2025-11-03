import db from '../config/db.js';
import jwt from 'jsonwebtoken';

// Llaves de .env
const AES_SECRET_KEY = process.env.AES_SECRET_KEY || 'una-llave-secreta-muy-larga';
const JWT_SECRET = process.env.JWT_SECRET || 'tu-llave-secreta-para-jwt-muy-segura';

/**
 * Genera un token JWT
 */
const generarToken = (id, rol) => {
  //
  return jwt.sign(
    { id, rol }, // Payload, lo que el token guarda
    JWT_SECRET, 
    { expiresIn: '15m' } 
  );
};


/**
 * POST /api/auth/login
 * Autentica al usuario y devuelve un token
 */
export const loginUsuario = async (req, res) => {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({ error: 'Faltan correo y/o contraseña' });
  }

  try {
    // 1. Busca al usuario y comparamos la contraseña cifrada con AES
    const query = `
      SELECT
        u.id_usuario,
        u.id_rol,
        u.primera_sesion,
        r.nombre_rol,
        COALESCE(a.nombre_completo, t.nombre_completo) AS nombre_completo
      FROM Tbl_Usuarios u
      JOIN Tbl_Roles r ON u.id_rol = r.id_rol
      LEFT JOIN Tbl_Alumnos a ON u.id_usuario = a.id_usuario
      LEFT JOIN Tbl_Trabajadores t ON u.id_usuario = t.id_usuario
      WHERE
        u.correo = ? AND
        CAST(AES_DECRYPT(u.password, ?) AS CHAR) = ?
    `;
    
    db.query(query, [correo, AES_SECRET_KEY, password], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error en la base de datos' });
      }

      // 2. Si no hay resultado, las credenciales son inválidas
      if (results.length === 0) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }
      
      const usuario = results[0];

      // 3. Genera el Token
      const token = generarToken(usuario.id_usuario, usuario.nombre_rol);

      // 4. Envia la respuesta
      res.status(200).json({
        token,
        usuario: {
          id_usuario: usuario.id_usuario,
          nombre_completo: usuario.nombre_completo,
          rol: usuario.nombre_rol,
          primera_sesion: !!usuario.primera_sesion //
        }
      });
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/auth/cambiar-password
 * Cambia la contraseña, usado en primera sesión o por el admin
 */
export const cambiarPassword = async (req, res) => {
  const { nueva_password } = req.body;
  const id_usuario = req.usuario.id_usuario; 

  if (!nueva_password || nueva_password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    // Cifra la nueva contraseña
    const query = `
      UPDATE Tbl_Usuarios
      SET
        password = AES_ENCRYPT(?, ?),
        primera_sesion = 0
      WHERE id_usuario = ?
    `;

    db.query(query, [nueva_password, AES_SECRET_KEY, id_usuario], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al actualizar la contraseña' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.status(200).json({ mensaje: 'Contraseña actualizada exitosamente' });
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};