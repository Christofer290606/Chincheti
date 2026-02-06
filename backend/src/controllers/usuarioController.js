import db, { DB_AES_KEY } from '../config/db.js';
import nodemailer from 'nodemailer'; 
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// --- HELPER: VALIDAR PERMISOS Y JERARQUÍA ---
const validarPermisosCreacion = async (usuarioSolicitante, datosNuevo, nombreRolNuevo, connection) => {
    // Si el solicitante es SUPER ADMIN (Rol 'administrador'), tiene pase libre
    // (Asumiendo que 'administrador' es el rol más alto)
    const rolSolicitante = usuarioSolicitante.nombre_rol || usuarioSolicitante.rol;

    if (rolSolicitante === 'administrador') {
        return true; // Puede crear lo que sea
    }

    // REGLAS PARA COORDINADOR
    if (rolSolicitante === 'coordinador') {
        // 1. Restricción de Roles: Solo puede crear niveles inferiores
        const rolesPermitidos = ['maestro', 'almacenista', 'alumno'];
        if (!rolesPermitidos.includes(nombreRolNuevo)) {
            throw new Error(`⛔ Acceso Denegado: Como Coordinador NO puedes crear un usuario con rol '${nombreRolNuevo}'.`);
        }

        // 2. Restricción de Carrera (Mismo Departamento)
        // Obtenemos la carrera del Coordinador actual
        const [coordData] = await connection.query(
            "SELECT id_carrera FROM Tbl_Trabajadores WHERE id_usuario = ?", 
            [usuarioSolicitante.id_usuario]
        );

        if (coordData.length === 0 || !coordData[0].id_carrera) {
            throw new Error("Error de integridad: Tu usuario de Coordinador no tiene carrera asignada.");
        }

        const idCarreraCoord = coordData[0].id_carrera;
        const idCarreraNuevo = datosNuevo.id_carrera;

        if (parseInt(idCarreraNuevo) !== parseInt(idCarreraCoord)) {
            throw new Error(`⛔ Violación de Área: Solo puedes registrar usuarios para tu carrera (ID: ${idCarreraCoord}). Intentaste registrar en ID: ${idCarreraNuevo}`);
        }

        return true; // Todo correcto
    }

    // Si es otro rol (ej. Almacenista, Alumno) intentando crear usuarios
    throw new Error("⛔ No tienes permisos para crear usuarios.");
};

