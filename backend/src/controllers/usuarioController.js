import db  from '../config/db.js'; 
import { randomBytes } from 'crypto';


const AES_SECRET_KEY = process.env.AES_SECRET_KEY || 'una-llave-secreta-muy-larga';


const generarPasswordTemporal = () => {
  return randomBytes(4).toString('hex'); // 8 caracteres
};

/**
 * GET /api/usuarios
 * Obtiene una lista paginada de todos los usuarios.
 */
export const getUsuarios = async (req, res) => {
  try {
    // Consulta para unir Usuarios con sus perfiles
    const query = `
      SELECT
        u.id_usuario,
        u.correo,
        u.estatus,
        r.nombre_rol,
        COALESCE(a.nombre_completo, t.nombre_completo) AS nombre_completo
      FROM Tbl_Usuarios u
      JOIN Tbl_Roles r ON u.id_rol = r.id_rol
      LEFT JOIN Tbl_Alumnos a ON u.id_usuario = a.id_usuario AND r.nombre_rol = 'alumno'
      LEFT JOIN Tbl_Trabajadores t ON u.id_usuario = t.id_usuario AND r.nombre_rol != 'alumno'
      ORDER BY u.id_usuario DESC
    `;
    
    db.query(query, (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al consultar la base de datos' });
      }
      res.status(200).json({ usuarios: results });
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/usuarios/:id
 * Obtiene los detalles de un usuario específico.
 */
export const getUsuarioById = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT
        u.id_usuario,
        u.correo,
        u.estatus,
        u.id_rol,
        r.nombre_rol,
        a.nombre_completo AS nombre_alumno,
        a.semestre,
        a.carrera,
        t.nombre_completo AS nombre_trabajador,
        t.departamento
      FROM Tbl_Usuarios u
      JOIN Tbl_Roles r ON u.id_rol = r.id_rol
      LEFT JOIN Tbl_Alumnos a ON u.id_usuario = a.id_usuario
      LEFT JOIN Tbl_Trabajadores t ON u.id_usuario = t.id_usuario
      WHERE u.id_usuario = ?
    `;

    db.query(query, [id], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al consultar la base de datos' });
      }
      if (results.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      // Formatea la respuesta
      const r = results[0];
      const esAlumno = r.nombre_rol === 'alumno';
      
      const usuario = {
        id_usuario: r.id_usuario,
        correo: r.correo,
        estatus: r.estatus,
        id_rol: r.id_rol,
        perfil: esAlumno
          ? {
              nombre_completo: r.nombre_alumno,
              semestre: r.semestre,
              carrera: r.carrera
            }
          : {
              nombre_completo: r.nombre_trabajador,
              departamento: r.departamento
            }
      };

      res.status(200).json(usuario);
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/usuarios
 * Crea un nuevo usuario, Alumno o Trabajador, usando una transacción.
 */
export const crearUsuario = async (req, res) => {
  const { nombre_completo, correo, id_rol, perfil_data = {} } = req.body;
  const { semestre, carrera, departamento } = perfil_data;
  
  if (!nombre_completo || !correo || !id_rol) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  
  // Cifrado AES
  const passwordTemporal = generarPasswordTemporal();
  
  try {
    db.beginTransaction(async (err) => {
      if (err) throw err;

      // 1. Insertar en Tbl_Usuarios
      const queryUsuario = "INSERT INTO Tbl_Usuarios (correo, password, id_rol, primera_sesion) VALUES (?, AES_ENCRYPT(?, ?), ?, ?)";
      const paramsUsuario = [correo, passwordTemporal, AES_SECRET_KEY, id_rol, true]; // [RQF1.1]

      db.query(queryUsuario, paramsUsuario, (err, resultUsuario) => {
        if (err) {
          return db.rollback(() => {
            console.error(err);
            res.status(500).json({ error: 'Error al crear el usuario', detalle: err.code });
          });
        }

        const nuevoUsuarioId = resultUsuario.insertId;
        let queryPerfil, paramsPerfil;

        // 2. Insertar en Tbl_Alumnos o Tbl_Trabajadores
        const rolQuery = "SELECT nombre_rol FROM Tbl_Roles WHERE id_rol = ?";
        
        db.query(rolQuery, [id_rol], (err, roles) => {
          if (err || roles.length === 0) {
            return db.rollback(() => res.status(400).json({ error: 'Rol no válido' }));
          }

          const esAlumno = roles[0].nombre_rol === 'alumno';

          if (esAlumno) {
            if (!semestre || !carrera) {
              return db.rollback(() => res.status(400).json({ error: 'Faltan semestre y carrera para el alumno' }));
            }
            queryPerfil = "INSERT INTO Tbl_Alumnos (id_usuario, nombre_completo, semestre, carrera) VALUES (?, ?, ?, ?)";
            paramsPerfil = [nuevoUsuarioId, nombre_completo, semestre, carrera];
          } else {
            queryPerfil = "INSERT INTO Tbl_Trabajadores (id_usuario, nombre_completo, departamento) VALUES (?, ?, ?)";
            paramsPerfil = [nuevoUsuarioId, nombre_completo, departamento || null];
          }

          db.query(queryPerfil, paramsPerfil, (err, resultPerfil) => {
            if (err) {
              return db.rollback(() => {
                console.error(err);
                res.status(500).json({ error: 'Error al crear el perfil del usuario' });
              });
            }

            db.commit((err) => {
              if (err) {
                return db.rollback(() => res.status(500).json({ error: 'Error al confirmar la transacción' }));
              }
              res.status(201).json({
                mensaje: 'Usuario creado exitosamente',
                id_usuario: nuevoUsuarioId,
                password_temporal: passwordTemporal 
              });
            });
          });
        });
      });
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/usuarios/:id
 * Actualiza un usuario.
 */
export const actualizarUsuario = async (req, res) => {
  const { id } = req.params;
  const { id_rol, estatus, perfil } = req.body;
  const { nombre_completo, semestre, carrera, departamento } = perfil;

  if (!id_rol || !estatus || !perfil || !nombre_completo) {
     return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    db.beginTransaction(async (err) => {
      if (err) throw err;

      // 1. Actualizar Tbl_Usuarios
      const queryUsuario = "UPDATE Tbl_Usuarios SET id_rol = ?, estatus = ? WHERE id_usuario = ?";
      db.query(queryUsuario, [id_rol, estatus, id], (err, resultUsuario) => {
        if (err || resultUsuario.affectedRows === 0) {
          return db.rollback(() => res.status(404).json({ error: 'Usuario no encontrado o error al actualizar' }));
        }

        // 2. Determinar si es Alumno o Trabajador
        const rolQuery = "SELECT nombre_rol FROM Tbl_Roles WHERE id_rol = ?";
        db.query(rolQuery, [id_rol], (err, roles) => {
          if (err || roles.length === 0) {
            return db.rollback(() => res.status(400).json({ error: 'Rol no válido' }));
          }

          const esAlumno = roles[0].nombre_rol === 'alumno';
          let queryPerfil, paramsPerfil;

          // 3. Actualizar perfil correspondiente
          if (esAlumno) {
            queryPerfil = "UPDATE Tbl_Alumnos SET nombre_completo = ?, semestre = ?, carrera = ? WHERE id_usuario = ?";
            paramsPerfil = [nombre_completo, semestre || null, carrera || null, id];
          } else {
            queryPerfil = "UPDATE Tbl_Trabajadores SET nombre_completo = ?, departamento = ? WHERE id_usuario = ?";
            paramsPerfil = [nombre_completo, departamento || null, id];
          }

          db.query(queryPerfil, paramsPerfil, (err, resultPerfil) => {
            if (err) {
              return db.rollback(() => res.status(500).json({ error: 'Error al actualizar el perfil' }));
            }

            db.commit((err) => {
              if (err) {
                return db.rollback(() => res.status(500).json({ error: 'Error al confirmar la transacción' }));
              }
              res.status(200).json({ mensaje: 'Usuario actualizado exitosamente' });
            });
          });
        });
      });
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * DELETE /api/usuarios/:id
 * Elimina un usuario.
 */
export const eliminarUsuario = async (req, res) => {
  const { id } = req.params;

  try {

    const query = "DELETE FROM Tbl_Usuarios WHERE id_usuario = ?";
    
    db.query(query, [id], (err, result) => {
      if (err) {
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ error: 'No se puede eliminar el usuario porque tiene préstamos o incidencias activas.' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Error al eliminar el usuario' });
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.status(200).json({ mensaje: 'Usuario eliminado exitosamente' });
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};