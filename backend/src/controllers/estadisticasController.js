import db from '../config/db.js';

// --- 1. RESUMEN DASHBOARD (Igual) ---
export const getResumen = async (req, res) => {
  try {
    const connection = await db.promise();
    
    // 1. CONSULTA PRINCIPAL DE VALES
    const [vales] = await connection.query(`
      SELECT 
        COUNT(*) as total,
        
        -- [CORRECCIÓN] Pendientes de Atención (Work Inbox):
        -- ID 1: Pendiente Maestro (Aun no llega al almacén, pero es una solicitud viva)
        -- ID 2: Pendiente Almacenista (Requiere aprobación)
        -- ID 3: Aprobado (Requiere entrega física del material)
        SUM(CASE WHEN id_estado_vale IN (1, 2, 3) THEN 1 ELSE 0 END) as pendientes,
        
        -- [CORRECCIÓN] Préstamos Activos (Material fuera del almacén):
        -- ID 5: Entregado (El alumno tiene el material)
        SUM(CASE WHEN id_estado_vale = 5 THEN 1 ELSE 0 END) as activos

      FROM Tbl_Vales
    `);

    // 2. INCIDENCIAS (Abiertas o Pendientes)
    // Ajusta los strings 'Abierta'/'Pendiente' si en tu BD usas IDs numéricos para incidencias también.
    const [incidencias] = await connection.query(`
        SELECT COUNT(*) as total 
        FROM Tbl_Incidencias 
        WHERE estado_incidencia IN ('Abierta', 'Pendiente')
    `);
    
    // 3. UNIDADES EN MANTENIMIENTO
    const [unidades] = await connection.query(`
      SELECT 
        SUM(CASE WHEN id_estado = 3 THEN 1 ELSE 0 END) as mantenimiento,
        SUM(CASE WHEN id_estado = 1 THEN 1 ELSE 0 END) as disponibles
      FROM Tbl_Unidades_Material
    `);

    // RESPUESTA AL FRONTEND
    const respuesta = {
      vales_totales: Number(vales[0].total) || 0,
      vales_pendientes: Number(vales[0].pendientes) || 0, 
      vales_activos: Number(vales[0].activos) || 0,
      incidencias_abiertas: Number(incidencias[0].total) || 0,
      equipos_mantenimiento: Number(unidades[0].mantenimiento) || 0,
      unidades_disponibles: Number(unidades[0].disponibles) || 0
    };

    console.log("Resumen Dashboard:", respuesta); // Para depurar en consola
    res.status(200).json(respuesta);

  } catch (error) { 
      console.error("Error en getResumen:", error);
      res.status(500).json({ error: 'Error al obtener resumen del dashboard' }); 
  }
};

// --- HELPER FILTROS SEGURO (MAPPING) ---
/**
 * map: Objeto que define qué alias SQL usar para cada filtro.
 * Si una clave no existe en 'map', ese filtro se ignora para evitar errores SQL.
 * Claves esperadas: fecha, rol, almacen, categoria, estadoMat, tipoVale, tipoIncidencia
 */
const construirFiltros = (req, map) => {
    const { 
        fecha_inicio, fecha_fin, 
        id_rol, id_almacen, id_categoria, 
        id_estado_material, tipo_vale, id_tipo_incidencia 
    } = req.query;

    let where = " WHERE 1=1";
    const params = [];

    // 1. FECHA (RQF19)
    if (map.fecha && fecha_inicio && fecha_fin) {
        where += ` AND ${map.fecha} BETWEEN ? AND ?`;
        params.push(fecha_inicio, fecha_fin);
    }

    // 2. ROL USUARIO
    if (map.rol && id_rol) {
        where += ` AND ${map.rol} = ?`;
        params.push(id_rol);
    }

    // 3. ALMACÉN
    if (map.almacen && id_almacen) {
        where += ` AND ${map.almacen} = ?`;
        params.push(id_almacen);
    }

    // 4. CATEGORÍA
    if (map.categoria && id_categoria) {
        where += ` AND ${map.categoria} = ?`;
        params.push(id_categoria);
    }

    // 5. ESTADO MATERIAL (RQF19)
    if (map.estadoMat && id_estado_material) {
        where += ` AND ${map.estadoMat} = ?`;
        params.push(id_estado_material);
    }

    // 6. TIPO DE VALE (RQF19)
    if (map.tipoVale && tipo_vale) {
        where += ` AND ${map.tipoVale} = ?`;
        params.push(tipo_vale);
    }

    // 7. TIPO INCIDENCIA (RQF19)
    if (map.tipoIncidencia && id_tipo_incidencia) {
        where += ` AND ${map.tipoIncidencia} = ?`;
        params.push(id_tipo_incidencia);
    }

    return { where, params };
};

