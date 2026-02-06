import db from '../config/db.js';
import { transporter } from '../config/mailer.js';

// --- HELPER: PROCESAR LISTA DE ESPERA (AUTOMATIZACION) ---
const procesarListaEspera = async (connection, id_vale_liberado) => {
    console.log(`[SISTEMA] Iniciando revision tras liberar Vale ID ${id_vale_liberado}`);
    try {
        // 1. Obtener detalles del vale liberado
        const [valeLiberado] = await connection.query(
            `SELECT fecha_recoleccion, fecha_devolucion_esperada FROM Tbl_Vales WHERE id_vale = ?`, 
            [id_vale_liberado]
        );
        if (!valeLiberado.length) return;

        const { fecha_recoleccion, fecha_devolucion_esperada } = valeLiberado[0];

        // 2. Obtener materiales liberados
        const [materialesLiberados] = await connection.query(
            `SELECT id_material_base FROM Tbl_Vales_Detalle WHERE id_vale = ?`, 
            [id_vale_liberado]
        );
        const idsMateriales = materialesLiberados.map(m => m.id_material_base);

        // 3. Buscar candidatos en espera para cada material
        for (const id_mat of idsMateriales) {
            const query = `
                SELECT DISTINCT v.id_vale, v.id_usuario_solicitante, v.fecha_recoleccion, v.fecha_devolucion_esperada,
                       u.correo, COALESCE(al.nombre_completo, tr.nombre_completo, 'Usuario') as nombre_usuario,
                       m.nombre as nombre_material
                FROM Tbl_Vales v
                JOIN Tbl_Vales_Detalle vd ON v.id_vale = vd.id_vale
                JOIN Tbl_Usuarios u ON v.id_usuario_solicitante = u.id_usuario
                LEFT JOIN Tbl_Alumnos al ON u.id_usuario = al.id_usuario
                LEFT JOIN Tbl_Trabajadores tr ON u.id_usuario = tr.id_usuario
                JOIN Tbl_Materiales m ON vd.id_material_base = m.id_material
                WHERE v.id_estado_vale = 7 
                  AND vd.id_material_base = ? 
                  AND (v.fecha_recoleccion < ? AND v.fecha_devolucion_esperada > ?)
                ORDER BY v.fecha_emision ASC 
                LIMIT 1
            `;
            
            const [candidatos] = await connection.query(query, [id_mat, fecha_devolucion_esperada, fecha_recoleccion]);
            
            if (candidatos.length > 0) {
                const candidato = candidatos[0];
                
                // Determinar nuevo estado (1: Pendiente Maestro, 2: Pendiente Almacenista)
                const [valData] = await connection.query("SELECT id_maestro_responsable FROM Tbl_Vales WHERE id_vale = ?", [candidato.id_vale]);
                const nuevoEstado = valData[0].id_maestro_responsable ? 1 : 2;

                // Promover el vale
                await connection.query(
                    `UPDATE Tbl_Vales SET id_estado_vale = ? WHERE id_vale = ?`, 
                    [nuevoEstado, candidato.id_vale]
                );

                console.log(`[SISTEMA] Vale #${candidato.id_vale} promovido de Lista de Espera a Estado ${nuevoEstado}`);

                // 4. Notificar al usuario
                try {
                    await transporter.sendMail({
                        from: '"Sistema Almacen CETI" <' + process.env.EMAIL_USER + '>',
                        to: candidato.correo,
                        subject: 'Buenas noticias: Tu solicitud ha avanzado',
                        html: `
                            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
                                <h3 style="color: #003366;">Hola, ${candidato.nombre_usuario}</h3>
                                <p>Se ha liberado una unidad de <strong>${candidato.nombre_material}</strong>.</p>
                                <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; border-left: 5px solid #28a745; margin: 20px 0;">
                                    <p style="margin: 0; color: #155724;">
                                        Tu solicitud (Folio <strong>#${candidato.id_vale}</strong>) ha salido de la <strong>Lista de Espera</strong>.
                                    </p>
                                </div>
                                <p>Ahora se encuentra en estado: <strong>Pendiente de Aprobacion</strong>.</p>
                                <p>Por favor, espera la autorizacion de tu maestro o coordinador.</p>
                            </div>
                        `
                    });
                } catch (emailError) {
                    console.error("Error enviando correo lista espera:", emailError.message);
                }
            }
        }
    } catch (error) { 
        console.error("ERROR CRITICO en procesarListaEspera:", error); 
    }
};

const getEstadoId = async (nombreEstado) => {
  const [estado] = await db.promise().query("SELECT id_estado FROM Tbl_Estados_Vales WHERE nombre_estado = ?", [nombreEstado]);
  if (estado.length === 0) throw new Error(`Estado de vale no encontrado: ${nombreEstado}`);
  return estado[0].id_estado;
};

const getEstadoMaterialId = async (nombreEstado) => {
    const [estado] = await db.promise().query("SELECT id_estado FROM Tbl_Estados_Material WHERE nombre_estado = ?", [nombreEstado]);
    if (estado.length === 0) throw new Error(`Estado de material no encontrado: ${nombreEstado}`);
    return estado[0].id_estado;
};

// ... (Controlador getAsesores SE MANTIENE IGUAL) ...
export const getAsesores = async (req, res) => {
    try {
        const usuario = req.usuario;
        const [alumnoData] = await db.promise().query("SELECT id_carrera FROM Tbl_Alumnos WHERE id_usuario = ?", [usuario.id_usuario]);
        const idCarreraAlumno = alumnoData[0]?.id_carrera;
        if (!idCarreraAlumno) return res.json([]); 
        const query = `
            SELECT u.id_usuario, COALESCE(t.nombre_completo, 'Sin Nombre') as nombre
            FROM Tbl_Usuarios u JOIN Tbl_Roles r ON u.id_rol = r.id_rol JOIN Tbl_Trabajadores t ON u.id_usuario = t.id_usuario
            WHERE r.nombre_rol IN ('maestro', 'coordinador') AND u.estatus = 'Activo' AND t.id_carrera = ? ORDER BY nombre ASC
        `;
        const [asesores] = await db.promise().query(query, [idCarreraAlumno]);
        res.json(asesores);
    } catch (error) { console.error(error); res.status(500).json({ error: 'Error al obtener asesores' }); }
};


