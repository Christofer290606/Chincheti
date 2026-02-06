import db from '../config/db.js';
import bwipjs from 'bwip-js'; 
import fs from 'fs';          
import path from 'path';      
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BARCODE_DIR = path.join(__dirname, '../public/barcodes');

// Asegurar que el directorio de códigos de barras existe
if (!fs.existsSync(BARCODE_DIR)){
    fs.mkdirSync(BARCODE_DIR, { recursive: true });
}

// --- RQF25: BUSCADOR UNIVERSAL (CORREGIDO) ---
export const buscarMaterialesYUnidades = async (req, res) => {
    const { q } = req.query;
    // Extraemos datos del usuario (Soporta tanto 'rol' como 'nombre_rol' por seguridad)
    const { nombre_rol, rol, id_almacen, id_carrera } = req.usuario; 
    const userRol = nombre_rol || rol; // Usamos el que venga definido

    if (!q || q.length < 3) {
        return res.status(400).json({ error: "Ingrese al menos 3 caracteres." });
    }

    const pool = db.promise();

    try {
        let query = `
            SELECT 
                u.id_unidad, 
                u.identificador_barcode, 
                u.id_estado, 
                em.nombre_estado,
                m.id_material, 
                m.nombre as nombre_material, 
                m.marca, 
                m.modelo,
                c.nombre_categoria,
                a.nombre_almacen
            FROM Tbl_Unidades_Material u
            JOIN Tbl_Materiales m ON u.id_material_base = m.id_material
            JOIN Tbl_Categorias c ON m.id_categoria = c.id_categoria
            JOIN Tbl_Estados_Material em ON u.id_estado = em.id_estado
            JOIN Tbl_Almacenes a ON m.id_almacen = a.id_almacen
            WHERE (u.identificador_barcode LIKE ? OR m.nombre LIKE ?)
        `;

        const params = [`%${q}%`, `%${q}%`];

        // --- FILTROS DE SEGURIDAD ---
        
        // 1. ALMACENISTA: Solo ve SU almacén
        if (userRol === 'almacenista') {
            if (!id_almacen) return res.json([]); 
            query += ` AND m.id_almacen = ?`;
            params.push(id_almacen);
        }
        
        // 2. COORDINADOR: Solo ve materiales de SU carrera
        else if (userRol === 'coordinador') {
            if (!id_carrera) return res.json([]); 
            query += ` AND a.id_carrera = ?`;
            params.push(id_carrera);
        }

        // --- ORDENAMIENTO ---
        query += `
            ORDER BY 
                CASE 
                    WHEN u.identificador_barcode = ? THEN 1
                    WHEN m.nombre = ? THEN 2
                    ELSE 3 
                END ASC,
                m.nombre ASC
            LIMIT 20
        `;
        
        params.push(q, q);

        const [resultados] = await pool.query(query, params);
        res.json(resultados);

    } catch (error) {
        console.error("Error en buscador:", error);
        res.status(500).json({ error: "Error en el servidor al buscar." });
    }
};

