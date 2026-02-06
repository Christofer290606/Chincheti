import db from '../config/db.js';

// --- HELPER: OBTENER UNIDADES PARA EL SELECT ---
export const getUnidadesParaSelect = async (req, res) => {
    try {
        const [rows] = await db.promise().query(`
            SELECT u.id_unidad, u.identificador_barcode, m.nombre 
            FROM Tbl_Unidades_Material u
            JOIN Tbl_Materiales m ON u.id_material_base = m.id_material
            ORDER BY m.nombre ASC
        `);
        res.json(rows);
    } catch (error) {
        console.error("Error getUnidadesParaSelect:", error);
        res.status(500).json({ error: 'Error cargando unidades' });
    }
};

// --- OBTENER TIPOS DE INCIDENCIA ---
export const getTiposIncidencia = async (req, res) => {
    try {
        const [rows] = await db.promise().query("SELECT * FROM Tbl_Tipos_Incidencia ORDER BY nombre_tipo");
        res.json({ tipos_incidencia: rows });
    } catch (error) {
        console.error("Error getTiposIncidencia:", error);
        res.status(500).json({ error: 'Error al cargar tipos' });
    }
};

// --- CREAR INCIDENCIA (SOLO GESTORES) ---
export const crearIncidencia = async (req, res) => {
    const usuario = req.usuario; 
    const rol = usuario.nombre_rol || usuario.rol;

    // [SEGURIDAD] Solo coordinadores y almacenistas pueden crear incidencias
    if (!['coordinador', 'almacenista'].includes(rol)) {
        return res.status(403).json({ error: 'No tienes permisos para registrar incidencias.' });
    }

    const { id_tipo_incidencia, id_unidad_afectada, id_usuario_afectado, descripcion } = req.body;

    if (!id_tipo_incidencia) return res.status(400).json({ error: 'El Tipo de Incidencia es obligatorio.' });
    if (!id_unidad_afectada) return res.status(400).json({ error: 'Debe seleccionar el Material afectado.' });
    if (!id_usuario_afectado) return res.status(400).json({ error: 'Debe seleccionar el Usuario responsable.' });
    if (!descripcion || descripcion.length < 20 || descripcion.length > 500) {
        return res.status(400).json({ error: 'La descripción debe tener entre 20 y 500 caracteres.' });
    }

    const connection = await db.promise().getConnection();

    try {
        await connection.beginTransaction();

        const [tipoData] = await connection.query("SELECT nombre_tipo, nivel_prioridad FROM Tbl_Tipos_Incidencia WHERE id_tipo_incidencia = ?", [id_tipo_incidencia]);
        if (tipoData.length === 0) throw new Error("Tipo de incidencia no válido.");

        const tituloAuto = tipoData[0].nombre_tipo; 
        const esCritica = ['Critica', 'Alta'].includes(tipoData[0].nivel_prioridad);

        await connection.query(`
            INSERT INTO Tbl_Incidencias 
            (titulo, descripcion, id_tipo_incidencia, id_usuario_reporta, id_usuario_afectado, id_unidad_afectada, es_critica, estado_incidencia, fecha_registro)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Abierta', NOW())
        `, [tituloAuto, descripcion, id_tipo_incidencia, usuario.id_usuario, id_usuario_afectado, id_unidad_afectada, esCritica ? 1 : 0]);

        if (esCritica) {
            await connection.query(
                "UPDATE Tbl_Usuarios SET estatus = 'Bloqueado' WHERE id_usuario = ?", 
                [id_usuario_afectado]
            );
        }

        await connection.commit();
        res.status(201).json({ mensaje: esCritica ? 'Incidencia Crítica registrada. Usuario BLOQUEADO.' : 'Incidencia registrada correctamente.' });

    } catch (error) {
        await connection.rollback();
        console.error("Error crearIncidencia:", error);
        res.status(500).json({ error: error.message || 'Error interno al registrar.' });
    } finally {
        connection.release();
    }
};

