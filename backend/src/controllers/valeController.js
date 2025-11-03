import db from '../config/db.js';

/**
 * Función Auxiliar: Obtener el ID de un estado por su nombre
 */
const getEstadoId = async (nombreEstado) => {
  const [estado] = await db.promise().query("SELECT id_estado FROM Tbl_Estados_Vales WHERE nombre_estado = ?", [nombreEstado]);
  if (estado.length === 0) throw new Error(`Estado de vale no encontrado: ${nombreEstado}`);
  return estado[0].id_estado;
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
 * POST /api/vales
 * Crea una nueva solicitud de vale, en modo de transacción
 */
export const crearVale = async (req, res) => {
  const id_usuario_solicitante = req.usuario.id_usuario; // Obtenido del token
  const {
    tipo_vale,
    fecha_recoleccion,
    fecha_devolucion_esperada,
    espacio_uso,
    id_maestro_responsable,
    motivo_solicitud,
    materiales
  } = req.body;

  // Validaciones de campos obligatorios
  if (!tipo_vale || !fecha_recoleccion || !fecha_devolucion_esperada || !espacio_uso || !materiales || materiales.length === 0) {
    return res.status(400).json({ error: 'Faltan campos obligatorios para crear el vale' });
  }

  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();

    // 1. Determinar estado inicial de vale
    const id_estado_inicial = await getEstadoId('Pendiente Maestro');

    // 2. Insertar el encabezado a Tbl_Vales
    const queryVale = `
      INSERT INTO Tbl_Vales (
        id_usuario_solicitante, id_estado_vale, tipo_vale, fecha_recoleccion,
        fecha_devolucion_esperada, espacio_uso, motivo_solicitud, id_maestro_responsable
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const [resultVale] = await connection.query(queryVale, [
      id_usuario_solicitante, id_estado_inicial, tipo_vale, fecha_recoleccion,
      fecha_devolucion_esperada, espacio_uso, motivo_solicitud || null, id_maestro_responsable || null
    ]);
    
    const id_vale_nuevo = resultVale.insertId;

    // 3. Insertar los detalles a Tbl_Vales_Detalle
    const queryDetalle = `
      INSERT INTO Tbl_Vales_Detalle (id_vale, id_material_base, cantidad_solicitada)
      VALUES ?;
    `;
    // Se preparan los datos para inserción múltiple
    const materialesValues = materiales.map(m => [
      id_vale_nuevo,
      m.id_material_base,
      m.cantidad_solicitada
    ]);
    
    await connection.query(queryDetalle, [materialesValues]);

    // 4. Confirmar transacción
    await connection.commit();
    connection.release();
    
    res.status(201).json({
      mensaje: 'Solicitud de vale creada exitosamente',
      id_vale: id_vale_nuevo
    });

  } catch (error) {
    console.error('Error en la transacción:', error);
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: 'Error al crear la solicitud', detalle: error.message });
  }
};

/**
 * GET /api/vales
 * Obtiene la lista de vales, filtrada por el rol del usuario
 */
export const getVales = async (req, res) => {
  const { id_usuario, nombre_rol } = req.usuario;
  const { estatus } = req.query; 

  try {
    let query = `
      SELECT
        v.id_vale,
        ev.nombre_estado,
        v.tipo_vale,
        v.fecha_recoleccion,
        COALESCE(a.nombre_completo, t.nombre_completo) AS solicitante
      FROM Tbl_Vales v
      JOIN Tbl_Estados_Vales ev ON v.id_estado_vale = ev.id_estado
      JOIN Tbl_Usuarios u ON v.id_usuario_solicitante = u.id_usuario
      LEFT JOIN Tbl_Alumnos a ON u.id_usuario = a.id_usuario
      LEFT JOIN Tbl_Trabajadores t ON u.id_usuario = t.id_usuario
    `;
    
    const params = [];

    // Lógica de filtrado por rol
    if (nombre_rol === 'alumno') {
      query += " WHERE v.id_usuario_solicitante = ?";
      params.push(id_usuario);
    } else if (nombre_rol === 'maestro') {
      // Un maestro ve los suyos o los que debe aprobar
      query += " WHERE v.id_usuario_solicitante = ? OR v.id_maestro_responsable = ?";
      params.push(id_usuario, id_usuario);
    }
    // Almacenista y Coordinador ven todo 

    // Lógica de filtro por estatus
    if (estatus) {
      query += params.length > 0 ? " AND" : " WHERE";
      query += " ev.nombre_estado = ?";
      params.push(estatus);
    }
    
    query += " ORDER BY v.fecha_recoleccion DESC";
    
    const [vales] = await db.promise().query(query, params);
    res.status(200).json({ vales });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los vales' });
  }
};

/**
 * GET /api/vales/:id
 * Obtiene el detalle completo de un vale
 */
export const getValeById = async (req, res) => {
  const { id } = req.params;
  
  try {
    // 1. Obtener encabezado del vale
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

    // Lógica de permisos
    const { id_usuario, nombre_rol } = req.usuario;
    if (nombre_rol === 'alumno' && vale.id_usuario_solicitante !== id_usuario) {
      return res.status(403).json({ error: 'Acceso denegado a este vale' });
    }

    // 2. Obtener detalles de materiales
    const queryDetalle = `
      SELECT
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

/**
 * PATCH /api/vales/:id/gestion
 * Aprobar o Rechazar un vale
 */
export const gestionarVale = async (req, res) => {
  const { id } = req.params;
  const { accion, motivo_rechazo } = req.body; // Aprobar o Rechazar
  const id_usuario_gestion = req.usuario.id_usuario;

  if (accion === 'Rechazar' && !motivo_rechazo) {
    return res.status(400).json({ error: 'Se requiere un motivo de rechazo' }); //
  }

  try {
    let nuevo_estado_id, motivo;
    
    if (accion === 'Aprobar') {
      //
      nuevo_estado_id = await getEstadoId('Aprobado');
      motivo = null;
    } else {
      nuevo_estado_id = await getEstadoId('Rechazado');
      motivo = motivo_rechazo;
    }

    const query = `
      UPDATE Tbl_Vales
      SET id_estado_vale = ?, id_usuario_gestion = ?, motivo_rechazo = ?
      WHERE id_vale = ? AND id_estado_vale IN (?, ?);
    `;
    // Solo se puede gestionar si está en estado de Pendiente Maestro o Pendiente Almacenista
    const id_pendiente_maestro = await getEstadoId('Pendiente Maestro');
    const id_pendiente_alm = await getEstadoId('Pendiente Almacenista');

    const [result] = await db.promise().query(query, [
      nuevo_estado_id, id_usuario_gestion, motivo, id, id_pendiente_maestro, id_pendiente_alm
    ]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Vale no encontrado o ya no está en estado pendiente' });
    }

    res.status(200).json({ mensaje: `Vale ${accion === 'Aprobar' ? 'Aprobado' : 'Rechazado'}`, nuevo_estado: accion });
  
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al gestionar el vale', detalle: error.message });
  }
};

/**
 * POST /api/vales/:id/entregar
 * Registra la entrega de material con lector
 */
export const registrarEntrega = async (req, res) => {
  const { id } = req.params; // id del vale
  const id_almacenista_entrega = req.usuario.id_usuario;
  const { items_entregados } = req.body; 

  if (!items_entregados || items_entregados.length === 0) {
    return res.status(400).json({ error: 'No se escanearon items para entregar' });
  }
  
  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();

    const id_estado_prestado = await getEstadoMaterialId('Prestado');
    const id_estado_vale_entregado = await getEstadoId('Entregado');
    
    // 1. Procesar cada item escaneado
    for (const item of items_entregados) {
      const { barcode_escaneado, cantidad_entregada } = item;
      
      // 2. Obtener la unidad por codigo de barras
      const [unidades] = await connection.query("SELECT * FROM Tbl_Unidades_Material WHERE identificador_barcode = ?", [barcode_escaneado]);
      if (unidades.length === 0) {
        throw new Error(`Código de barras no encontrado: ${barcode_escaneado}`);
      }
      const unidad = unidades[0];

      // 3. Validar que el material corresponda al vale
      const [detalleVale] = await connection.query(
        "SELECT * FROM Tbl_Vales_Detalle WHERE id_vale = ? AND id_material_base = ?", 
        [id, unidad.id_material_base]
      );
      if (detalleVale.length === 0) {
        throw new Error(`El material ${barcode_escaneado} no corresponde a este vale.`);
      }

      // 4. Actualizar la unidad o consumible
      if (unidad.cantidad_stock === 1) { // Es Equipo o Herramienta
        // Actualizar el detalle del vale con la unidad específica
        await connection.query(
          "UPDATE Tbl_Vales_Detalle SET id_unidad_entregada = ?, cantidad_entregada = 1 WHERE id_vale = ? AND id_material_base = ? AND id_unidad_entregada IS NULL LIMIT 1",
          [unidad.id_unidad, id, unidad.id_material_base]
        );
        // Cambiar estado del material
        await connection.query("UPDATE Tbl_Unidades_Material SET id_estado = ? WHERE id_unidad = ?", [id_estado_prestado, unidad.id_unidad]);
      
      } else { // Es Consumible
        if (unidad.cantidad_stock < cantidad_entregada) {
          throw new Error(`Stock insuficiente para ${barcode_escaneado}. Stock: ${unidad.cantidad_stock}`);
        }
        // Actualizar detalle del vale
        await connection.query(
          "UPDATE Tbl_Vales_Detalle SET id_unidad_entregada = ?, cantidad_entregada = ? WHERE id_vale = ? AND id_material_base = ?",
          [unidad.id_unidad, cantidad_entregada, id, unidad.id_material_base]
        );
        // Descontar stock
        await connection.query(
          "UPDATE Tbl_Unidades_Material SET cantidad_stock = cantidad_stock - ? WHERE id_unidad = ?",
          [cantidad_entregada, unidad.id_unidad]
        );
      }
    }

    // 5. Actualizar el estado del vale a Entregado
    await connection.query(
      "UPDATE Tbl_Vales SET id_estado_vale = ?, id_almacenista_entrega = ?, fecha_hora_entrega_real = CURRENT_TIMESTAMP WHERE id_vale = ?",
      [id_estado_vale_entregado, id_almacenista_entrega, id]
    );

    // 6. Confirmar transacción
    await connection.commit();
    connection.release();
    
    res.status(200).json({ mensaje: 'Material entregado exitosamente' });

  } catch (error) {
    console.error('Error en la transacción de entrega:', error);
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: 'Error al registrar la entrega', detalle: error.message });
  }
};