// --- LISTAR USUARIOS ---
// LISTAR USUARIOS (CON FILTRO DE SEGURIDAD POR ROL)
export const getUsuarios = async (req, res) => {
    try {
        const usuarioSolicitante = req.usuario; // Viene del token JWT
        const rolSolicitante = usuarioSolicitante.nombre_rol || usuarioSolicitante.rol;
        const idSolicitante = usuarioSolicitante.id_usuario;

        const connection = await db.promise();
        
        let condicionesSQL = "";
        let paramsSQL = [];

        // 1. DEFINIR REGLAS DE VISIBILIDAD
        if (rolSolicitante === 'administrador') {
            // REGLA: Administradores solo ven otros Admins y Coordinadores
            condicionesSQL = "AND r.nombre_rol IN ('administrador', 'coordinador')";
        } 
        else if (rolSolicitante === 'coordinador') {
            // REGLA: Coordinadores ven Alumnos, Maestros y Almacenistas...
            // ...PERO SOLO DE SU MISMA CARRERA.
            
            // Primero obtenemos la carrera del Coordinador
            const [coordData] = await connection.query(
                "SELECT id_carrera FROM Tbl_Trabajadores WHERE id_usuario = ?", 
                [idSolicitante]
            );

            if (!coordData.length || !coordData[0].id_carrera) {
                return res.status(403).json({ error: "No tienes una carrera asignada para ver usuarios." });
            }
            const idCarrera = coordData[0].id_carrera;

            // Filtramos por roles permitidos
            condicionesSQL += " AND r.nombre_rol IN ('alumno', 'maestro', 'almacenista')";
            
            // Filtramos por carrera (Revisando tanto tabla Alumnos como Trabajadores)
            // Lógica: (Es alumno de mi carrera OR Es trabajador de mi carrera)
            condicionesSQL += " AND ( (a.id_carrera = ?) OR (t.id_carrera = ?) )";
            paramsSQL.push(idCarrera, idCarrera);
        } 
        else {
            // Otros roles (ej. Almacenista, Alumno) no deberían ver la lista completa
            // Opcional: Retornar solo su propio perfil o array vacío
            return res.json({ usuarios: [] });
        }

        // 2. EJECUTAR CONSULTA
        const query = `
            SELECT 
                u.id_usuario, u.correo, u.estatus, r.nombre_rol as rol,
                COALESCE(t.nombre_completo, a.nombre_completo, 'Sin Nombre') as nombre_completo,
                
                a.semestre, a.registro, 
                
                c_alum.nombre_carrera as carrera_alumno,
                t.id_almacen, alm.nombre_almacen,
                t.id_carrera as id_carrera_trabajador, c_trab.nombre_carrera as carrera_trabajador
            FROM Tbl_Usuarios u
            JOIN Tbl_Roles r ON u.id_rol = r.id_rol
            LEFT JOIN Tbl_Trabajadores t ON u.id_usuario = t.id_usuario
            LEFT JOIN Tbl_Alumnos a ON u.id_usuario = a.id_usuario
            LEFT JOIN Tbl_Carreras c_alum ON a.id_carrera = c_alum.id_carrera
            LEFT JOIN Tbl_Almacenes alm ON t.id_almacen = alm.id_almacen
            LEFT JOIN Tbl_Carreras c_trab ON t.id_carrera = c_trab.id_carrera
            
            WHERE u.estatus != 'Eliminado' 
            ${condicionesSQL}
            
            ORDER BY nombre_completo ASC
        `;

        const [users] = await connection.query(query, paramsSQL);
        res.json({ usuarios: users });

    } catch (e) { 
        console.error("Error al listar usuarios:", e);
        res.status(500).json({ error: 'Error al listar usuarios' }); 
    }
};

