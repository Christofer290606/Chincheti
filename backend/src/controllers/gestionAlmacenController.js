import db from '../config/db.js';

// --- OBTENER HISTORIAL COMPLETO DE UNA UNIDAD ---
export const getHistorialUnidad = async (req, res) => {
  const { id } = req.params; // id_unidad

  try {
    const connection = await db.promise();

    // 1. Info básica de la unidad
    const [unidad] = await connection.query(`
      SELECT u.identificador_barcode, m.nombre, u.id_estado 
      FROM Tbl_Unidades_Material u 
      JOIN Tbl_Materiales m ON u.id_material_base = m.id_material 
      WHERE u.id_unidad = ?`, [id]);

    if (unidad.length === 0) {
      return res.status(404).json({ error: 'Unidad no encontrada' });
    }

    // 2. Historial de Mantenimientos (Tbl_Mantenimientos)
    const [mantenimientos] = await connection.query(`
      SELECT 
        m.id_mantenimiento,
        tm.nombre_tipo as tipo,
        m.fecha_inicio,
        m.fecha_fin,
        m.descripcion,
        m.estado_mantenimiento,
        m.costo
      FROM Tbl_Mantenimientos m
      JOIN Tbl_Tipos_Mantenimiento tm ON m.id_tipo_mantenimiento = tm.id_tipo_mantenimiento
      WHERE m.id_unidad = ?
      ORDER BY m.fecha_inicio DESC
    `, [id]);

    // 3. Historial de Auditoría/Movimientos (Tbl_Historial_Materiales)
    // Incluye bajas, creaciones y ediciones
    const [movimientos] = await connection.query(`
      SELECT 
        h.fecha_movimiento,
        h.accion,
        h.descripcion_cambio,
        u.correo as usuario_responsable
      FROM Tbl_Historial_Materiales h
      LEFT JOIN Tbl_Usuarios u ON h.id_usuario_responsable = u.id_usuario
      WHERE h.id_unidad = ?
      ORDER BY h.fecha_movimiento DESC
    `, [id]);

    res.status(200).json({
      info_unidad: unidad[0],
      mantenimientos,
      movimientos
    });

  } catch (error) {
    console.error("Error en getHistorialUnidad:", error);
    res.status(500).json({ error: 'Error al obtener el historial' });
  }
};

// --- REGISTRAR NUEVO MANTENIMIENTO ---
export const registrarMantenimiento = async (req, res) => {
  const { id_unidad, id_tipo, descripcion, costo } = req.body;
  
  if (!id_unidad || !id_tipo) return res.status(400).json({ error: 'Faltan datos' });

  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();

    // 1. Insertar Mantenimiento
    await connection.query(`
      INSERT INTO Tbl_Mantenimientos 
      (id_unidad, id_tipo_mantenimiento, fecha_inicio, descripcion, costo, estado_mantenimiento)
      VALUES (?, ?, NOW(), ?, ?, 'En Proceso')
    `, [id_unidad, id_tipo, descripcion, costo || 0]);

    // 2. Cambiar estado de la unidad a "En Mantenimiento" (ID 3)
    const [stMant] = await connection.query("SELECT id_estado FROM Tbl_Estados_Material WHERE nombre_estado LIKE '%Mantenimiento%' LIMIT 1");
    const idEstadoMant = stMant.length > 0 ? stMant[0].id_estado : 3;

    await connection.query(`UPDATE Tbl_Unidades_Material SET id_estado = ? WHERE id_unidad = ?`, [idEstadoMant, id_unidad]);

    await connection.commit();
    res.status(201).json({ mensaje: 'Mantenimiento registrado y unidad bloqueada.' });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(500).json({ error: 'Error al registrar mantenimiento' });
  } finally {
    connection.release();
  }
};

// --- FINALIZAR MANTENIMIENTO ---
export const finalizarMantenimiento = async (req, res) => {
  const { id } = req.params; // id_mantenimiento
  const { descripcion_cierre } = req.body;

  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();

    // 1. Obtener id_unidad asociada
    const [mto] = await connection.query("SELECT id_unidad FROM Tbl_Mantenimientos WHERE id_mantenimiento = ?", [id]);
    if (mto.length === 0) throw new Error("Mantenimiento no encontrado");
    const id_unidad = mto[0].id_unidad;

    // 2. Actualizar Mantenimiento (Cerrar fecha y estado)
    await connection.query(`
      UPDATE Tbl_Mantenimientos 
      SET fecha_fin = NOW(), estado_mantenimiento = 'Finalizado', descripcion = CONCAT(descripcion, ' | Cierre: ', ?)
      WHERE id_mantenimiento = ?
    `, [descripcion_cierre || 'Finalizado', id]);

    // 3. Liberar Unidad (Estado Disponible = 1)
    const [stDisp] = await connection.query("SELECT id_estado FROM Tbl_Estados_Material WHERE nombre_estado = 'Disponible' LIMIT 1");
    const idEstadoDisp = stDisp.length > 0 ? stDisp[0].id_estado : 1;

    await connection.query(`UPDATE Tbl_Unidades_Material SET id_estado = ? WHERE id_unidad = ?`, [idEstadoDisp, id_unidad]);

    await connection.commit();
    res.status(200).json({ mensaje: 'Mantenimiento finalizado y unidad disponible.' });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(500).json({ error: 'Error al finalizar mantenimiento' });
  } finally {
    connection.release();
  }
};