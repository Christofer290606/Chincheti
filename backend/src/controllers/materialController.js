import db from '../config/db.js'; 

/**
 * GET /api/catalogos
 * Obtiene todos los catálogos necesarios para los formularios de inventario.
 */
export const getCatalogos = async (req, res) => {
  try {
    const [categorias] = await db.promise().query("SELECT id_categoria, nombre_categoria FROM Tbl_Categorias ORDER BY nombre_categoria");
    const [almacenes] = await db.promise().query("SELECT id_almacen, nombre_almacen, codigo_almacen FROM Tbl_Almacenes ORDER BY nombre_almacen");
    const [carreras] = await db.promise().query("SELECT id_carrera, nombre_carrera, codigo_carrera FROM Tbl_Carreras ORDER BY nombre_carrera");
    const [estados] = await db.promise().query("SELECT id_estado, nombre_estado FROM Tbl_Estados_Material ORDER BY id_estado");

    res.status(200).json({
      categorias,
      almacenes,
      carreras,
      estados_material: estados
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los catálogos' });
  }
};

/**
 * GET /api/materiales
 * Obtiene la lista general de materiales con conteo de unidades.
 */
export const getMateriales = async (req, res) => {
  try {
    // Obtiene la lista general con conteo de disponibilidad
    const query = `
      SELECT
        m.id_material,
        m.nombre,
        c.nombre_categoria,
        (SELECT COUNT(u.id_unidad) FROM Tbl_Unidades_Material u WHERE u.id_material_base = m.id_material) AS total_unidades,
        (SELECT COUNT(u.id_unidad) FROM Tbl_Unidades_Material u JOIN Tbl_Estados_Material e ON u.id_estado = e.id_estado WHERE u.id_material_base = m.id_material AND e.nombre_estado = 'Disponible') AS unidades_disponibles
      FROM Tbl_Materiales m
      JOIN Tbl_Categorias c ON m.id_categoria = c.id_categoria
      ORDER BY m.nombre;
    `;
    
    const [materiales] = await db.promise().query(query);
    res.status(200).json({ materiales });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los materiales' });
  }
};

/**
 * GET /api/materiales/:id
 * Obtiene el detalle de una plantilla de material Y la lista de sus unidades físicas.
 */
export const getMaterialById = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Obtener detalle de la plantilla
    const [materiales] = await db.promise().query("SELECT * FROM Tbl_Materiales WHERE id_material = ?", [id]);
    if (materiales.length === 0) {
      return res.status(404).json({ error: 'Material no encontrado' });
    }
    const detalle_material = materiales[0];

    // 2. Obtener sus unidades físicas
    const queryUnidades = `
      SELECT
        u.id_unidad,
        u.identificador_barcode,
        e.nombre_estado,
        e.color_tag
      FROM Tbl_Unidades_Material u
      JOIN Tbl_Estados_Material e ON u.id_estado = e.id_estado
      WHERE u.id_material_base = ?
      ORDER BY u.identificador_barcode;
    `;
    const [unidades] = await db.promise().query(queryUnidades, [id]);

    res.status(200).json({ detalle_material, unidades });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el detalle del material' });
  }
};


/**
 * POST /api/materiales
 * Crea una nueva plantilla de material Y sus unidades físicas correspondientes.
 * Utiliza transacciones para asegurar la integridad.
 */
