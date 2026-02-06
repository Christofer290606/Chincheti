import db, { DB_AES_KEY } from '../config/db.js';
import jwt from 'jsonwebtoken';

export const login = async (req, res) => {
  const { correo, contrasena } = req.body;

  if (!correo || !correo.includes('@ceti.mx')) {
      return res.status(400).json({ error: 'Debe usar un correo institucional (@ceti.mx)' });
  }

  try {
    const connection = await db.promise();
    
    const query = `
      SELECT 
        u.id_usuario, 
        u.correo, 
        u.necesita_cambio_pass, 
        u.estatus,
        r.nombre_rol as rol,
        t.id_almacen, 
        
        -- [IMPORTANTE] Obtener carrera y semestre
        COALESCE(t.id_carrera, a.id_carrera) as id_carrera,
        a.semestre,  -- <--- ESTE CAMPO FALTABA EN TUS LOGS

        COALESCE(t.nombre_completo, a.nombre_completo, 'Usuario Sistema') as nombre_completo
      FROM Tbl_Usuarios u
      JOIN Tbl_Roles r ON u.id_rol = r.id_rol
      LEFT JOIN Tbl_Trabajadores t ON u.id_usuario = t.id_usuario 
      LEFT JOIN Tbl_Alumnos a ON u.id_usuario = a.id_usuario
      WHERE u.correo = ? AND u.password = AES_ENCRYPT(?, ?)
    `;
    
    const [rows] = await connection.query(query, [correo, contrasena, DB_AES_KEY]);

    if (rows.length === 0) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const usuario = rows[0];

    if (usuario.estatus === 'Bloqueado') {
        return res.status(403).json({ error: 'Usuario bloqueado. Contacte al administrador.' });
    }

    if (usuario.necesita_cambio_pass === 1) {
        return res.status(200).json({
            requirePasswordChange: true,
            id_usuario: usuario.id_usuario,
            mensaje: 'Por seguridad, debe cambiar su contraseña inicial.'
        });
    }

    const token = jwt.sign(
      { 
        id: usuario.id_usuario, 
        rol: usuario.rol, 
        correo: usuario.correo,
        semestre: usuario.semestre // Agregamos semestre al token también
      },
      process.env.JWT_SECRET || 'secreto_super_seguro',
      { expiresIn: '8h' }
    );

    res.json({
      token,
      usuario: {
        id_usuario: usuario.id_usuario,
        nombre_completo: usuario.nombre_completo,
        rol: usuario.rol,
        correo: usuario.correo,
        estatus: usuario.estatus,
        id_almacen: usuario.id_almacen,
        id_carrera: usuario.id_carrera || null,
        
        // [IMPORTANTE] Enviar semestre al frontend
        semestre: usuario.semestre || 0 
      }
    });

  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// --- CAMBIO DE CONTRASEÑA OBLIGATORIO ---
export const cambiarContrasenaInicial = async (req, res) => {
  const { id_usuario, nuevaContrasena } = req.body;

  if (nuevaContrasena.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const query = `
        UPDATE Tbl_Usuarios 
        SET password = AES_ENCRYPT(?, ?), 
            necesita_cambio_pass = 0,
            primera_sesion = 0 
        WHERE id_usuario = ?
    `;
    await db.promise().query(query, [nuevaContrasena, DB_AES_KEY, id_usuario]);

    res.status(200).json({ mensaje: 'Contraseña actualizada. Por favor inicie sesión.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar contraseña' });
  }
};

export const getPerfil = async (req, res) => {
    res.json(req.usuario);
};