/**
 * POST /api/vales/:id/devolver
 * Registra la devolución de material con lector
 */
export const registrarDevolucion = async (req, res) => {
  const { id } = req.params; // id del vale
  const id_almacenista_devolucion = req.usuario.id_usuario;
  const { items_devueltos } = req.body; 

  if (!items_devueltos || items_devueltos.length === 0) {
    return res.status(400).json({ error: 'No se escanearon items para devolver' });
  }
  
  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();

    const id_estado_vale_devuelto = await getEstadoId('Devuelto');
    
    // 1. Procesar cada item devuelto
    for (const item of items_devueltos) {
      const { barcode_escaneado, condicion } = item; // condicion: "Disponible" o "Mantenimiento"

      // 2. Obtener la unidad por codigo de barras
      const [unidades] = await connection.query("SELECT * FROM Tbl_Unidades_Material WHERE identificador_barcode = ?", [barcode_escaneado]);
      if (unidades.length === 0) throw new Error(`Código de barras no encontrado: ${barcode_escaneado}`);
      const unidad = unidades[0];

      // 3. Validar que la unidad corresponda a este vale
      const [detalleVale] = await connection.query(
        "SELECT * FROM Tbl_Vales_Detalle WHERE id_vale = ? AND id_unidad_entregada = ?",
        [id, unidad.id_unidad]
      );
      if (detalleVale.length === 0) {
        throw new Error(`El material ${barcode_escaneado} no fue entregado en este vale.`);
      }

      // 4. Actualizar estado del material
      const id_nuevo_estado_mat = await getEstadoMaterialId(condicion);
      await connection.query("UPDATE Tbl_Unidades_Material SET id_estado = ? WHERE id_unidad = ?", [id_nuevo_estado_mat, unidad.id_unidad]);
      
    }

    // 5. Actualizar el estado del Vale a Devuelto
    const [vale] = await connection.query("SELECT fecha_devolucion_esperada FROM Tbl_Vales WHERE id_vale = ?", [id]);
    const fecha_esperada = new Date(vale[0].fecha_devolucion_esperada);
    const fecha_real = new Date();
    
    const estatus_devolucion = (fecha_real > fecha_esperada) ? 'Con retraso' : 'A tiempo';
    
    await connection.query(
      "UPDATE Tbl_Vales SET id_estado_vale = ?, id_almacenista_devolucion = ?, fecha_hora_devolucion_real = ?, estatus_devolucion = ? WHERE id_vale = ?",
      [id_estado_vale_devuelto, id_almacenista_devolucion, fecha_real, estatus_devolucion, id]
    );
    
    // 6. Confirmar transacción
    await connection.commit();
    connection.release();
    
    res.status(200).json({ mensaje: `Material devuelto '${estatus_devolucion}'`, estatus_devolucion });

  } catch (error) {
    console.error('Error en la transacción de devolución:', error);
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: 'Error al registrar la devolución', detalle: error.message });
  }
};