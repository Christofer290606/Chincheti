import db from '../config/db.js';

/**
 * Función Auxiliar: Obtener el ID de un tipo de incidencia
 */
const getTipoIncidencia = async (nombreTipo) => {
  const [tipo] = await db.promise().query("SELECT * FROM Tbl_Tipos_Incidencia WHERE nombre_tipo = ?", [nombreTipo]);
  if (tipo.length === 0) throw new Error(`Tipo de incidencia no encontrado: ${nombreTipo}`);
  return tipo[0];
};

/**
 * Función Auxiliar: Obtener el ID de un estado de material
 */
const getEstadoMaterialId = async (nombreEstado) => {
  const [estado] = await db.promise().query("SELECT id_estado FROM Tbl_Estados_Material WHERE nombre_estado = ?", [nombreEstado]);
  if (estado.length === 0) throw new Error(`Estado de material no encontrado: ${nombreEstado}`);
  return estado[0].id_estado;
};

/**
 * POST /api/gestion/incidencias
 * Registra una nueva incidencia
 */
export const crearIncidencia = async (req, res) => {
  const id_usuario_registra = req.usuario.id_usuario;
  const {
    nombre_tipo_incidencia, // "Material dañado", "Material perdido", etc.
    id_vale,
    id_usuario_afectado,
    id_unidad_afectada,
    descripcion_incidencia
  } = req.body;

  if (!nombre_tipo_incidencia || !id_usuario_afectado || !descripcion_incidencia) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();

    // 1. Obtener el tipo de incidencia y ver si es crítica
    const tipoIncidencia = await getTipoIncidencia(nombre_tipo_incidencia);
    
    // 2. Insertar la incidencia
    const queryIncidencia = `
      INSERT INTO Tbl_Incidencias (
        id_tipo_incidencia, id_vale, id_usuario_afectado, id_unidad_afectada,
        descripcion_incidencia, id_usuario_registra, estado_incidencia
      ) VALUES (?, ?, ?, ?, ?, ?, 'Abierta');
    `;
    const [resultIncidencia] = await connection.query(queryIncidencia, [
      tipoIncidencia.id_tipo_incidencia, id_vale || null, id_usuario_afectado,
      id_unidad_afectada || null, descripcion_incidencia, id_usuario_registra
    ]);
    
    const id_incidencia_nueva = resultIncidencia.insertId;

    // 3. Si la incidencia es crítica, bloquear al usuario
    if (tipoIncidencia.es_critica) {
      await connection.query(
        "UPDATE Tbl_Usuarios SET estatus = 'Bloqueado' WHERE id_usuario = ?",
        [id_usuario_afectado]
      );
    }

    await connection.commit();
    connection.release();
    
    res.status(201).json({
      mensaje: 'Incidencia registrada exitosamente',
      id_incidencia: id_incidencia_nueva,
      usuario_bloqueado: tipoIncidencia.es_critica
    });

  } catch (error) {
    console.error('Error en la transacción:', error);
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: 'Error al registrar la incidencia', detalle: error.message });
  }
};

/**
 * GET /api/gestion/incidencias
 * Obtiene un listado de incidencias
 */