export const crearVale = async (req, res) => {
  const usuario = req.usuario;
  const rolUsuario = usuario.nombre_rol || usuario.rol; 

  console.log("\n--- PROCESANDO SOLICITUD DE VALE ---");

  const {
    tipo_vale, fecha_recoleccion, fecha_devolucion_esperada, 
    espacio_uso, id_maestro_responsable, motivo_solicitud, materiales,
    forzar_lista_espera 
  } = req.body;

  if (!materiales || materiales.length === 0) return res.status(400).json({ error: 'La lista de materiales no puede estar vacía.' });

  // 1. Validaciones de Horario Básicas
  const fRec = new Date(fecha_recoleccion);
  const fDev = new Date(fecha_devolucion_esperada);
  const now = new Date();
  const hoyZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const recZero = new Date(fRec.getFullYear(), fRec.getMonth(), fRec.getDate());
  
  if (recZero < hoyZero) return res.status(400).json({ error: 'No puedes solicitar vales para fechas pasadas.' });
  if (fRec >= fDev) return res.status(400).json({ error: 'La fecha de devolución debe ser posterior a la recolección.' });
  if (fRec.toDateString() !== fDev.toDateString()) return res.status(400).json({ error: 'La recolección y devolución deben ser el mismo día.' });

  // Fechas SQL
  const sqlRec = fRec.toISOString().slice(0, 19).replace('T', ' ');
  const sqlDev = fDev.toISOString().slice(0, 19).replace('T', ' ');

  const connection = await db.promise().getConnection();
  
  try {
    // Validar Bloqueo Usuario (Global)
    const [userStatus] = await connection.query("SELECT estatus FROM Tbl_Usuarios WHERE id_usuario = ?", [usuario.id_usuario]);
    if (userStatus.length > 0 && userStatus[0].estatus === 'Bloqueado') {
        connection.release(); 
        return res.status(403).json({ error: "ACCESO DENEGADO: Tu cuenta está bloqueada." });
    }

    await connection.beginTransaction();

    
    const [conteoDia] = await connection.query(
        `SELECT COUNT(*) as total 
         FROM Tbl_Vales 
         WHERE id_usuario_solicitante = ? 
         AND DATE(fecha_recoleccion) = DATE(?) 
         AND id_estado_vale NOT IN (4, 6, 8, 9)`,
        [usuario.id_usuario, sqlRec]
    );

    const valesDelDia = parseInt(conteoDia[0].total || 0);
    console.log(`> Vales del día para usuario ${usuario.id_usuario}: ${valesDelDia}`);

    if (valesDelDia >= 5) {
        throw new Error("LÍMITE EXCEDIDO: Ya tienes 5 vales activos para este día.");
    }

    
    const [traslapes] = await connection.query(
        `SELECT id_vale, fecha_recoleccion, fecha_devolucion_esperada 
         FROM Tbl_Vales 
         WHERE id_usuario_solicitante = ? 
         AND id_estado_vale NOT IN (4, 6, 8, 9) -- Solo validar contra vales activos/pendientes
         AND (fecha_recoleccion < ? AND fecha_devolucion_esperada > ?)`,
        [usuario.id_usuario, sqlDev, sqlRec]
    );

    if (traslapes.length > 0) {
        // Existe duplicidad de horario
        console.warn(`> Intento de multivale simultáneo detectado. Choca con Vale #${traslapes[0].id_vale}`);
        throw new Error(`DUPLICIDAD DE HORARIO: Ya tienes el vale #${traslapes[0].id_vale} en este horario. No se permiten vales simultáneos.`);
    }


    let hayFaltaDeStock = false; 
    let mensajeStock = "";
    
    // Si el usuario forzó la entrada (botón amarillo)
    if (forzar_lista_espera === true) {
        hayFaltaDeStock = true;
        mensajeStock = "(Solicitud explícita a Lista de Espera)";
    }

    let idCarreraLote = null;
    let idCarreraAlumno = null;
    if (rolUsuario === 'alumno') {
        const [alum] = await connection.query("SELECT id_carrera FROM Tbl_Alumnos WHERE id_usuario = ?", [usuario.id_usuario]);
        idCarreraAlumno = alum[0]?.id_carrera;
    }

    // Validación de materiales
    for (const item of materiales) {
        const [totalUnidades] = await connection.query(
            `SELECT COUNT(*) as total, m.id_carrera_exclusiva 
             FROM Tbl_Unidades_Material u 
             JOIN Tbl_Materiales m ON u.id_material_base = m.id_material 
             JOIN Tbl_Estados_Material em ON u.id_estado = em.id_estado 
             WHERE u.id_material_base = ? AND em.nombre_estado NOT IN ('Baja', 'Mantenimiento') 
             FOR UPDATE`, 
            [item.id_material_base]
        );
        
        const stockTotalFisico = parseInt(totalUnidades[0].total || 0);
        const carreraMaterial = totalUnidades[0].id_carrera_exclusiva;

        if (stockTotalFisico === 0) throw new Error(`Uno de los materiales seleccionados no está habilitado para préstamo.`);
        
        // Regla de carrera
        if (idCarreraLote === null) idCarreraLote = carreraMaterial;
        else if (idCarreraLote !== carreraMaterial) throw new Error("No puedes mezclar materiales de distintas carreras en un solo vale.");

        // Si NO se forzó espera, verificamos disponibilidad real (Stock - Comprometido)
        if (!hayFaltaDeStock) {
            const [ocupados] = await connection.query(
                `SELECT COALESCE(SUM(vd.cantidad_solicitada), 0) as comprometido 
                 FROM Tbl_Vales_Detalle vd 
                 JOIN Tbl_Vales v ON vd.id_vale = v.id_vale 
                 WHERE vd.id_material_base = ? 
                 AND v.id_estado_vale IN (1, 2, 3, 5) 
                 AND (v.fecha_recoleccion < ? AND v.fecha_devolucion_esperada > ?)`,
                [item.id_material_base, sqlDev, sqlRec]
            );

            const stockComprometido = parseInt(ocupados[0].comprometido || 0);
            const stockDisponibleReal = stockTotalFisico - stockComprometido;

            if (stockDisponibleReal < item.cantidad_solicitada) {
                hayFaltaDeStock = true;
                mensajeStock = `(Sin disponibilidad por conflicto de horario con otros usuarios)`;
            }
        }
    }

    // --- ASIGNACIÓN DE ESTADO ---
    let id_estado_final;
    let maestroFinal = null;
    let espacioFinal = espacio_uso;
    let esSolicitudExterna = (rolUsuario === 'alumno' && idCarreraLote && idCarreraAlumno && idCarreraLote !== idCarreraAlumno);

    if (hayFaltaDeStock) {
        id_estado_final = 7; // LISTA DE ESPERA
        if (rolUsuario === 'alumno' && !esSolicitudExterna) maestroFinal = id_maestro_responsable || null;
    } else {
        // Flujo Normal
        if (esSolicitudExterna) {
             if (!motivo_solicitud || motivo_solicitud.length < 5) throw new Error("El motivo es obligatorio para solicitudes externas.");
             id_estado_final = 2; // Pendiente Almacenista (Maestro no valida externos)
             maestroFinal = null;
        } else if (rolUsuario === 'alumno') {
             if (!id_maestro_responsable) throw new Error("Debes seleccionar un maestro responsable.");
             maestroFinal = id_maestro_responsable;
             id_estado_final = 1; // Pendiente Maestro
        } else {
             id_estado_final = 2; // Pendiente Almacenista (Maestro solicita)
        }
    }

    // Insertar Vale
    const [resultVale] = await connection.query(`
      INSERT INTO Tbl_Vales (
        id_usuario_solicitante, id_estado_vale, tipo_vale, fecha_recoleccion,
        fecha_devolucion_esperada, espacio_uso, motivo_solicitud, id_maestro_responsable,
        fecha_emision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`, 
      [usuario.id_usuario, id_estado_final, tipo_vale, sqlRec,
      sqlDev, espacioFinal, motivo_solicitud || null, maestroFinal]
    );
    
    const id_vale = resultVale.insertId;
    const valores = materiales.map(m => [ id_vale, m.id_material_base, m.cantidad_solicitada ]);
    await connection.query(`INSERT INTO Tbl_Vales_Detalle (id_vale, id_material_base, cantidad_solicitada) VALUES ?`, [valores]);

    await connection.commit();

    if (id_estado_final === 7) {
        res.status(201).json({ 
            mensaje: 'Solicitud agregada a la LISTA DE ESPERA.', 
            id_vale, 
            estado: 'espera',
            nota: mensajeStock
        });
    } else {
        res.status(201).json({ 
            mensaje: 'Solicitud creada exitosamente.', 
            id_vale, 
            estado: 'activo' 
        });
    }

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error Crear Vale:", error.message);
    // Retornamos 409 Conflict si es un problema de reglas de negocio (limites, horarios)
    const status = error.message.includes('LÍMITE') || error.message.includes('DUPLICIDAD') || error.message.includes('BLOQUEO') ? 409 : 400;
    res.status(status).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
};

export const getVales = async (req, res) => {
    try {
        const { id_usuario } = req.usuario; 
        // CORRECCIÓN: Aseguramos leer el rol correctamente sin importar cómo venga en el token
        const rol = req.usuario.nombre_rol || req.usuario.rol; 

        const { estado, busqueda } = req.query; 

        console.log(`[DEBUG] getVales -> Usuario: ${id_usuario}, Rol: ${rol}, Estado: ${estado || 'Todos'}`);

        let query = `
            SELECT 
                v.id_vale, 
                v.fecha_emision, 
                v.fecha_recoleccion, 
                v.fecha_devolucion_esperada, 
                v.id_estado_vale,
                ev.nombre_estado, 
                v.tipo_vale, 
                v.motivo_solicitud,
                
                -- Nombre del Solicitante (Alumno/Trabajador)
                COALESCE(al.nombre_completo, tr.nombre_completo, u.correo) as nombre_solicitante,
                u.correo as correo_solicitante, 
                v.id_usuario_solicitante,
                
                -- Nombre del Maestro Responsable
                COALESCE(m_al.nombre_completo, m_tr.nombre_completo, 'N/A') as nombre_maestro,
                v.id_maestro_responsable
                
            FROM Tbl_Vales v
            LEFT JOIN Tbl_Estados_Vales ev ON v.id_estado_vale = ev.id_estado
            
            -- Joins para Solicitante
            JOIN Tbl_Usuarios u ON v.id_usuario_solicitante = u.id_usuario
            LEFT JOIN Tbl_Alumnos al ON u.id_usuario = al.id_usuario
            LEFT JOIN Tbl_Trabajadores tr ON u.id_usuario = tr.id_usuario
            
            -- Joins para Maestro Responsable
            LEFT JOIN Tbl_Usuarios um ON v.id_maestro_responsable = um.id_usuario
            LEFT JOIN Tbl_Alumnos m_al ON um.id_usuario = m_al.id_usuario
            LEFT JOIN Tbl_Trabajadores m_tr ON um.id_usuario = m_tr.id_usuario
            
            WHERE 1=1
        `;

        const params = [];

        // Lógica de Filtros por Rol
        if (rol === 'alumno') {
            query += " AND v.id_usuario_solicitante = ?";
            params.push(id_usuario);
        } 
        else if (rol === 'maestro') {
            // EL MAESTRO VE:
            // 1. Lo que él mismo pidió (solicitante)
            // 2. Lo que le pidieron a él aprobar (maestro_responsable)
            query += " AND (v.id_usuario_solicitante = ? OR v.id_maestro_responsable = ?)";
            params.push(id_usuario, id_usuario);
        }
        // Coordinadores y Almacenistas ven todo (no entran en los if anteriores)

        if (estado) {
            query += " AND v.id_estado_vale = ?";
            params.push(estado);
        }

        if (busqueda) {
            query += ` AND (
                v.id_vale LIKE ? OR 
                al.nombre_completo LIKE ? OR 
                tr.nombre_completo LIKE ? OR 
                u.correo LIKE ?
            )`;
            const term = `%${busqueda}%`;
            params.push(term, term, term, term);
        }

        query += " ORDER BY v.fecha_emision DESC";

        const [rows] = await db.promise().query(query, params);
        res.json(rows); 

    } catch (error) {
        console.error("Error CRÍTICO en getVales:", error.code, error.sqlMessage);
        res.status(500).json({ error: 'Error al obtener vales: ' + error.message });
    }
};

export const getValeById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const queryVale = `
      SELECT
        v.*,
        ev.nombre_estado,
        COALESCE(a.nombre_completo, t.nombre_completo) AS solicitante_nombre,
        u.correo AS solicitante_correo
      FROM Tbl_Vales v
      JOIN Tbl_Estados_Vales ev ON v.id_estado_vale = ev.id_estado
      JOIN Tbl_Usuarios u ON v.id_usuario_solicitante = u.id_usuario
      LEFT JOIN Tbl_Alumnos a ON u.id_usuario = a.id_usuario
      LEFT JOIN Tbl_Trabajadores t ON u.id_usuario = t.id_usuario
      WHERE v.id_vale = ?;
    `;
    const [vales] = await db.promise().query(queryVale, [id]);
    if (vales.length === 0) {
      return res.status(404).json({ error: 'Vale no encontrado' });
    }
    const vale = vales[0];

    const { id_usuario, nombre_rol } = req.usuario;
    const rol = nombre_rol || req.usuario.rol;

    if (rol === 'alumno' && vale.id_usuario_solicitante !== id_usuario) {
      return res.status(403).json({ error: 'Acceso denegado a este vale' });
    }

    const queryDetalle = `
      SELECT
        vd.id_vale_detalle,
        vd.id_material_base,
        vd.cantidad_solicitada,
        vd.id_unidad_entregada,
        vd.cantidad_entregada,
        m.nombre,
        um.identificador_barcode
      FROM Tbl_Vales_Detalle vd
      JOIN Tbl_Materiales m ON vd.id_material_base = m.id_material
      LEFT JOIN Tbl_Unidades_Material um ON vd.id_unidad_entregada = um.id_unidad
      WHERE vd.id_vale = ?;
    `;
    const [materiales] = await db.promise().query(queryDetalle, [id]);
    
    vale.materiales = materiales;
    res.status(200).json(vale);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el detalle del vale' });
  }
};