export const getCatalogos = async (req, res) => {
  try {
    const [categorias] = await db.promise().query("SELECT id_categoria, nombre_categoria FROM Tbl_Categorias ORDER BY nombre_categoria");
    const [almacenes] = await db.promise().query("SELECT id_almacen, nombre_almacen, codigo_almacen,id_carrera FROM Tbl_Almacenes ORDER BY nombre_almacen");
    const [carreras] = await db.promise().query("SELECT id_carrera, nombre_carrera, codigo_carrera FROM Tbl_Carreras ORDER BY nombre_carrera");
    const [estados] = await db.promise().query("SELECT id_estado, nombre_estado FROM Tbl_Estados_Material ORDER BY id_estado");
    res.status(200).json({ categorias, almacenes, carreras, estados_material: estados });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Error catálogos' }); }
};

export const getMateriales = async (req, res) => {
  try {
    const query = `
      SELECT 
        m.*,
        a.nombre_almacen,
        a.id_carrera as id_carrera_almacen,
        m.solo_maestros,
        m.semestre_minimo,
        (SELECT COUNT(*) FROM Tbl_Unidades_Material u JOIN Tbl_Estados_Material em ON u.id_estado = em.id_estado WHERE u.id_material_base = m.id_material AND em.nombre_estado = 'Disponible') as conteo_disponible,
        (SELECT COUNT(*) FROM Tbl_Unidades_Material u JOIN Tbl_Estados_Material em ON u.id_estado = em.id_estado WHERE u.id_material_base = m.id_material AND em.nombre_estado = 'Prestado') as conteo_prestado,
        (SELECT COUNT(*) FROM Tbl_Unidades_Material u JOIN Tbl_Estados_Material em ON u.id_estado = em.id_estado WHERE u.id_material_base = m.id_material AND em.nombre_estado LIKE '%Mantenimiento%') as conteo_mantenimiento,
        (SELECT COUNT(*) FROM Tbl_Unidades_Material u JOIN Tbl_Estados_Material em ON u.id_estado = em.id_estado WHERE u.id_material_base = m.id_material AND em.nombre_estado = 'Baja') as conteo_baja,
        (SELECT COUNT(*) FROM Tbl_Unidades_Material u JOIN Tbl_Estados_Material em ON u.id_estado = em.id_estado WHERE u.id_material_base = m.id_material AND em.nombre_estado IN ('Disponible', 'Prestado', 'Mantenimiento', 'En Mantenimiento')) as stock_total
      FROM Tbl_Materiales m
      JOIN Tbl_Almacenes a ON m.id_almacen = a.id_almacen
    `;
    const [materiales] = await db.promise().query(query);
    res.json({ materiales });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Error al obtener materiales' }); }
};

export const getMaterialById = async (req, res) => {
  const { id } = req.params;
  try {
    const queryMaterial = `
      SELECT m.*, a.nombre_almacen, a.id_carrera as id_carrera_almacen, m.solo_maestros, m.semestre_minimo,
        (SELECT COUNT(*) FROM Tbl_Unidades_Material u JOIN Tbl_Estados_Material em ON u.id_estado = em.id_estado WHERE u.id_material_base = m.id_material AND em.nombre_estado = 'Disponible') as conteo_disponible,
        (SELECT COUNT(*) FROM Tbl_Unidades_Material u WHERE u.id_material_base = m.id_material) as stock_total
      FROM Tbl_Materiales m JOIN Tbl_Almacenes a ON m.id_almacen = a.id_almacen WHERE m.id_material = ?
    `;
    const [rowsMat] = await db.promise().query(queryMaterial, [id]);
    if (rowsMat.length === 0) return res.status(404).json({ error: 'Material no encontrado' });

    const queryUnidades = `
        SELECT u.id_unidad, u.identificador_barcode, e.nombre_estado
        FROM Tbl_Unidades_Material u JOIN Tbl_Estados_Material e ON u.id_estado = e.id_estado
        WHERE u.id_material_base = ? ORDER BY u.identificador_barcode ASC
    `;
    const [rowsUnits] = await db.promise().query(queryUnidades, [id]);
    res.json({ detalle_material: rowsMat[0], unidades: rowsUnits });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Error al obtener el detalle del material' }); }
};

export const crearMaterial = async (req, res) => {
  let { nombre, marca, modelo, ano_modelo, id_categoria, id_almacen, id_carrera_exclusiva, plan_mto_dias, plan_mto_usos, mto_ligeros_max, descripcion, mto_es_interno, cantidad } = req.body;
  const usuario = req.usuario;
  const userRol = usuario.nombre_rol || usuario.rol;

  if (userRol === 'almacenista') {
    if (usuario.id_almacen && parseInt(id_almacen) !== usuario.id_almacen) return res.status(403).json({ error: 'Solo puedes registrar en tu almacén.' });
  }
  if (!nombre || !marca || !modelo || !ano_modelo || !id_categoria || !id_almacen || !cantidad) return res.status(400).json({ error: 'Faltan campos obligatorios' });
  
  const currentYear = new Date().getFullYear();
  if (parseInt(ano_modelo) < 2000 || parseInt(ano_modelo) > currentYear + 1) return res.status(400).json({ error: 'Año inválido' });
  if (!Number.isInteger(Number(cantidad)) || Number(cantidad) <= 0) return res.status(400).json({ error: 'Cantidad inválida' });

  const pool = db.promise();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [catData] = await connection.query("SELECT nombre_categoria FROM Tbl_Categorias WHERE id_categoria = ?", [id_categoria]);
    const esConsumible = (catData[0].nombre_categoria === 'Consumible');
    if (!esConsumible && !plan_mto_dias && !plan_mto_usos) {
        // Rollback manual antes de lanzar error, aunque el catch lo haría
        await connection.rollback();
        connection.release();
        return res.status(400).json({ error: 'El plan de mantenimiento es obligatorio para Equipos/Herramientas.' });
    }

    const [resultMat] = await connection.query(`INSERT INTO Tbl_Materiales (nombre, descripcion, marca, modelo, ano_modelo, id_categoria, id_almacen, id_carrera_exclusiva, plan_mto_dias, plan_mto_usos, mto_es_interno, mto_ligeros_max, proximo_id_unidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`, 
    [nombre, descripcion, marca, modelo, ano_modelo, id_categoria, id_almacen, id_carrera_exclusiva || null, plan_mto_dias, plan_mto_usos, mto_es_interno, mto_ligeros_max]);
    const id_material_nuevo = resultMat.insertId;

    const [almData] = await connection.query("SELECT codigo_almacen FROM Tbl_Almacenes WHERE id_almacen = ?", [id_almacen]);
    let codCarrera = 'GEN';
    if (id_carrera_exclusiva) {
        const [carData] = await connection.query("SELECT codigo_carrera FROM Tbl_Carreras WHERE id_carrera = ?", [id_carrera_exclusiva]);
        if(carData.length) codCarrera = carData[0].codigo_carrera;
    }

    const prefijoNombre = nombre.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
    const codAlmacen = almData[0].codigo_almacen;
    const [contadorRow] = await connection.query("SELECT proximo_id_unidad FROM Tbl_Materiales WHERE id_material = ? FOR UPDATE", [id_material_nuevo]);
    let contador_actual = contadorRow[0].proximo_id_unidad;

    const [stDisp] = await connection.query("SELECT id_estado FROM Tbl_Estados_Material WHERE nombre_estado = 'Disponible'");
    const id_disp = stDisp[0].id_estado;
    const loops = esConsumible ? 1 : cantidad;
    const stock = esConsumible ? cantidad : 1;

    for (let i = 0; i < loops; i++) {
        const idUnidadStr = String(contador_actual).padStart(6, '0');
        let barcodeFinal = `${prefijoNombre}${idUnidadStr}${codCarrera}${codAlmacen}`;
        let esUnico = false;
        let suffix = 0;

        while (!esUnico) {
            if (suffix > 0) barcodeFinal = `${prefijoNombre}${idUnidadStr}${codCarrera}${codAlmacen}-${suffix}`;
            const [check] = await connection.query("SELECT id_unidad FROM Tbl_Unidades_Material WHERE identificador_barcode = ?", [barcodeFinal]);
            if (check.length === 0) esUnico = true;
            else suffix++;
        }

        try {
            const png = await bwipjs.toBuffer({
                bcid:        'code128',
                text:        barcodeFinal,
                scale:       3,
                height:      20,
                includetext: true,
                textxalign:  'center',
                backgroundcolor: 'FFFFFF',
            });
            fs.writeFileSync(path.join(BARCODE_DIR, `${barcodeFinal}.png`), png);
        } catch (e) {
            console.error("Error generando imagen barcode:", e);
        }

        const [uRes] = await connection.query("INSERT INTO Tbl_Unidades_Material (id_material_base, identificador_barcode, id_estado, cantidad_stock) VALUES (?, ?, ?, ?)", [id_material_nuevo, barcodeFinal, id_disp, stock]);
        await connection.query("INSERT INTO Tbl_Historial_Materiales (id_material, id_unidad, accion, descripcion_cambio, id_usuario_responsable) VALUES (?, ?, ?, ?, ?)", [id_material_nuevo, uRes.insertId, 'CREACION', `Alta inicial: ${barcodeFinal}`, usuario.id_usuario]);
        contador_actual++;
    }

    await connection.query("UPDATE Tbl_Materiales SET proximo_id_unidad = ? WHERE id_material = ?", [contador_actual, id_material_nuevo]);
    await connection.commit();
    res.status(201).json({ mensaje: 'Material registrado exitosamente' });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error); 
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
};

export const actualizarMaterial = async (req, res) => {
  const { id } = req.params;
  const usuario = req.usuario;
  const userRol = usuario.nombre_rol || usuario.rol;
  const { descripcion, marca, modelo, ano_modelo, id_categoria, id_carrera_exclusiva, plan_mto_dias, plan_mto_usos, mto_es_interno, mto_ligeros_max, cantidad } = req.body;

  const currentYear = new Date().getFullYear();
  if (parseInt(ano_modelo) < 2000 || parseInt(ano_modelo) > currentYear + 1) return res.status(400).json({ error: 'Año inválido' });

  // Transacción opcional aquí, pero recomendado si actualizamos varias tablas
  const pool = db.promise();
  const connection = await pool.getConnection();

  try {
    if (userRol === 'almacenista') {
        const [check] = await connection.query("SELECT id_almacen FROM Tbl_Materiales WHERE id_material = ?", [id]);
        if(check.length && usuario.id_almacen && check[0].id_almacen !== usuario.id_almacen) {
             connection.release();
             return res.status(403).json({error:"Material de otro almacén"});
        }
    }

    const [catData] = await connection.query("SELECT nombre_categoria FROM Tbl_Categorias WHERE id_categoria = ?", [id_categoria]);
    const esConsumible = (catData[0].nombre_categoria === 'Consumible');
    if (!esConsumible && !plan_mto_dias && !plan_mto_usos) {
         connection.release();
         return res.status(400).json({ error: 'Mantenimiento obligatorio.' });
    }

    const query = `UPDATE Tbl_Materiales SET descripcion=?, marca=?, modelo=?, ano_modelo=?, id_categoria=?, id_carrera_exclusiva=?, plan_mto_dias=?, plan_mto_usos=?, mto_es_interno=?, mto_ligeros_max=? WHERE id_material=?`;
    await connection.query(query, [descripcion, marca, modelo, ano_modelo, id_categoria, id_carrera_exclusiva, plan_mto_dias, plan_mto_usos, mto_es_interno, mto_ligeros_max, id]);

    let descripcionCambio = 'Actualización de datos generales';
    if (esConsumible && cantidad !== undefined) {
        await connection.query("UPDATE Tbl_Unidades_Material SET cantidad_stock = ? WHERE id_material_base = ?", [cantidad, id]);
        descripcionCambio += ` y ajuste de stock a ${cantidad}`;
    }

    await connection.query("INSERT INTO Tbl_Historial_Materiales (id_material, accion, descripcion_cambio, id_usuario_responsable) VALUES (?, ?, ?, ?)",
    [id, 'MODIFICACION', 'Actualización de datos generales', usuario.id_usuario]);

    res.status(200).json({ mensaje: 'Actualizado correctamente' });
  } catch (error) { 
      console.error(error); 
      res.status(500).json({ error: 'Error al actualizar' }); 
  } finally {
      connection.release();
  }
};

export const bajaUnidad = async (req, res) => {
  const { id } = req.params;
  const usuario = req.usuario;
  const userRol = usuario.nombre_rol || usuario.rol;

  try {
    const [unidad] = await db.promise().query("SELECT m.id_material, m.id_almacen, u.identificador_barcode FROM Tbl_Unidades_Material u JOIN Tbl_Materiales m ON u.id_material_base = m.id_material WHERE u.id_unidad = ?", [id]);
    if (unidad.length === 0) return res.status(404).json({ error: 'Unidad no encontrada' });
    
    if (userRol === 'almacenista' && usuario.id_almacen && unidad[0].id_almacen !== usuario.id_almacen) return res.status(403).json({ error: 'Acceso denegado.' });

    const [stBaja] = await db.promise().query("SELECT id_estado FROM Tbl_Estados_Material WHERE nombre_estado = 'Baja'");
    await db.promise().query("UPDATE Tbl_Unidades_Material SET id_estado = ? WHERE id_unidad = ?", [stBaja[0].id_estado, id]);

    await db.promise().query("INSERT INTO Tbl_Historial_Materiales (id_material, id_unidad, accion, descripcion_cambio, id_usuario_responsable) VALUES (?, ?, ?, ?, ?)",
    [unidad[0].id_material, id, 'BAJA', `Baja de unidad ${unidad[0].identificador_barcode}`, usuario.id_usuario]);

    res.status(200).json({ mensaje: 'Unidad dada de baja' });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Error al dar de baja' }); }
};

export const getUnidadByBarcode = async (req, res) => {
  const { barcode } = req.params;
  try {
    const query = `SELECT u.id_unidad, u.identificador_barcode, u.cantidad_stock, m.id_material, m.nombre, m.marca, m.modelo, c.nombre_categoria, e.nombre_estado FROM Tbl_Unidades_Material u JOIN Tbl_Materiales m ON u.id_material_base = m.id_material JOIN Tbl_Categorias c ON m.id_categoria = c.id_categoria JOIN Tbl_Estados_Material e ON u.id_estado = e.id_estado WHERE u.identificador_barcode = ?;`;
    const [unidades] = await db.promise().query(query, [barcode]);
    if (unidades.length === 0) return res.status(404).json({ error: 'Material no encontrado' });
    res.status(200).json({ unidad: unidades[0] });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Error al consultar barcode' }); }
};