// --- CREAR USUARIO (CON VALIDACIÓN DE ROLES) ---
export const crearUsuario = async (req, res) => {
  const { nombre, correo, password, id_rol, id_carrera, semestre, id_almacen, registro } = req.body;
  const usuarioSolicitante = req.usuario; // Obtenido del token JWT (middleware auth)

  if (!nombre || !correo || !password || !id_rol) {
      return res.status(400).json({ error: 'Faltan campos obligatorios generales.' });
  }

  const connection = await db.promise().getConnection();
  
  try {
      await connection.beginTransaction();

      // 1. Obtener nombre del rol nuevo para validaciones
      const [rolData] = await connection.query("SELECT nombre_rol FROM Tbl_Roles WHERE id_rol = ?", [id_rol]);
      if (rolData.length === 0) throw new Error("Rol inválido");
      const nombre_rol_nuevo = rolData[0].nombre_rol.toLowerCase();

      // 2. [SEGURIDAD] Validar Permisos Jerárquicos
      await validarPermisosCreacion(usuarioSolicitante, req.body, nombre_rol_nuevo, connection);

      // 3. Validar duplicados (Correo) antes de insertar
      const [existeCorreo] = await connection.query("SELECT id_usuario FROM Tbl_Usuarios WHERE correo = ?", [correo]);
      if (existeCorreo.length > 0) throw new Error(`El correo ${correo} ya está registrado.`);

      // 4. Validaciones de Datos Específicos
      if (nombre_rol_nuevo === 'alumno') {
          if (!id_carrera) throw new Error("La CARRERA es obligatoria para alumnos.");
          if (!semestre) throw new Error("El SEMESTRE es obligatorio para alumnos.");
          if (!registro) throw new Error("El REGISTRO es obligatorio para alumnos.");
          
          // Validar duplicado de Registro
          const [existeReg] = await connection.query("SELECT id_usuario FROM Tbl_Alumnos WHERE registro = ?", [registro]);
          if (existeReg.length > 0) throw new Error(`El Registro ${registro} ya existe.`);
      }

      if (nombre_rol_nuevo === 'almacenista') {
          if (!id_almacen) throw new Error("El Almacenista debe tener asignado un Almacén.");
          if (!id_carrera) throw new Error("El Almacenista debe pertenecer a una Carrera.");
      }
      
      if (nombre_rol_nuevo === 'coordinador' && !id_carrera) {
          throw new Error("El Coordinador debe estar asignado a una Carrera.");
      }

      // 5. INSERTAR USUARIO (Usando AES_ENCRYPT como en tu sistema actual)
      const [userRes] = await connection.query(
          `INSERT INTO Tbl_Usuarios (correo, password, id_rol, estatus, necesita_cambio_pass, primera_sesion) 
           VALUES (?, AES_ENCRYPT(?, '${DB_AES_KEY}'), ?, 'Activo', 1, 1)`,
          [correo, password, id_rol]
      );
      const id_usuario = userRes.insertId;

      // 6. INSERTAR PERFIL ESPECÍFICO
      if (nombre_rol_nuevo === 'alumno') {
          await connection.query(
              `INSERT INTO Tbl_Alumnos (id_usuario, nombre_completo, id_carrera, semestre, registro) VALUES (?, ?, ?, ?, ?)`,
              [id_usuario, nombre, id_carrera, semestre, registro]
          );
      } else {
          // Trabajadores (Maestro, Coord, Almacenista, Admin)
          // Nota: Admin puede no tener carrera, enviamos null si no viene
          await connection.query(
              `INSERT INTO Tbl_Trabajadores (id_usuario, nombre_completo, id_almacen, id_carrera) VALUES (?, ?, ?, ?)`,
              [id_usuario, nombre, id_almacen || null, id_carrera || null]
          );
      }

      await connection.commit();

      // 7. ENVIAR CORREO
      try {
        await transporter.sendMail({
            from: '"Sistema Inventario CETI" <no-reply@ceti.mx>',
            to: correo,
            subject: 'Bienvenido al Sistema de Inventario CETI',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
                    <h3 style="color: #003366;">Bienvenido, ${nombre}</h3>
                    <p>Tu cuenta ha sido creada exitosamente por la coordinación.</p>
                    <p><strong>Usuario:</strong> ${correo}</p>
                    <p><strong>Contraseña Temporal:</strong> ${password}</p>
                    <hr>
                    <p><i>Por favor, cambia tu contraseña al iniciar sesión.</i></p>
                </div>
            `
        });
      } catch (mailError) { console.error("Error enviando correo de bienvenida:", mailError); }

      res.status(201).json({ mensaje: 'Usuario creado exitosamente' });

  } catch (error) {
      if (connection) await connection.rollback();
      console.error(error);
      res.status(400).json({ error: error.message });
  } finally {
      if (connection) connection.release();
  }
};

// --- OTRAS FUNCIONES (ACTUALIZAR, ELIMINAR, CATALOGOS) ---
// Se mantienen igual para no afectar otras funcionalidades

export const actualizarUsuario = async (req, res) => {
    const { id } = req.params;
    const { nombre, correo, password, id_rol, id_carrera, semestre, id_almacen, registro, estatus } = req.body;
    
    // Aquí también podrías implementar validación de permisos si lo deseas en el futuro
    
    let connection;
    try {
        connection = await db.promise().getConnection();
        await connection.beginTransaction();

        // Actualizar tabla Usuarios
        let queryUsers = "UPDATE Tbl_Usuarios SET correo=?, id_rol=?, estatus=? WHERE id_usuario=?";
        let paramsUsers = [correo, id_rol, estatus, id];

        if (password) {
            queryUsers = `UPDATE Tbl_Usuarios SET correo=?, id_rol=?, estatus=?, password=AES_ENCRYPT(?, '${DB_AES_KEY}') WHERE id_usuario=?`;
            paramsUsers = [correo, id_rol, estatus, password, id];
        }
        await connection.query(queryUsers, paramsUsers);

        // Identificar tipo de usuario para actualizar detalles
        const [rolData] = await connection.query("SELECT nombre_rol FROM Tbl_Roles WHERE id_rol = ?", [id_rol]);
        const nombre_rol = rolData[0]?.nombre_rol.toLowerCase();

        if (nombre_rol === 'alumno') {
             // Verificar si existe en alumnos, si no (cambio de rol), insertar/actualizar
             const [exists] = await connection.query("SELECT id_usuario FROM Tbl_Alumnos WHERE id_usuario=?",[id]);
             if(exists.length > 0) {
                 await connection.query(
                    "UPDATE Tbl_Alumnos SET nombre_completo=?, id_carrera=?, semestre=?, registro=? WHERE id_usuario=?",
                    [nombre, id_carrera, semestre, registro, id]
                 );
             } else {
                 // Lógica compleja de cambio de rol (opcional)
             }
        } else {
             const [exists] = await connection.query("SELECT id_usuario FROM Tbl_Trabajadores WHERE id_usuario=?",[id]);
             if(exists.length > 0) {
                 await connection.query(
                    "UPDATE Tbl_Trabajadores SET nombre_completo=?, id_almacen=?, id_carrera=? WHERE id_usuario=?",
                    [nombre, id_almacen || null, id_carrera || null, id]
                 );
             }
        }

        await connection.commit();
        res.json({ mensaje: 'Usuario actualizado' });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
};

export const eliminarUsuario = async (req, res) => {
    const { id } = req.params;
    try {
        // Soft delete (cambiar estatus a Inactivo o Baja) es mejor práctica, 
        // pero si quieres eliminar físico:
        await db.promise().query("DELETE FROM Tbl_Usuarios WHERE id_usuario = ?", [id]);
        res.json({ mensaje: 'Usuario eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
};

export const getDatosRegistro = async (req, res) => {
    try {
        const [roles] = await db.promise().query("SELECT * FROM Tbl_Roles");
        const [carreras] = await db.promise().query("SELECT * FROM Tbl_Carreras");
        const [almacenes] = await db.promise().query("SELECT * FROM Tbl_Almacenes");
        res.json({ roles, carreras, almacenes });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al cargar datos de registro' });
    }
};

export const registrarUsuariosMasivo = async (req, res) => {
    const { usuarios } = req.body; 
    const usuarioSolicitante = req.usuario;
    
    if (!usuarios || usuarios.length === 0) {
        return res.status(400).json({ error: "La lista de usuarios está vacía." });
    }

    const connection = await db.promise().getConnection();
    const emailsPorEnviar = []; 

    try {
        await connection.beginTransaction(); 

        for (let i = 0; i < usuarios.length; i++) {
            const usr = usuarios[i];
            const linea = i + 1; 

            // --- VALIDACIONES ---
            if (!usr.nombre || !usr.correo || !usr.id_rol) {
                throw new Error(`Fila ${linea}: Faltan datos obligatorios.`);
            }

            const [rolData] = await connection.query("SELECT nombre_rol FROM Tbl_Roles WHERE id_rol = ?", [usr.id_rol]);
            if (!rolData.length) throw new Error(`Fila ${linea}: Rol inválido.`);
            const nombreRol = rolData[0].nombre_rol.toLowerCase();

            // Validar Permisos (Tu helper existente)
            // await validarPermisosCreacion(usuarioSolicitante, usr, nombreRol, connection); 
            // (Asegúrate de tener importado o definido validarPermisosCreacion aquí arriba)

            if (nombreRol === 'almacenista' && !usr.id_almacen) throw new Error(`Fila ${linea} (${usr.nombre}): Falta Almacén.`);
            if (nombreRol === 'alumno' && !usr.registro) throw new Error(`Fila ${linea} (${usr.nombre}): Falta Registro.`);

            const [dupReg] = await connection.query("SELECT id_usuario FROM Tbl_Alumnos WHERE registro = ?", [usr.registro]);
            if (dupReg.length > 0) throw new Error(`Fila ${linea}: Registro ${usr.registro} duplicado.`);

            const [dupEmail] = await connection.query("SELECT id_usuario FROM Tbl_Usuarios WHERE correo = ?", [usr.correo]);
            if (dupEmail.length > 0) throw new Error(`Fila ${linea}: Correo ${usr.correo} duplicado.`);

            // --- INSERCIÓN ---
            const passFinal = usr.password || ('Ceti' + Math.floor(1000 + Math.random() * 9000));
            
            const [userRes] = await connection.query(
                `INSERT INTO Tbl_Usuarios (correo, password, id_rol, estatus, necesita_cambio_pass, primera_sesion) 
                 VALUES (?, AES_ENCRYPT(?, '${DB_AES_KEY}'), ?, 'Activo', 1, 1)`,
                [usr.correo, passFinal, usr.id_rol]
            );
            const idNuevo = userRes.insertId;

            if (nombreRol === 'alumno') {
                await connection.query(
                    `INSERT INTO Tbl_Alumnos (id_usuario, nombre_completo, id_carrera, semestre, registro) VALUES (?, ?, ?, ?, ?)`,
                    [idNuevo, usr.nombre, usr.id_carrera, usr.semestre || null, usr.registro]
                );
            } else {
                await connection.query(
                    `INSERT INTO Tbl_Trabajadores (id_usuario, nombre_completo, id_almacen, id_carrera) VALUES (?, ?, ?, ?)`,
                    [idNuevo, usr.nombre, usr.id_almacen || null, usr.id_carrera || null]
                );
            }

            // Agregar a la cola
            emailsPorEnviar.push({
                nombre: usr.nombre,
                correo: usr.correo,
                password: passFinal,
                registro: usr.registro
            });
        }

        await connection.commit(); 

        // --- RESPUESTA AL CLIENTE PRIMERO (Para no bloquear la UI) ---
        res.status(201).json({ 
            message: `Carga exitosa. Se registraron ${usuarios.length} usuarios. Los correos se enviarán en segundo plano.` 
        });

        // --- PROCESO EN SEGUNDO PLANO: ENVÍO SECUENCIAL ---
        // No usamos await aquí para que la función registrarUsuariosMasivo termine y libere al frontend
        procesarColaCorreos(emailsPorEnviar);

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error en carga masiva:", error.message);
        res.status(400).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
};

// --- FUNCIÓN ASÍNCRONA PARA PROCESAR CORREOS UNO POR UNO ---
const procesarColaCorreos = async (lista) => {
    console.log(`🚀 [Background] Iniciando envío secuencial de ${lista.length} correos...`);
    
    for (const [index, datos] of lista.entries()) {
        try {
            await transporter.sendMail({
                from: '"Sistema Inventario CETI" <no-reply@ceti.mx>',
                to: datos.correo,
                subject: 'Bienvenido al Sistema de Inventario CETI',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
                        <h3 style="color: #003366;">Bienvenido, ${datos.nombre}</h3>
                        <p>Tu cuenta ha sido creada exitosamente por la coordinación.</p>
                        <p><strong>Usuario:</strong> ${datos.correo}</p>
                        <p><strong>Contraseña Temporal:</strong> ${datos.password}</p>
                        <hr>
                        <p><i>Por favor, cambia tu contraseña al iniciar sesión.</i></p>
                    </div>
                `
            });
            console.log(`✅ [${index + 1}/${lista.length}] Correo enviado a ${datos.correo}`);
        } catch (err) {
            console.error(`❌ [${index + 1}/${lista.length}] Falló envío a ${datos.correo}:`, err.message);
        }

        // ⏳ ESPERA DE 2 SEGUNDOS ENTRE CORREOS (Evita bloqueo de Gmail)
        await delay(2000); 
    }
    console.log("🏁 [Background] Proceso de envío de correos finalizado.");
};