// --- OBTENER LISTA DE INCIDENCIAS (FILTRADA POR ROL) ---
export const getIncidencias = async (req, res) => {
    const { busqueda, id_tipo, estado, fecha_inicio, fecha_fin } = req.query;
    
    // Obtenemos datos del usuario logueado
    const { id_usuario, id_almacen, id_carrera } = req.usuario; 
    const rol = req.usuario.nombre_rol || req.usuario.rol;

    try {
        const connection = await db.promise();

        // [CORRECCION] Cambiado m.id_carrera_almacen por m.id_carrera_exclusiva
        let query = `
            SELECT 
                i.id_incidencia, i.titulo, i.descripcion, i.fecha_registro, 
                i.estado_incidencia, i.es_critica, i.resolucion_final, i.fecha_cierre,
                ti.nombre_tipo,
                u_afec.id_usuario as id_usuario_afectado,
                COALESCE(al.nombre_completo, tr.nombre_completo, u_afec.correo) as nombre_afectado,
                u_rep.correo as reportado_por_correo,
                m.nombre as nombre_material, um.identificador_barcode,
                m.id_almacen, m.id_carrera_exclusiva
            FROM Tbl_Incidencias i
            JOIN Tbl_Tipos_Incidencia ti ON i.id_tipo_incidencia = ti.id_tipo_incidencia
            JOIN Tbl_Usuarios u_rep ON i.id_usuario_reporta = u_rep.id_usuario
            LEFT JOIN Tbl_Usuarios u_afec ON i.id_usuario_afectado = u_afec.id_usuario
            LEFT JOIN Tbl_Alumnos al ON u_afec.id_usuario = al.id_usuario
            LEFT JOIN Tbl_Trabajadores tr ON u_afec.id_usuario = tr.id_usuario
            LEFT JOIN Tbl_Unidades_Material um ON i.id_unidad_afectada = um.id_unidad
            LEFT JOIN Tbl_Materiales m ON um.id_material_base = m.id_material
            WHERE 1=1 
        `;

        const params = [];

        // --- LÓGICA DE FILTRADO DE SEGURIDAD ---
        if (rol === 'almacenista') {
            // Ve incidencias de materiales en SU almacén
            if (id_almacen) {
                query += " AND m.id_almacen = ?";
                params.push(id_almacen);
            }
        } else if (rol === 'coordinador') {
            // [CORRECCION] Filtro por id_carrera_exclusiva
            if (id_carrera) {
                query += " AND m.id_carrera_exclusiva = ?";
                params.push(id_carrera);
            }
        } else if (rol === 'alumno' || rol === 'maestro') {
            // Solo ven lo que les afecta o reportaron
            query += " AND (i.id_usuario_afectado = ? OR i.id_usuario_reporta = ?)";
            params.push(id_usuario, id_usuario);
        }
        // Administrador ve todo (no entra en los if anteriores)

        // --- FILTROS OPCIONALES DEL FRONTEND ---
        if (estado) { query += " AND i.estado_incidencia = ?"; params.push(estado); }
        if (id_tipo) { query += " AND i.id_tipo_incidencia = ?"; params.push(id_tipo); }
        if (fecha_inicio && fecha_fin) { 
            query += " AND i.fecha_registro BETWEEN ? AND ?"; 
            params.push(`${fecha_inicio} 00:00:00`, `${fecha_fin} 23:59:59`); 
        }
        if (busqueda) {
            query += ` AND (al.nombre_completo LIKE ? OR tr.nombre_completo LIKE ? OR m.nombre LIKE ? OR um.identificador_barcode LIKE ? OR i.descripcion LIKE ?)`;
            const term = `%${busqueda}%`;
            params.push(term, term, term, term, term);
        }

        query += ` ORDER BY CASE WHEN i.estado_incidencia = 'Abierta' THEN 0 ELSE 1 END ASC, i.fecha_registro DESC`;

        const [incidencias] = await connection.query(query, params);
        res.json({ incidencias });

    } catch (error) {
        console.error("Error getIncidencias:", error);
        res.status(500).json({ error: 'Error al cargar incidencias' });
    }
};

// --- OBTENER MIS INCIDENCIAS ---
export const getMisIncidencias = async (req, res) => {
    const { id_usuario } = req.usuario; 
    try {
        const [rows] = await db.promise().query(`
            SELECT i.*, ti.nombre_tipo 
            FROM Tbl_Incidencias i
            JOIN Tbl_Tipos_Incidencia ti ON i.id_tipo_incidencia = ti.id_tipo_incidencia
            WHERE id_usuario_afectado = ? 
            AND estado_incidencia IN ('Pendiente', 'Abierta')
        `, [id_usuario]);
        res.json(rows); 
    } catch (error) {
        console.error("Error getMisIncidencias:", error);
        res.status(500).json({ error: 'Error al verificar incidencias' });
    }
};