export const gestionarVale = async (req, res) => {
  const { id } = req.params;
  const { accion, motivo_rechazo } = req.body; 
  const id_usuario_gestion = req.usuario.id_usuario;

  // Validación básica
  if (accion === 'Rechazar' && (!motivo_rechazo || motivo_rechazo.trim().length < 5)) {
    return res.status(400).json({ error: 'Se requiere un motivo de rechazo valido (minimo 5 caracteres).' });
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    // 1. Obtener datos con bloqueo FOR UPDATE
    const [vales] = await connection.query(`
        SELECT v.*, u.correo, COALESCE(a.nombre_completo, t.nombre_completo) as nombre_solicitante
        FROM Tbl_Vales v
        JOIN Tbl_Usuarios u ON v.id_usuario_solicitante = u.id_usuario
        LEFT JOIN Tbl_Alumnos a ON u.id_usuario = a.id_usuario
        LEFT JOIN Tbl_Trabajadores t ON u.id_usuario = t.id_usuario
        WHERE v.id_vale = ? FOR UPDATE`, 
        [id]
    );
    
    if (vales.length === 0) { 
        return res.status(404).json({ error: 'Vale no encontrado' }); 
    }
    
    const vale = vales[0];
    const estadoActual = vale.id_estado_vale;
    let nuevo_estado_id = null;
    let motivo = null;

    // Lógica de transición
    if (accion === 'Aprobar') {
        if (estadoActual === 1) nuevo_estado_id = 3; 
        else if (estadoActual === 2) nuevo_estado_id = 3; 
        else { 
            return res.status(400).json({ error: `Estado no valido para aprobar (Estado actual: ${estadoActual}).` }); 
        }
    } else {
        nuevo_estado_id = 4; // Rechazado
        motivo = motivo_rechazo;
    }

    // 2. Actualizar la BD
    await connection.query(
      "UPDATE Tbl_Vales SET id_estado_vale = ?, id_usuario_gestion = ?, motivo_rechazo = ? WHERE id_vale = ?", 
      [nuevo_estado_id, id_usuario_gestion, motivo, id]
    );

    // 3. Si se rechazó, liberamos lista de espera DENTRO de la transacción
    if (accion === 'Rechazar') {
        await procesarListaEspera(connection, id);
    }
    
    // 4. Confirmar cambios
    await connection.commit();

    // --- ENVÍO DE CORREO (Fuera de la lógica crítica de BD) ---
    try {
        let asunto = "";
        let htmlContent = "";
        const fechaRec = new Date(vale.fecha_recoleccion).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
        const fechaDev = new Date(vale.fecha_devolucion_esperada).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

        if (accion === 'Aprobar') {
            asunto = `Solicitud Aprobada - Folio #${id}`;
            htmlContent = `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
                    <h2 style="color: #28a745;">Tu solicitud ha sido APROBADA!</h2>
                    <p>Hola <strong>${vale.nombre_solicitante}</strong>,</p>
                    <p>Tu solicitud de material con folio <strong>#${id}</strong> ha sido autorizada.</p>
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <h4 style="margin-top:0;">Detalles:</h4>
                        <ul>
                            <li><strong>Recoleccion:</strong> ${fechaRec}</li>
                            <li><strong>Devolucion:</strong> ${fechaDev}</li>
                        </ul>
                    </div>
                </div>
            `;
        } else {
            asunto = `Solicitud Rechazada - Folio #${id}`;
            htmlContent = `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
                    <h2 style="color: #dc3545;">Tu solicitud ha sido RECHAZADA</h2>
                    <p>Hola <strong>${vale.nombre_solicitante}</strong>,</p>
                    <div style="background-color: #fff5f5; padding: 15px; border-left: 5px solid #dc3545; margin: 20px 0;">
                        <h4 style="margin-top:0; color: #dc3545;">Motivo:</h4>
                        <p style="font-style: italic;">"${motivo}"</p>
                    </div>
                </div>
            `;
        }

        await transporter.sendMail({
            from: '"CETTCEN Notificaciones" <' + process.env.EMAIL_USER + '>',
            to: vale.correo,
            subject: asunto,
            html: htmlContent,
        });
    } catch (emailError) {
        console.error("Error enviando correo:", emailError.message);
    }

    res.status(200).json({ 
        mensaje: `Vale ${accion === 'Aprobar' ? 'Autorizado' : 'Rechazado'} correctamente`, 
        nuevo_estado: nuevo_estado_id 
    });
  
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error en gestionarVale:", error);
    res.status(500).json({ error: 'Error al gestionar', detalle: error.message });
  } finally {
    // Este release se ejecuta SIEMPRE, haya éxito o error.
    if (connection) connection.release();
  }
};

