import db from '../config/db.js';

/**
 * Función Auxiliar: Añade filtros de fecha a una consulta SQL
 */
const aplicarFiltrosFecha = (query, params, fecha_inicio, fecha_fin, campoFecha) => {
  let queryModificada = query;
  if (fecha_inicio) {
    queryModificada += ` AND ${campoFecha} >= ?`;
    params.push(fecha_inicio);
  }
  if (fecha_fin) {
    queryModificada += ` AND ${campoFecha} <= ?`;
    params.push(fecha_fin);
  }
  return queryModificada;
};


/**
 * GET /api/estadisticas/resumen
 * Devuelve conteos generales para tarjetas de resumen (Dashboard)
 */
export const getResumenGeneral = async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query;
  try {
    const params = [];
    let filtroFechasVales = '';
    if (fecha_inicio) {
        filtroFechasVales += ' AND v.fecha_emision >= ?';
        params.push(fecha_inicio);
    }
    if (fecha_fin) {
        filtroFechasVales += ' AND v.fecha_emision <= ?';
        params.push(fecha_fin);
    }

    const query = `
      SELECT
        (SELECT COUNT(id_vale) FROM Tbl_Vales v WHERE 1=1 ${filtroFechasVales}) AS total_vales,
        (SELECT COUNT(id_incidencia) FROM Tbl_Incidencias i WHERE estado_incidencia = 'Abierta') AS incidencias_abiertas,
        (SELECT COUNT(id_mantenimiento) FROM Tbl_Mantenimientos m WHERE estado_mantenimiento = 'En Progreso') AS mantenimientos_activos,
        (SELECT COUNT(id_unidad) FROM Tbl_Unidades_Material um JOIN Tbl_Estados_Material em ON um.id_estado = em.id_estado WHERE em.nombre_estado = 'Disponible') AS unidades_disponibles;
    `;
    
    const [results] = await db.promise().query(query, params);
    res.status(200).json(results[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el resumen general' });
  }
};


/**
 * GET /api/estadisticas/uso-materiales
 * Devuelve el conteo de préstamos agrupados por categoría de material.
 */
export const getUsoMateriales = async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query; // Filtros de fecha
  try {
    const params = [];
    let query = `
      SELECT
        c.nombre_categoria AS categoria,
        COUNT(vd.id_vale_detalle) AS total_prestamos
      FROM Tbl_Vales_Detalle vd
      JOIN Tbl_Materiales m ON vd.id_material_base = m.id_material
      JOIN Tbl_Categorias c ON m.id_categoria = c.id_categoria
      JOIN Tbl_Vales v ON vd.id_vale = v.id_vale
      WHERE vd.id_unidad_entregada IS NOT NULL
    `;
    
    query = aplicarFiltrosFecha(query, params, fecha_inicio, fecha_fin, 'v.fecha_emision');
    query += " GROUP BY c.nombre_categoria ORDER BY total_prestamos DESC;";

    const [results] = await db.promise().query(query, params);
    res.status(200).json(results);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener estadísticas de uso de materiales' });
  }
};


/**
 * GET /api/estadisticas/vales-tipo
 * Devuelve el conteo de vales agrupados por tipo (Clase vs Extra-clase).
 */
export const getValesPorTipo = async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query;
  try {
    const params = [];
    let query = `
      SELECT
        tipo_vale,
        COUNT(id_vale) AS total
      FROM Tbl_Vales
      WHERE 1=1
    `;
    
    query = aplicarFiltrosFecha(query, params, fecha_inicio, fecha_fin, 'fecha_emision');
    query += " GROUP BY tipo_vale ORDER BY total DESC;";

    const [results] = await db.promise().query(query, params);
    res.status(200).json(results);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener estadísticas de vales por tipo' });
  }
};


/**
 * GET /api/estadisticas/incidencias-tipo
 * Devuelve el conteo de incidencias agrupadas por tipo.
 */
export const getIncidenciasPorTipo = async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query;
  try {
    const params = [];
    let query = `
      SELECT
        ti.nombre_tipo,
        COUNT(i.id_incidencia) AS total
      FROM Tbl_Incidencias i
      JOIN Tbl_Tipos_Incidencia ti ON i.id_tipo_incidencia = ti.id_tipo_incidencia
      WHERE 1=1
    `;
    
    query = aplicarFiltrosFecha(query, params, fecha_inicio, fecha_fin, 'i.fecha_registro');
    query += " GROUP BY ti.nombre_tipo ORDER BY total DESC;";

    const [results] = await db.promise().query(query, params);
    res.status(200).json(results);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener estadísticas de incidencias por tipo' });
  }
};


/**
 * GET /api/estadisticas/ranking-materiales
 * Devuelve el Top de materiales más solicitados.
 */
export const getRankingMateriales = async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query;
  try {
    const params = [];
    let query = `
      SELECT
        m.nombre AS material,
        COUNT(vd.id_vale_detalle) AS solicitudes
      FROM Tbl_Vales_Detalle vd
      JOIN Tbl_Materiales m ON vd.id_material_base = m.id_material
      JOIN Tbl_Vales v ON vd.id_vale = v.id_vale
      WHERE 1=1
    `;
    
    query = aplicarFiltrosFecha(query, params, fecha_inicio, fecha_fin, 'v.fecha_emision');
    query += " GROUP BY m.nombre ORDER BY solicitudes DESC LIMIT 10;";

    const [results] = await db.promise().query(query, params);
    res.status(200).json(results);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el ranking de materiales' });
  }
};  