// --- OBTENER DETALLE ---
export const getDetalleIncidencia = async (req, res) => {
    const { id } = req.params;
    const { id_usuario, rol, id_almacen, id_carrera } = req.usuario;

    try {
        // [CORRECCION] Cambiado m.id_carrera_almacen por m.id_carrera_exclusiva
        const query = `
            SELECT 
                i.*,
                ti.nombre_tipo, ti.nivel_prioridad,
                COALESCE(al.nombre_completo, tr.nombre_completo, u_afec.correo) as nombre_afectado,
                u_afec.correo as correo_afectado,
                al.registro as matricula_afectado, 
                NULL as num_empleado_afectado,
                u_rep.correo as reportado_por,
                COALESCE(al_res.nombre_completo, tr_res.nombre_completo, u_res.correo) as nombre_resolvio,
                m.nombre as nombre_material,
                um.identificador_barcode,
                m.modelo, m.marca,
                m.id_almacen, m.id_carrera_exclusiva
            FROM Tbl_Incidencias i
            JOIN Tbl_Tipos_Incidencia ti ON i.id_tipo_incidencia = ti.id_tipo_incidencia
            LEFT JOIN Tbl_Usuarios u_afec ON i.id_usuario_afectado = u_afec.id_usuario
            LEFT JOIN Tbl_Alumnos al ON u_afec.id_usuario = al.id_usuario
            LEFT JOIN Tbl_Trabajadores tr ON u_afec.id_usuario = tr.id_usuario
            JOIN Tbl_Usuarios u_rep ON i.id_usuario_reporta = u_rep.id_usuario
            LEFT JOIN Tbl_Usuarios u_res ON i.id_usuario_resolvio = u_res.id_usuario
            LEFT JOIN Tbl_Alumnos al_res ON u_res.id_usuario = al_res.id_usuario
            LEFT JOIN Tbl_Trabajadores tr_res ON u_res.id_usuario = tr_res.id_usuario
            LEFT JOIN Tbl_Unidades_Material um ON i.id_unidad_afectada = um.id_unidad
            LEFT JOIN Tbl_Materiales m ON um.id_material_base = m.id_material
            WHERE i.id_incidencia = ?
        `;

        const [rows] = await db.promise().query(query, [id]);
        
        if (rows.length === 0) return res.status(404).json({ error: 'Incidencia no encontrada' });
        
        const incidencia = rows[0];

        // --- VALIDACIÓN DE VISIBILIDAD DE DETALLE ---
        if (rol === 'almacenista' && incidencia.id_almacen !== id_almacen) {
            return res.status(403).json({ error: 'No tienes acceso a esta incidencia (Almacén incorrecto).' });
        }
        if (rol === 'coordinador' && incidencia.id_carrera_exclusiva !== id_carrera) {
            // [NOTA] Si id_carrera_exclusiva es NULL (material general), el coordinador SI debería verlo
            // si está en un almacén de su jurisdicción, pero asumimos filtro estricto por ahora.
            if (incidencia.id_carrera_exclusiva !== null) {
                 return res.status(403).json({ error: 'No tienes acceso a esta incidencia (Carrera incorrecta).' });
            }
        }
        if ((rol === 'alumno' || rol === 'maestro') && 
            (incidencia.id_usuario_afectado !== id_usuario && incidencia.id_usuario_reporta !== id_usuario)) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }

        res.status(200).json(incidencia);

    } catch (error) {
        console.error("Error getDetalleIncidencia:", error);
        res.status(500).json({ error: 'Error de servidor: ' + error.message });
    }
};

// --- RESOLVER INCIDENCIA (SOLO GESTORES) ---
export const resolverIncidencia = async (req, res) => {
    const usuario = req.usuario;
    const rol = usuario.nombre_rol || usuario.rol;

    if (!['coordinador', 'almacenista'].includes(rol)) {
        return res.status(403).json({ error: 'No tienes permisos para resolver incidencias.' });
    }

    const { id } = req.params;
    const { solucion } = req.body;
    
    if (!solucion || solucion.trim().length < 10) {
        return res.status(400).json({ error: 'La justificación es obligatoria y debe tener al menos 10 caracteres.' });
    }
    
    const connection = await db.promise().getConnection();

    try {
        await connection.beginTransaction();

        const [incidencia] = await connection.query("SELECT id_usuario_afectado, es_critica, estado_incidencia FROM Tbl_Incidencias WHERE id_incidencia = ?", [id]);
        
        if (incidencia.length === 0) { connection.release(); return res.status(404).json({ error: "Incidencia no encontrada." }); }
        if (incidencia[0].estado_incidencia === 'Cerrada') { connection.release(); return res.status(400).json({ error: "La incidencia ya está cerrada." }); }

        await connection.query(`
            UPDATE Tbl_Incidencias 
            SET estado_incidencia = 'Cerrada', 
                resolucion_final = ?, 
                id_usuario_resolvio = ?,
                fecha_cierre = NOW()
            WHERE id_incidencia = ?
        `, [solucion, usuario.id_usuario, id]);

        const idUsuarioAfectado = incidencia[0].id_usuario_afectado;
        
        if (idUsuarioAfectado) {
            const [pendientes] = await connection.query(`
                SELECT count(*) as total FROM Tbl_Incidencias 
                WHERE id_usuario_afectado = ? AND es_critica = 1 AND estado_incidencia IN ('Abierta', 'Pendiente') AND id_incidencia != ? 
            `, [idUsuarioAfectado, id]);

            if (pendientes[0].total === 0) {
                await connection.query("UPDATE Tbl_Usuarios SET estatus = 'Activo' WHERE id_usuario = ?", [idUsuarioAfectado]);
            }
        }

        await connection.commit();
        res.status(200).json({ mensaje: 'Incidencia resuelta exitosamente.' });

    } catch (error) {
        await connection.rollback();
        console.error("Error resolverIncidencia:", error);
        res.status(500).json({ error: 'Error al cerrar incidencia' });
    } finally {
        connection.release();
    }
};