export const getIncidencias = async (req, res) => {
  const { estado, id_usuario } = req.query;

  try {
    let query = `
      SELECT
        i.id_incidencia,
        i.estado_incidencia,
        i.fecha_registro,
        ti.nombre_tipo,
        ti.es_critica,
        COALESCE(a.nombre_completo, t.nombre_completo) AS usuario_afectado,
        m.nombre AS material_afectado
      FROM Tbl_Incidencias i
      JOIN Tbl_Tipos_Incidencia ti ON i.id_tipo_incidencia = ti.id_tipo_incidencia
      JOIN Tbl_Usuarios u ON i.id_usuario_afectado = u.id_usuario
      LEFT JOIN Tbl_Alumnos a ON u.id_usuario = a.id_usuario
      LEFT JOIN Tbl_Trabajadores t ON u.id_usuario = t.id_usuario
      LEFT JOIN Tbl_Unidades_Material um ON i.id_unidad_afectada = um.id_unidad
      LEFT JOIN Tbl_Materiales m ON um.id_material_base = m.id_material
      WHERE 1=1
    `;
    const params = [];

    if (estado) {
      query += " AND i.estado_incidencia = ?";
      params.push(estado);
    }
    if (id_usuario) {
      query += " AND i.id_usuario_afectado = ?";
      params.push(id_usuario);
    }
    
    query += " ORDER BY i.fecha_registro DESC"; 

    const [incidencias] = await db.promise().query(query, params);
    res.status(200).json({ incidencias });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las incidencias' });
  }
};

/**
 * GET /api/gestion/incidencias/:id
 * Obtiene el detalle de una incidencia
 */
export const getIncidenciaById = async (req, res) => {
    res.status(501).json({ error: 'No implementado' });
};


/**
 * PATCH /api/gestion/incidencias/:id/resolver
 * Resuelve (cierra) una incidencia
 */
export const resolverIncidencia = async (req, res) => {
  const { id } = req.params;
  const id_usuario_resuelve = req.usuario.id_usuario;
  const { motivo_resolucion } = req.body;

  //
  if (!motivo_resolucion || motivo_resolucion.length < 10) {
    return res.status(400).json({ error: 'Se requiere un motivo de resolución detallado (mín. 10 caracteres)' });
  }
  
  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 1. Obtener datos de la incidencia 
    const [incidencias] = await connection.query(
      "SELECT i.id_usuario_afectado, ti.es_critica FROM Tbl_Incidencias i JOIN Tbl_Tipos_Incidencia ti ON i.id_tipo_incidencia = ti.id_tipo_incidencia WHERE i.id_incidencia = ?",
      [id]
    );
    if (incidencias.length === 0) {
      throw new Error('Incidencia no encontrada');
    }
    const incidencia = incidencias[0];

    // 2. Actualizar la incidencia a "Cerrada"
    const query = `
      UPDATE Tbl_Incidencias SET
        estado_incidencia = 'Cerrada',
        fecha_resolucion = CURRENT_TIMESTAMP,
        motivo_resolucion = ?,
        id_usuario_resuelve = ?
      WHERE id_incidencia = ? AND estado_incidencia = 'Abierta';
    `;
    const [result] = await connection.query(query, [motivo_resolucion, id_usuario_resuelve, id]);
    
    if (result.affectedRows === 0) {
      throw new Error('La incidencia no fue encontrada o ya estaba cerrada');
    }

    // 3. Si era crítica, desbloquear al usuario
    if (incidencia.es_critica) {
      await connection.query(
        "UPDATE Tbl_Usuarios SET estatus = 'Activo' WHERE id_usuario = ?",
        [incidencia.id_usuario_afectado]
      );
    }
    
    await connection.commit();
    connection.release();
    
    res.status(200).json({
      mensaje: 'Incidencia resuelta y cerrada',
      usuario_desbloqueado: incidencia.es_critica
    });

  } catch (error) {
    console.error('Error en la transacción:', error);
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: 'Error al resolver la incidencia', detalle: error.message });
  }
};

/**
 * POST /api/gestion/mantenimiento
 * Crea un nuevo registro de mantenimiento y actualiza el estado de la unidad
 */