export const registrarEntrega = async (req, res) => {
  const { id } = req.params;
  const id_almacenista_entrega = req.usuario.id_usuario;
  const { items_entregados } = req.body; 

  if (!items_entregados || items_entregados.length === 0) {
    return res.status(400).json({ error: 'No se escanearon items para entregar' });
  }
  
  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();

    const id_estado_prestado = await getEstadoMaterialId('Prestado');
    // ID 5 = Entregado (según tu imagen)
    const id_estado_vale_entregado = 5; 
    
    for (const item of items_entregados) {
      const { barcode_escaneado, cantidad_entregada } = item;
      
      const [unidades] = await connection.query("SELECT * FROM Tbl_Unidades_Material WHERE identificador_barcode = ?", [barcode_escaneado]);
      if (unidades.length === 0) throw new Error(`Codigo no encontrado: ${barcode_escaneado}`);
      const unidad = unidades[0];

      const [detalleVale] = await connection.query("SELECT * FROM Tbl_Vales_Detalle WHERE id_vale = ? AND id_material_base = ?", [id, unidad.id_material_base]);
      if (detalleVale.length === 0) throw new Error(`El material ${barcode_escaneado} no corresponde a este vale.`);

      if (unidad.cantidad_stock === 1) { 
        await connection.query("UPDATE Tbl_Vales_Detalle SET id_unidad_entregada = ?, cantidad_entregada = 1 WHERE id_vale = ? AND id_material_base = ? LIMIT 1", [unidad.id_unidad, id, unidad.id_material_base]);
        await connection.query("UPDATE Tbl_Unidades_Material SET id_estado = ? WHERE id_unidad = ?", [id_estado_prestado, unidad.id_unidad]);
      } else { 
        if (unidad.cantidad_stock < cantidad_entregada) throw new Error(`Stock insuficiente para ${barcode_escaneado}.`);
        await connection.query("UPDATE Tbl_Vales_Detalle SET id_unidad_entregada = ?, cantidad_entregada = ? WHERE id_vale = ? AND id_material_base = ?", [unidad.id_unidad, cantidad_entregada, id, unidad.id_material_base]);
        await connection.query("UPDATE Tbl_Unidades_Material SET cantidad_stock = cantidad_stock - ? WHERE id_unidad = ?", [cantidad_entregada, unidad.id_unidad]);
      }
    }

    await connection.query("UPDATE Tbl_Vales SET id_estado_vale = ?, id_almacenista_entrega = ?, fecha_hora_entrega_real = CURRENT_TIMESTAMP WHERE id_vale = ?", [id_estado_vale_entregado, id_almacenista_entrega, id]);

    await connection.commit();
    res.status(200).json({ mensaje: 'Material entregado exitosamente' });

  } catch (error) {
    await connection.rollback();
    console.error('Error entrega:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

export const registrarDevolucion = async (req, res) => {
    const { id } = req.params; 
    const { items_devueltos } = req.body; 
    const id_almacenista = req.usuario.id_usuario; 

    const connection = await db.promise().getConnection();

    try {
        await connection.beginTransaction();

        // 1. Obtener datos del vale
        const [vales] = await connection.query(
            "SELECT fecha_devolucion_esperada, id_usuario_solicitante, id_estado_vale FROM Tbl_Vales WHERE id_vale = ?", 
            [id]
        );

        if (vales.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Vale no encontrado' });
        }

        if (vales[0].id_estado_vale === 6) {
            connection.release();
            return res.status(400).json({ error: 'Este vale ya fue procesado y devuelto.' });
        }

        const { fecha_devolucion_esperada, id_usuario_solicitante } = vales[0];
        const fechaReal = new Date(); 
        
        // Cálculo de Retraso
        let estatusDevolucion = 'A tiempo';
        let minutosRetraso = 0;

        if (fechaReal > new Date(fecha_devolucion_esperada)) {
            estatusDevolucion = 'Con retraso';
            const diferenciaMs = fechaReal - new Date(fecha_devolucion_esperada);
            minutosRetraso = Math.floor(diferenciaMs / 1000 / 60); 
        }

        // 2. Procesar materiales
        for (const item of items_devueltos) {
            const [unidad] = await connection.query(
                "SELECT id_unidad, identificador_barcode FROM Tbl_Unidades_Material WHERE identificador_barcode = ?", 
                [item.barcode_escaneado]
            );

            if (unidad.length > 0) {
                const { id_unidad, identificador_barcode } = unidad[0];
                
                // CORRECCIÓN LÓGICA: Definir estados seguros
                // Si es Bueno, Excelente o Disponible -> NO es daño.
                const estadosSeguros = ['Bueno', 'Excelente', 'Disponible'];
                const esIncidencia = !estadosSeguros.includes(item.condicion);

                // Definir nuevo estado físico (1: Disp, 3: Mant, 4: Baja)
                let nuevoEstadoMaterial = 1; 
                if (item.condicion === 'Dañado' || item.condicion === 'Reparación') nuevoEstadoMaterial = 3;
                if (item.condicion === 'Perdido') nuevoEstadoMaterial = 4;

                // A. Actualizar estado físico de la unidad
                await connection.query(
                    "UPDATE Tbl_Unidades_Material SET id_estado = ? WHERE id_unidad = ?",
                    [nuevoEstadoMaterial, id_unidad]
                );

                // B. CREAR INCIDENCIA SOLO SI NO ES UN ESTADO SEGURO
                if (esIncidencia) {
                    const descripcionIncidencia = item.observaciones 
                        ? `Devolución con problema: ${item.observaciones}` 
                        : `Material devuelto en condición: ${item.condicion}`;

                    // Determinar tipo de incidencia
                    let idTipoIncidencia = 2; // Default: Daño Físico
                    if (item.condicion === 'Perdido') idTipoIncidencia = 7; // Ajusta según tu DB (7=Perdido)
                    
                    // Query limpia sin saltos de línea iniciales para evitar error de sintaxis
                    const qIncidencia = `INSERT INTO Tbl_Incidencias (titulo, descripcion, id_tipo_incidencia, id_usuario_reporta, id_usuario_afectado, id_unidad_afectada, id_vale, estado_incidencia, fecha_registro) VALUES (?, ?, ?, ?, ?, ?, ?, 'Abierta', NOW())`;

                    await connection.query(qIncidencia, [
                        `Incidencia en material ${identificador_barcode}`,
                        descripcionIncidencia,
                        idTipoIncidencia,
                        id_almacenista,
                        id_usuario_solicitante,
                        id_unidad,
                        id 
                    ]);

                    // Si se manda a mantenimiento, crear registro en Tbl_Mantenimientos
                    if (nuevoEstadoMaterial === 3) {
                        const qManto = `INSERT INTO Tbl_Mantenimientos (id_unidad, id_tipo_mantenimiento, descripcion, fecha_inicio, fecha_fin_estimada, realizado_externamente) VALUES (?, 3, ?, NOW(), NULL, 0)`;
                        await connection.query(qManto, [id_unidad, `Generado autom. por devolución de Vale #${id}. ${descripcionIncidencia}`]);
                    }
                }
            }
        }

        // 3. Cerrar el Vale
        const qUpdateVale = `UPDATE Tbl_Vales SET id_estado_vale = 6, fecha_hora_devolucion_real = NOW(), estatus_devolucion = ?, minutos_retraso = ?, id_almacenista_devolucion = ? WHERE id_vale = ?`;
        
        await connection.query(qUpdateVale, [estatusDevolucion, minutosRetraso, id_almacenista, id]);

        // Procesar lista de espera (si tienes la función importada)
        // await procesarListaEspera(connection, id);

        await connection.commit();

        res.json({ 
            mensaje: 'Devolución registrada correctamente.', 
            estatus_devolucion: estatusDevolucion, 
            retraso: `${minutosRetraso} minutos`
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error en registrarDevolucion:", error);
        res.status(500).json({ error: 'Error al registrar devolución: ' + error.message });
    } finally {
        if (connection) connection.release();
    }
};

export const actualizarVale = async (req, res) => {
  const { id } = req.params;
  const { id_usuario, nombre_rol } = req.usuario;
  const rol = nombre_rol || req.usuario.rol;
  const { fecha_recoleccion, fecha_devolucion_esperada, espacio_uso, motivo_solicitud, materiales } = req.body;

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [vales] = await connection.query("SELECT * FROM Tbl_Vales WHERE id_vale = ?", [id]);
    if (vales.length === 0) { connection.release(); return res.status(404).json({ error: 'Vale no encontrado' }); }
    const vale = vales[0];

    if (rol === 'alumno' && vale.id_usuario_solicitante !== id_usuario) {
      connection.release(); return res.status(403).json({ error: 'Sin permiso' });
    }

    const queryUpdate = `UPDATE Tbl_Vales SET fecha_recoleccion = ?, fecha_devolucion_esperada = ?, espacio_uso = ?, motivo_solicitud = ? WHERE id_vale = ?`;
    await connection.query(queryUpdate, [fecha_recoleccion||vale.fecha_recoleccion, fecha_devolucion_esperada||vale.fecha_devolucion_esperada, espacio_uso||vale.espacio_uso, motivo_solicitud||vale.motivo_solicitud, id]);

    if (materiales && materiales.length > 0) {
      await connection.query("DELETE FROM Tbl_Vales_Detalle WHERE id_vale = ?", [id]);
      const queryDetalle = "INSERT INTO Tbl_Vales_Detalle (id_vale, id_material_base, cantidad_solicitada) VALUES ?";
      const materialesValues = materiales.map(m => [id, m.id_material_base, m.cantidad_solicitada]);
      await connection.query(queryDetalle, [materialesValues]);
    }

    await connection.commit();
    res.status(200).json({ mensaje: 'Actualizado' });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar' });
  } finally {
    connection.release();
  }
};

export const getReporteRechazos = async (req, res) => {
    try {
        const { busqueda, fecha_inicio, fecha_fin } = req.query;

        // Query Base: Solo traemos Vales con estado 4 (Rechazado)
        let query = `
            SELECT 
                v.id_vale,
                v.fecha_emision as fecha_rechazo, 
                COALESCE(al.nombre_completo, tr.nombre_completo, u.correo) as nombre_solicitante,
                v.motivo_rechazo,
                (SELECT GROUP_CONCAT(m.nombre SEPARATOR ', ') 
                 FROM Tbl_Vales_Detalle vd 
                 JOIN Tbl_Materiales m ON vd.id_material_base = m.id_material 
                 WHERE vd.id_vale = v.id_vale) as nombre_material
            FROM Tbl_Vales v
            JOIN Tbl_Usuarios u ON v.id_usuario_solicitante = u.id_usuario
            LEFT JOIN Tbl_Alumnos al ON u.id_usuario = al.id_usuario
            LEFT JOIN Tbl_Trabajadores tr ON u.id_usuario = tr.id_usuario
            WHERE v.id_estado_vale = 4 
        `.trim();

        const params = [];

        // 1. FILTRO DE BÚSQUEDA MULTI-CAMPO
        if (busqueda) {
            query += ` AND (
                v.id_vale LIKE ? OR 
                u.correo LIKE ? OR 
                COALESCE(al.nombre_completo, tr.nombre_completo) LIKE ? OR
                EXISTS (
                    SELECT 1 FROM Tbl_Vales_Detalle vd 
                    JOIN Tbl_Materiales m ON vd.id_material_base = m.id_material 
                    WHERE vd.id_vale = v.id_vale AND m.nombre LIKE ?
                )
            )`;
            const term = `%${busqueda}%`;
            params.push(term, term, term, term);
        }

        // 2. FILTROS DE FECHA FLEXIBLES (Ahora independientes)
        
        // Si hay fecha de inicio: Trae todo desde esa fecha en adelante
        if (fecha_inicio) {
            query += ` AND DATE(v.fecha_emision) >= ?`;
            params.push(fecha_inicio);
        }

        // Si hay fecha de fin: Trae todo hasta esa fecha
        if (fecha_fin) {
            query += ` AND DATE(v.fecha_emision) <= ?`;
            params.push(fecha_fin);
        }

        query += ` ORDER BY v.fecha_emision DESC`;

        const [rows] = await db.promise().query(query, params);
        res.json(rows);

    } catch (error) {
        console.error("Error en reporte rechazos:", error);
        res.status(500).json({ error: 'Error al generar reporte de rechazos' });
    }
};

export const cancelarVale = async (req, res) => {
    const { id } = req.params;
    const { id_usuario, nombre_rol } = req.usuario;
    const rol = nombre_rol || req.usuario.rol;

    const connection = await db.promise().getConnection();

    try {
        await connection.beginTransaction();

        // 1. Verificar propiedad y estado
        const [vales] = await connection.query(
            "SELECT id_usuario_solicitante, id_estado_vale FROM Tbl_Vales WHERE id_vale = ? FOR UPDATE", 
            [id]
        );

        if (vales.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Vale no encontrado' });
        }

        const vale = vales[0];

        // Solo el dueño puede cancelar (o un admin, opcional)
        if (rol === 'alumno' && vale.id_usuario_solicitante !== id_usuario) {
            connection.release();
            return res.status(403).json({ error: 'No tienes permiso para cancelar este vale.' });
        }

        // Solo se puede cancelar si no ha sido entregado/rechazado/cancelado
        // Estados cancelables: 1(Pendiente M), 2(Pendiente A), 3(Aprobado), 7(Lista Espera)
        if (![1, 2, 3, 7].includes(vale.id_estado_vale)) {
            connection.release();
            return res.status(400).json({ error: 'El vale no se puede cancelar en su estado actual.' });
        }

        // 2. Actualizar a Cancelado (Asumiendo ID 8 para Cancelado, créalo en BD si no existe)
        // INSERT INTO Tbl_Estados_Vales (id_estado, nombre_estado) VALUES (8, 'Cancelado');
        const ID_CANCELADO = 8; 

        await connection.query(
            "UPDATE Tbl_Vales SET id_estado_vale = ? WHERE id_vale = ?",
            [ID_CANCELADO, id]
        );

        // 3. [IMPORTANTE] Liberar cupo para Lista de Espera
        // Solo si el vale estaba ocupando stock (1, 2, 3). Si estaba en espera (7), no libera nada real.
        if ([1, 2, 3].includes(vale.id_estado_vale)) {
            await procesarListaEspera(connection, id);
        }

        await connection.commit();
        res.json({ mensaje: 'Solicitud cancelada exitosamente.' });

    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ error: 'Error al cancelar el vale' });
    } finally {
        connection.release();
    }
};

// --- RQF11.1: Historial y Reputación del Usuario ---
export const getHistorialUsuario = async (req, res) => {
    const { id_usuario } = req.params;
    
    // Validación de permisos básica
    const solicitanteID = req.usuario.id_usuario;
    const rolSolicitante = req.usuario.nombre_rol || req.usuario.rol;
    if (rolSolicitante === 'alumno' && parseInt(id_usuario) !== solicitanteID) {
        return res.status(403).json({ error: 'No tienes permiso para ver este historial.' });
    }

    try {
        const connection = await db.promise();

        // 1. Obtener Info del Usuario (Query limpia)
        const queryUser = `SELECT u.correo, COALESCE(al.nombre_completo, tr.nombre_completo, 'Usuario del Sistema') as nombre_completo, r.nombre_rol as rol FROM Tbl_Usuarios u LEFT JOIN Tbl_Alumnos al ON u.id_usuario = al.id_usuario LEFT JOIN Tbl_Trabajadores tr ON u.id_usuario = tr.id_usuario LEFT JOIN Tbl_Roles r ON u.id_rol = r.id_rol WHERE u.id_usuario = ?`;
        
        const [userInfo] = await connection.query(queryUser, [id_usuario]);

        if (userInfo.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // 2. Estadísticas (Query limpia)
        const queryStats = `SELECT COUNT(*) as total_vales, SUM(CASE WHEN estatus_devolucion = 'Con retraso' THEN 1 ELSE 0 END) as total_retrasos, SUM(CASE WHEN estatus_devolucion = 'A tiempo' THEN 1 ELSE 0 END) as total_puntuales, (SELECT COUNT(*) FROM Tbl_Incidencias WHERE id_usuario_afectado = ?) as total_incidencias FROM Tbl_Vales WHERE id_usuario_solicitante = ?`;
        
        const [stats] = await connection.query(queryStats, [id_usuario, id_usuario]);

        // 3. Historial Detallado (Query limpia)
        const queryHistorial = `SELECT v.id_vale, v.fecha_recoleccion, v.fecha_hora_devolucion_real, ev.nombre_estado, v.estatus_devolucion, GROUP_CONCAT(m.nombre SEPARATOR ', ') as materiales FROM Tbl_Vales v JOIN Tbl_Estados_Vales ev ON v.id_estado_vale = ev.id_estado JOIN Tbl_Vales_Detalle vd ON v.id_vale = vd.id_vale JOIN Tbl_Materiales m ON vd.id_material_base = m.id_material WHERE v.id_usuario_solicitante = ? GROUP BY v.id_vale ORDER BY v.fecha_recoleccion DESC`;
        
        const [historial] = await connection.query(queryHistorial, [id_usuario]);

        res.json({
            usuario: userInfo[0],
            estadisticas: {
                total_vales: stats[0].total_vales || 0,
                total_retrasos: stats[0].total_retrasos || 0,
                total_puntuales: stats[0].total_puntuales || 0,
                total_incidencias: stats[0].total_incidencias || 0
            },
            historial: historial || []
        });

    } catch (error) {
        console.error("Error en getHistorialUsuario:", error);
        res.status(500).json({ error: 'Error interno al obtener historial' });
    }
};

// --- RQF12: Reporte de Materiales Prestados (Activos) ---
export const getReportePrestamos = async (req, res) => {
    try {
        const { busqueda, fecha_inicio, fecha_fin } = req.query;

        // Query Base Limpia (Sin saltos de línea al inicio)
        let query = `SELECT v.id_vale, v.fecha_recoleccion, v.fecha_devolucion_esperada, v.espacio_uso, COALESCE(al.nombre_completo, tr.nombre_completo, 'Usuario') as nombre_solicitante, u.correo, m.nombre as nombre_material, COALESCE(um.identificador_barcode, 'Sin Asignar') as identificador_barcode FROM Tbl_Vales v LEFT JOIN Tbl_Usuarios u ON v.id_usuario_solicitante = u.id_usuario LEFT JOIN Tbl_Alumnos al ON u.id_usuario = al.id_usuario LEFT JOIN Tbl_Trabajadores tr ON u.id_usuario = tr.id_usuario JOIN Tbl_Vales_Detalle vd ON v.id_vale = vd.id_vale JOIN Tbl_Materiales m ON vd.id_material_base = m.id_material LEFT JOIN Tbl_Unidades_Material um ON vd.id_unidad_entregada = um.id_unidad WHERE v.id_estado_vale = 5`;

        const params = [];

        if (busqueda) {
            query += ` AND (m.nombre LIKE ? OR COALESCE(al.nombre_completo, tr.nombre_completo) LIKE ? OR um.identificador_barcode LIKE ?)`;
            const term = `%${busqueda}%`;
            params.push(term, term, term);
        }

        if (fecha_inicio && fecha_fin) {
            query += ` AND DATE(v.fecha_recoleccion) BETWEEN ? AND ?`;
            params.push(fecha_inicio, fecha_fin);
        }

        query += ` ORDER BY v.fecha_devolucion_esperada ASC`;

        const [reporte] = await db.promise().query(query, params);
        res.json(reporte);

    } catch (error) {
        console.error("Error getReportePrestamos:", error);
        res.status(500).json({ error: 'Error al generar reporte de préstamos' });
    }
};

// --- [NUEVO] VALIDACIÓN PREVIA (Para deshabilitar botón en Frontend) ---
export const validarDuplicidadPrevia = async (req, res) => {
    const { id_usuario, fecha_recoleccion, fecha_devolucion_esperada, materiales } = req.body;

    if (!fecha_recoleccion || !fecha_devolucion_esperada || !materiales || materiales.length === 0) {
        return res.json({ existe: false });
    }

    const connection = await db.promise();

    try {
        const idsMateriales = materiales.map(m => m.id_material_base);

        // SQL Limpio de caracteres extraños
        const query = `
            SELECT v.id_vale 
            FROM Tbl_Vales v
            JOIN Tbl_Vales_Detalle vd ON v.id_vale = vd.id_vale
            WHERE v.id_usuario_solicitante = ? 
            AND vd.id_material_base IN (?)
            AND v.id_estado_vale IN (1, 2, 3, 5, 7)
            AND (v.fecha_recoleccion < ? AND v.fecha_devolucion_esperada > ?)
            LIMIT 1
        `;

        const [duplicados] = await connection.query(query, [
            id_usuario, 
            idsMateriales, 
            fecha_devolucion_esperada, 
            fecha_recoleccion
        ]);

        if (duplicados.length > 0) {
            return res.json({ 
                existe: true, 
                mensaje: `Ya tienes una solicitud activa (Folio #${duplicados[0].id_vale}) para estos materiales en ese horario.` 
            });
        }

        return res.json({ existe: false });

    } catch (error) {
        console.error("Error validando duplicidad:", error);
        // No devolvemos error 500 para no bloquear la UI, mejor asumimos que no hay duplicidad si falla la validacion técnica
        res.json({ existe: false }); 
    }
};