// --- 2. ENDPOINTS DE GRÁFICAS ---

export const getUsoMateriales = async (req, res) => {
    try {
        const connection = await db.promise();
        // Mapeamos solo lo que esta consulta puede filtrar
        const { where, params } = construirFiltros(req, {
            fecha: 'v.fecha_recoleccion',
            rol: 'u.id_rol',
            almacen: 'm.id_almacen',
            categoria: 'm.id_categoria',
            tipoVale: 'v.tipo_vale'
        });

        const query = `
            SELECT c.nombre_categoria as name, COUNT(vd.id_vale_detalle) as value
            FROM Tbl_Vales_Detalle vd
            JOIN Tbl_Vales v ON vd.id_vale = v.id_vale
            JOIN Tbl_Usuarios u ON v.id_usuario_solicitante = u.id_usuario
            JOIN Tbl_Materiales m ON vd.id_material_base = m.id_material
            JOIN Tbl_Categorias c ON m.id_categoria = c.id_categoria
            ${where} GROUP BY c.nombre_categoria ORDER BY value DESC
        `;
        const [rows] = await connection.query(query, params);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const getValesTipo = async (req, res) => {
    try {
        const connection = await db.promise();
        const { where, params } = construirFiltros(req, {
            fecha: 'v.fecha_recoleccion',
            rol: 'u.id_rol',
            tipoVale: 'v.tipo_vale' // Filtro recursivo pero válido
        });
        const query = `
            SELECT v.tipo_vale as name, COUNT(DISTINCT v.id_vale) as value
            FROM Tbl_Vales v
            JOIN Tbl_Usuarios u ON v.id_usuario_solicitante = u.id_usuario
            ${where} GROUP BY v.tipo_vale
        `;
        const [rows] = await connection.query(query, params);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const getIncidenciasTipo = async (req, res) => {
    try {
        const connection = await db.promise();
        const { where, params } = construirFiltros(req, {
            fecha: 'i.fecha_registro',
            rol: 'u.id_rol', // Usuario afectado (si existe)
            almacen: 'm.id_almacen',
            categoria: 'm.id_categoria',
            tipoIncidencia: 'i.id_tipo_incidencia'
        }); 
        
        const query = `
            SELECT ti.nombre_tipo as name, COUNT(i.id_incidencia) as value
            FROM Tbl_Incidencias i
            JOIN Tbl_Tipos_Incidencia ti ON i.id_tipo_incidencia = ti.id_tipo_incidencia
            LEFT JOIN Tbl_Usuarios u ON i.id_usuario_afectado = u.id_usuario
            LEFT JOIN Tbl_Unidades_Material um ON i.id_unidad_afectada = um.id_unidad
            LEFT JOIN Tbl_Materiales m ON um.id_material_base = m.id_material
            ${where} GROUP BY ti.nombre_tipo
        `;
        const [rows] = await connection.query(query, params);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const getRankingMateriales = async (req, res) => {
    try {
        const connection = await db.promise();
        const { where, params } = construirFiltros(req, {
            fecha: 'v.fecha_recoleccion',
            rol: 'u.id_rol',
            almacen: 'm.id_almacen',
            categoria: 'm.id_categoria',
            tipoVale: 'v.tipo_vale'
        });
        const query = `
            SELECT m.nombre as name, COUNT(vd.id_vale_detalle) as value
            FROM Tbl_Vales_Detalle vd
            JOIN Tbl_Vales v ON vd.id_vale = v.id_vale
            JOIN Tbl_Usuarios u ON v.id_usuario_solicitante = u.id_usuario
            JOIN Tbl_Materiales m ON vd.id_material_base = m.id_material
            ${where}
            GROUP BY m.id_material, m.nombre
            ORDER BY value DESC
            LIMIT 10
        `;
        const [rows] = await connection.query(query, params);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const getEstadoInventario = async (req, res) => {
    try {
        const connection = await db.promise();
        // Inventario SOLO acepta filtros de estructura y estado, NO fecha ni rol
        const { where, params } = construirFiltros(req, {
            almacen: 'm.id_almacen',
            categoria: 'm.id_categoria',
            estadoMat: 'u.id_estado'
        });
        const query = `
            SELECT em.nombre_estado as name, COUNT(u.id_unidad) as value
            FROM Tbl_Unidades_Material u
            JOIN Tbl_Estados_Material em ON u.id_estado = em.id_estado
            JOIN Tbl_Materiales m ON u.id_material_base = m.id_material
            ${where} GROUP BY em.nombre_estado
        `;
        const [rows] = await connection.query(query, params);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const getMantenimientos = async (req, res) => {
    try {
        const connection = await db.promise();
        const { where, params } = construirFiltros(req, {
            fecha: 'mt.fecha_inicio',
            almacen: 'm.id_almacen',
            categoria: 'm.id_categoria'
        });
        const query = `
            SELECT tm.nombre_tipo as name, COUNT(mt.id_mantenimiento) as value
            FROM Tbl_Mantenimientos mt
            JOIN Tbl_Tipos_Mantenimiento tm ON mt.id_tipo_mantenimiento = tm.id_tipo_mantenimiento
            JOIN Tbl_Unidades_Material um ON mt.id_unidad = um.id_unidad
            JOIN Tbl_Materiales m ON um.id_material_base = m.id_material
            ${where} GROUP BY tm.nombre_tipo
        `;
        const [rows] = await connection.query(query, params);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const getCumplimientoEntregas = async (req, res) => {
    try {
        const connection = await db.promise();
        const { where, params } = construirFiltros(req, {
            fecha: 'v.fecha_recoleccion',
            rol: 'u.id_rol',
            tipoVale: 'v.tipo_vale'
        });
        const query = `
            SELECT COALESCE(v.estatus_devolucion, 'Pendiente') as name, COUNT(v.id_vale) as value
            FROM Tbl_Vales v
            JOIN Tbl_Usuarios u ON v.id_usuario_solicitante = u.id_usuario
            ${where} AND v.id_estado_vale IN (6)
            GROUP BY v.estatus_devolucion
        `;
        const [rows] = await connection.query(query, params);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// --- 3. CATÁLOGOS EXPANDIDOS (RQF19) ---
export const getCatalogosEstadisticas = async (req, res) => {
    try {
        const connection = await db.promise();
        const { nombre_rol, id_usuario } = req.usuario;

        const [roles] = await connection.query("SELECT id_rol, nombre_rol FROM Tbl_Roles WHERE nombre_rol IN ('alumno', 'maestro', 'docente') ORDER BY nombre_rol");
        const [categorias] = await connection.query("SELECT DISTINCT c.id_categoria, c.nombre_categoria FROM Tbl_Categorias c JOIN Tbl_Materiales m ON c.id_categoria = m.id_categoria ORDER BY c.nombre_categoria");
        
        // Nuevos catálogos para RQF19
        const [estadosMat] = await connection.query("SELECT id_estado, nombre_estado FROM Tbl_Estados_Material");
        const [tiposInc] = await connection.query("SELECT id_tipo_incidencia, nombre_tipo FROM Tbl_Tipos_Incidencia");

        let queryAlmacen = "SELECT id_almacen, nombre_almacen FROM Tbl_Almacenes";
        let paramsAlm = [];
        if (nombre_rol === 'coordinador') {
             const [trabajador] = await connection.query("SELECT id_carrera FROM Tbl_Trabajadores WHERE id_usuario = ?", [id_usuario]);
             if (trabajador.length && trabajador[0].id_carrera) {
                 queryAlmacen += " WHERE id_carrera = ?"; paramsAlm.push(trabajador[0].id_carrera);
             }
        }
        const [almacenes] = await connection.query(queryAlmacen, paramsAlm);

        res.json({ roles, categorias, almacenes, estadosMat, tiposInc });
    } catch (e) { res.status(500).json({ error: e.message }); }
};