export const crearRegistroMantenimiento = async (req, res) => {
  const id_usuario_registra = req.usuario.id_usuario;
  const {
    id_unidad,
    id_tipo_mantenimiento,
    id_incidencia, 
    descripcion,
    fecha_fin_estimada,
    es_interno
  } = req.body;

  if (!id_unidad || !id_tipo_mantenimiento || !descripcion) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();

    // 1. Poner la unidad en esatdo de mantenimiento
    const id_estado_mto = await getEstadoMaterialId('En mantenimiento');
    await connection.query(
      "UPDATE Tbl_Unidades_Material SET id_estado = ? WHERE id_unidad = ?",
      [id_estado_mto, id_unidad]
    );

    // 2. Crear el registro de mantenimiento
    const query = `
      INSERT INTO Tbl_Mantenimientos (
        id_unidad, id_tipo_mantenimiento, id_incidencia, id_usuario_registra,
        descripcion, fecha_fin_estimada, es_interno, estado_mantenimiento
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'En Progreso');
    `;
    const [result] = await connection.query(query, [
      id_unidad, id_tipo_mantenimiento, id_incidencia || null, id_usuario_registra,
      descripcion, fecha_fin_estimada || null, es_interno || true
    ]);
    
    await connection.commit();
    connection.release();
    
    res.status(201).json({
      mensaje: 'Registro de mantenimiento creado. La unidad está ahora "En mantenimiento".',
      id_mantenimiento: result.insertId
    });

  } catch (error) {
    console.error('Error en la transacción:', error);
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: 'Error al crear el registro de mantenimiento', detalle: error.message });
  }
};

/**
 * GET /api/gestion/mantenimiento/:id_unidad
 * Obtiene el historial de mantenimiento de una unidad
 */
export const getHistorialMantenimiento = async (req, res) => {
  const { id_unidad } = req.params;
  try {
    //
    const query = `
      SELECT
        m.id_mantenimiento,
        m.fecha_inicio,
        m.fecha_fin_real,
        m.estado_mantenimiento,
        tm.nombre_tipo,
        t.nombre_completo AS registrado_por
      FROM Tbl_Mantenimientos m
      JOIN Tbl_Tipos_Mantenimiento tm ON m.id_tipo_mantenimiento = tm.id_tipo_mantenimiento
      JOIN Tbl_Usuarios u ON m.id_usuario_registra = u.id_usuario
      JOIN Tbl_Trabajadores t ON u.id_usuario = t.id_usuario
      WHERE m.id_unidad = ?
      ORDER BY m.fecha_inicio DESC;
    `;
    
    const [historial] = await db.promise().query(query, [id_unidad]);
    res.status(200).json({ historial });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el historial de mantenimiento' });
  }
};

/**
 * PATCH /api/gestion/mantenimiento/:id/completar
 * Marca un mantenimiento como completado y devuelve la unidad a Disponible
 */
export const completarMantenimiento = async (req, res) => {
  const { id } = req.params;

  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();

    // 1. Actualizar el registro de mantenimiento
    const query = `
      UPDATE Tbl_Mantenimientos SET
        estado_mantenimiento = 'Completado',
        fecha_fin_real = CURRENT_TIMESTAMP
      WHERE id_mantenimiento = ? AND estado_mantenimiento = 'En Progreso';
    `;
    const [result] = await connection.query(query, [id]);
    
    if (result.affectedRows === 0) {
      throw new Error('Mantenimiento no encontrado o ya estaba completado');
    }

    // 2. Obtener la unidad afectada
    const [mantenimientos] = await connection.query("SELECT id_unidad FROM Tbl_Mantenimientos WHERE id_mantenimiento = ?", [id]);
    const id_unidad = mantenimientos[0].id_unidad;

    // 3. Devolver la unidad al estado Disponible
    const id_estado_disponible = await getEstadoMaterialId('Disponible');
    await connection.query(
      "UPDATE Tbl_Unidades_Material SET id_estado = ? WHERE id_unidad = ?",
      [id_estado_disponible, id_unidad]
    );

    await connection.commit();
    connection.release();
    
    res.status(200).json({
      mensaje: 'Mantenimiento completado. La unidad está "Disponible".'
    });

  } catch (error) {
    console.error('Error en la transacción:', error);
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: 'Error al completar el mantenimiento', detalle: error.message });
  }
};