export const crearMaterial = async (req, res) => {
  const {
    nombre, marca, modelo, ano_modelo, id_categoria, id_almacen,
    id_carrera_exclusiva, plan_mto_dias, plan_mto_usos, mto_ligeros_max,
    descripcion, mto_es_interno, cantidad
  } = req.body;

  // Validación básica
  if (!nombre || !marca || !modelo || !ano_modelo || !id_categoria || !id_almacen || !cantidad) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  
  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();

    // 1. Insertar la plantilla (Tbl_Materiales)
    const queryMaterial = `
      INSERT INTO Tbl_Materiales (
        nombre, descripcion, marca, modelo, ano_modelo, id_categoria, id_almacen, 
        id_carrera_exclusiva, plan_mto_dias, plan_mto_usos, mto_es_interno, mto_ligeros_max
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const [resultMaterial] = await connection.query(queryMaterial, [
      nombre, descripcion || null, marca, modelo, ano_modelo, id_categoria, id_almacen,
      id_carrera_exclusiva || null, plan_mto_dias || null, plan_mto_usos || null,
      mto_es_interno || true, mto_ligeros_max || 0
    ]);
    
    const id_material_nuevo = resultMaterial.insertId;

    // 2. Obtener datos para generar el codigo de barras
    const [categoriaData] = await connection.query("SELECT nombre_categoria FROM Tbl_Categorias WHERE id_categoria = ?", [id_categoria]);
    const [almacenData] = await connection.query("SELECT codigo_almacen FROM Tbl_Almacenes WHERE id_almacen = ?", [id_almacen]);
    let codigoCarrera = 'GEN'; // General si es nulo
    if (id_carrera_exclusiva) {
      const [carreraData] = await connection.query("SELECT codigo_carrera FROM Tbl_Carreras WHERE id_carrera = ?", [id_carrera_exclusiva]);
      if (carreraData.length > 0) {
        codigoCarrera = carreraData[0].codigo_carrera;
      }
    }
    
    const nombreCategoria = categoriaData[0].nombre_categoria;
    const prefijoNombre = nombre.substring(0, 3).toUpperCase();
    const idMaterialStr = String(id_material_nuevo).padStart(6, '0');
    const codigoAlmacen = almacenData[0].codigo_almacen;

    const barcodeBase = `${prefijoNombre}${idMaterialStr}${codigoCarrera}${codigoAlmacen}`;
    
    // 3. Insertar las Unidades Físicas
    const [estadoDefault] = await connection.query("SELECT id_estado FROM Tbl_Estados_Material WHERE nombre_estado = 'Disponible'");
    const id_estado_disponible = estadoDefault[0].id_estado;

    const unidades_creadas = [];
    
    // Si es Consumible, crear 1 solo registro con la cantidad
    if (nombreCategoria === 'Consumible') {
      const barcode = barcodeBase;
      const queryUnidad = "INSERT INTO Tbl_Unidades_Material (id_material_base, identificador_barcode, id_estado, cantidad_stock) VALUES (?, ?, ?, ?)";
      const [resultUnidad] = await connection.query(queryUnidad, [id_material_nuevo, barcode, id_estado_disponible, cantidad]);
      unidades_creadas.push({ id_unidad: resultUnidad.insertId, identificador_barcode: barcode });
    } 
    // Si es Equipo o Herramienta, crear N registros
    else {
      const queryUnidad = "INSERT INTO Tbl_Unidades_Material (id_material_base, identificador_barcode, id_estado, cantidad_stock) VALUES (?, ?, ?, ?)";
      for (let i = 0; i < cantidad; i++) {
        // Manejo de duplicados: si cantidad > 1, añade un sufijo
        const barcode = (i === 0) ? barcodeBase : `${barcodeBase}-${i + 1}`; 
        
        const [resultUnidad] = await connection.query(queryUnidad, [id_material_nuevo, barcode, id_estado_disponible, 1]);
        unidades_creadas.push({ id_unidad: resultUnidad.insertId, identificador_barcode: barcode });
      }
    }

    // 4. Confirmar transacción
    await connection.commit();
    connection.release();
    
    res.status(201).json({
      mensaje: 'Material y unidades creados exitosamente',
      id_material: id_material_nuevo,
      unidades_creadas
    });

  } catch (error) {
    console.error('Error en la transacción:', error);
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: 'Error al crear el material', detalle: error.message });
  }
};

/**
 * PUT /api/materiales/:id
 * Actualiza la información de la plantilla de un material.
 */
export const actualizarMaterial = async (req, res) => {
  const { id } = req.params;
  const {
    nombre, marca, modelo, ano_modelo, id_categoria, id_almacen,
    id_carrera_exclusiva, plan_mto_dias, plan_mto_usos, mto_ligeros_max,
    descripcion, mto_es_interno
  } = req.body;
  
  // Solo se pueden modificar estos campos
  const query = `
    UPDATE Tbl_Materiales SET
      descripcion = ?,
      marca = ?,
      modelo = ?,
      ano_modelo = ?,
      id_categoria = ?,
      id_almacen = ?,
      id_carrera_exclusiva = ?,
      plan_mto_dias = ?,
      plan_mto_usos = ?,
      mto_es_interno = ?,
      mto_ligeros_max = ?
    WHERE id_material = ?;
  `;

  try {
    const [result] = await db.promise().query(query, [
      descripcion || null, marca, modelo, ano_modelo, id_categoria, id_almacen,
      id_carrera_exclusiva || null, plan_mto_dias || null, plan_mto_usos || null,
      mto_es_interno || true, mto_ligeros_max || 0,
      id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Material no encontrado' });
    }
    
    res.status(200).json({ mensaje: 'Material actualizado exitosamente' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar el material' });
  }
};

/**
 * PATCH /api/unidades/:id/baja
 * Da de baja una unidad física específica, cambia su estado.
 */
export const bajaUnidad = async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Obtener el ID del estado de Baja.
    const [estadoBaja] = await db.promise().query("SELECT id_estado FROM Tbl_Estados_Material WHERE nombre_estado = 'Baja'");
    if (estadoBaja.length === 0) {
      return res.status(500).json({ error: 'Estado "Baja" no configurado en la base de datos' });
    }
    const id_estado_baja = estadoBaja[0].id_estado;

    // 2. Actualizar la unidad
    const query = "UPDATE Tbl_Unidades_Material SET id_estado = ? WHERE id_unidad = ?";
    const [result] = await db.promise().query(query, [id_estado_baja, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Unidad de material no encontrada' });
    }

    // Registrar la fecha y hora.
    res.status(200).json({ mensaje: 'Unidad dada de baja exitosamente' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al dar de baja la unidad' });
  }
};

/**
 * GET /api/unidades/barcode/:barcode
 * Obtiene la información de una unidad específica por su código de barras.
 * Esencial para el lector de códigos.
 */
export const getUnidadByBarcode = async (req, res) => {
  const { barcode } = req.params;
  try {
    const query = `
      SELECT
        u.id_unidad,
        u.identificador_barcode,
        u.cantidad_stock,
        m.id_material,
        m.nombre,
        m.marca,
        m.modelo,
        c.nombre_categoria,
        e.nombre_estado
      FROM Tbl_Unidades_Material u
      JOIN Tbl_Materiales m ON u.id_material_base = m.id_material
      JOIN Tbl_Categorias c ON m.id_categoria = c.id_categoria
      JOIN Tbl_Estados_Material e ON u.id_estado = e.id_estado
      WHERE u.identificador_barcode = ?;
    `;
    
    const [unidades] = await db.promise().query(query, [barcode]);
    
    if (unidades.length === 0) {
      return res.status(404).json({ error: 'Material con ese código de barras no encontrado' });
    }

    res.status(200).json({ unidad: unidades[0] });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al consultar el código de barras' });
  }
};