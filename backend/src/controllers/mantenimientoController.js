import db from '../config/db.js';

// --- A. REGISTRAR MANTENIMIENTO ---
export const registrarMantenimiento = async (req, res) => {
    const { 
        id_unidad, id_tipo_mantenimiento, descripcion, 
        fecha_inicio, fecha_fin_estimada, es_externo 
    } = req.body;

    const pool = db.promise();
    // 1. OBTENER CONEXIÓN DEDICADA
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Validar unidad
        const [unidad] = await connection.query("SELECT id_estado, identificador_barcode FROM Tbl_Unidades_Material WHERE id_unidad = ?", [id_unidad]);
        
        if (unidad.length === 0) throw new Error("Unidad no encontrada");
        if (unidad[0].id_estado === 2) throw new Error("La unidad está prestada, primero debe ser devuelta.");

        // Insertar en Historial
        const queryInsert = `
            INSERT INTO Tbl_Mantenimientos 
            (id_unidad, id_tipo_mantenimiento, descripcion, fecha_inicio, fecha_fin_estimada, realizado_externamente)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        await connection.query(queryInsert, [
            id_unidad, 
            id_tipo_mantenimiento, 
            descripcion, 
            fecha_inicio, 
            fecha_fin_estimada, 
            es_externo ? 1 : 0
        ]);

        // Actualizar Estados y Contadores
        if (String(id_tipo_mantenimiento) === '1') {
            // Ligero
            await connection.query("UPDATE Tbl_Unidades_Material SET contador_mto_ligeros = contador_mto_ligeros + 1, id_estado = 3 WHERE id_unidad = ?", [id_unidad]);
        } 
        else if (String(id_tipo_mantenimiento) === '2') {
            // Exhaustivo (Resetea contador y resuelve alerta)
            await connection.query("UPDATE Tbl_Unidades_Material SET contador_mto_ligeros = 0, id_estado = 3 WHERE id_unidad = ?", [id_unidad]);
            await connection.query("UPDATE Tbl_Alertas_Mantenimiento SET estado = 'Resuelta' WHERE id_unidad = ? AND tipo_alerta = 'LimiteLigeros' AND estado = 'Activa'", [id_unidad]);
        } 
        else {
            // Correctivo
            await connection.query("UPDATE Tbl_Unidades_Material SET id_estado = 3 WHERE id_unidad = ?", [id_unidad]);
        }

        // Resolver alerta antigüedad
        await connection.query("UPDATE Tbl_Alertas_Mantenimiento SET estado = 'Resuelta' WHERE id_unidad = ? AND tipo_alerta = 'Antiguedad' AND estado = 'Activa'", [id_unidad]);

        await connection.commit();
        res.status(201).json({ message: `Mantenimiento registrado para ${unidad[0].identificador_barcode}` });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error en registrarMantenimiento:", error);
        res.status(500).json({ error: error.message || 'Error al registrar mantenimiento' });
    } finally {
        if (connection) connection.release();
    }
};

// --- B. GESTIÓN DE CONFIGURACIÓN ---
export const getConfiguracion = async (req, res) => {
    try {
        const connection = await db.promise();
        const [categorias] = await connection.query(`SELECT id_categoria, nombre_categoria, limite_mto_ligero, umbral_antiguedad_meses FROM Tbl_Categorias ORDER BY nombre_categoria`);
        res.json(categorias);
    } catch (error) { res.status(500).json({ error: error.message }); }
};

export const updateConfiguracion = async (req, res) => {
    const { configuraciones } = req.body; 
    const pool = db.promise();
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        for (const conf of configuraciones) {
            await connection.query("UPDATE Tbl_Categorias SET limite_mto_ligero = ?, umbral_antiguedad_meses = ? WHERE id_categoria = ?", [conf.limite_mto_ligero, conf.umbral_antiguedad_meses, conf.id_categoria]);
        }
        await connection.commit();
        res.json({ message: "Configuración actualizada." });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
};

// --- C. SISTEMA DE ALERTAS ---
export const generarYObtenerAlertas = async (req, res) => {
    try {
        const connection = await db.promise();
        
        // Alertas Límite
        await connection.query(`INSERT INTO Tbl_Alertas_Mantenimiento (id_unidad, tipo_alerta) SELECT u.id_unidad, 'LimiteLigeros' FROM Tbl_Unidades_Material u JOIN Tbl_Materiales m ON u.id_material_base = m.id_material JOIN Tbl_Categorias c ON m.id_categoria = c.id_categoria WHERE u.contador_mto_ligeros >= c.limite_mto_ligero AND NOT EXISTS (SELECT 1 FROM Tbl_Alertas_Mantenimiento a WHERE a.id_unidad = u.id_unidad AND a.tipo_alerta = 'LimiteLigeros' AND a.estado IN ('Activa', 'Descartada'))`);
        
        // Alertas Antigüedad
        await connection.query(`INSERT INTO Tbl_Alertas_Mantenimiento (id_unidad, tipo_alerta) SELECT u.id_unidad, 'Antiguedad' FROM Tbl_Unidades_Material u JOIN Tbl_Materiales m ON u.id_material_base = m.id_material JOIN Tbl_Categorias c ON m.id_categoria = c.id_categoria WHERE u.fecha_adquisicion IS NOT NULL AND TIMESTAMPDIFF(MONTH, u.fecha_adquisicion, NOW()) >= c.umbral_antiguedad_meses AND NOT EXISTS (SELECT 1 FROM Tbl_Alertas_Mantenimiento a WHERE a.id_unidad = u.id_unidad AND a.tipo_alerta = 'Antiguedad' AND a.estado IN ('Activa', 'Descartada'))`);
        
        // Obtener
        const [alertas] = await connection.query(`SELECT a.id_alerta, a.tipo_alerta, a.fecha_generacion, u.identificador_barcode, m.nombre as nombre_material, c.nombre_categoria, u.contador_mto_ligeros, c.limite_mto_ligero FROM Tbl_Alertas_Mantenimiento a JOIN Tbl_Unidades_Material u ON a.id_unidad = u.id_unidad JOIN Tbl_Materiales m ON u.id_material_base = m.id_material JOIN Tbl_Categorias c ON m.id_categoria = c.id_categoria WHERE a.estado = 'Activa' ORDER BY a.fecha_generacion DESC`);
        res.json(alertas);
    } catch (error) { console.error(error); res.status(500).json({ error: error.message }); }
};

export const descartarAlerta = async (req, res) => {
    const { id_alerta } = req.params;
    try {
        const connection = await db.promise();
        await connection.query("UPDATE Tbl_Alertas_Mantenimiento SET estado = 'Descartada' WHERE id_alerta = ?", [id_alerta]);
        res.json({ message: "Alerta descartada." });
    } catch (error) { res.status(500).json({ error: error.message }); }
};

// --- D. HISTORIAL Y FINALIZAR ---
export const getHistorialPorUnidad = async (req, res) => {
    const { id_unidad } = req.params;
    const { fecha_inicio, fecha_fin, id_tipo_mantenimiento, ordenar_por, orden_dir } = req.query;
    const connection = await db.promise();
    try {
        const [infoUnidad] = await connection.query(`SELECT u.identificador_barcode, m.nombre, m.marca, m.modelo FROM Tbl_Unidades_Material u JOIN Tbl_Materiales m ON u.id_material_base = m.id_material WHERE u.id_unidad = ?`, [id_unidad]);
        if (infoUnidad.length === 0) return res.status(404).json({ error: "Unidad no encontrada" });
        let query = `SELECT mt.id_mantenimiento, tm.nombre_tipo as tipo, mt.descripcion as descripcion_falla, mt.fecha_inicio, mt.fecha_fin_estimada, mt.fecha_fin_real, mt.realizado_externamente FROM Tbl_Mantenimientos mt JOIN Tbl_Tipos_Mantenimiento tm ON mt.id_tipo_mantenimiento = tm.id_tipo_mantenimiento WHERE mt.id_unidad = ?`;
        const params = [id_unidad];
        if (fecha_inicio && fecha_fin) { query += ` AND mt.fecha_inicio BETWEEN ? AND ?`; params.push(fecha_inicio, fecha_fin); }
        if (id_tipo_mantenimiento) { query += ` AND mt.id_tipo_mantenimiento = ?`; params.push(id_tipo_mantenimiento); }
        const camposValidos = { 'fecha_inicio': 'mt.fecha_inicio', 'tipo': 'tm.nombre_tipo', 'estado': 'mt.fecha_fin_real' };
        const campoOrden = camposValidos[ordenar_por] || 'mt.fecha_inicio';
        const direccion = orden_dir === 'ASC' ? 'ASC' : 'DESC';
        query += ` ORDER BY ${campoOrden} ${direccion}`;
        const [historial] = await connection.query(query, params);
        res.json({ unidad: infoUnidad[0], historial });
    } catch (error) { console.error(error); res.status(500).json({ error: error.message }); }
};

export const finalizarMantenimiento = async (req, res) => {
    const { id_mantenimiento, fecha_fin_real, descripcion_trabajo, realizado_externamente, observaciones } = req.body;
    
    const pool = db.promise();
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [mto] = await connection.query("SELECT id_unidad FROM Tbl_Mantenimientos WHERE id_mantenimiento = ?", [id_mantenimiento]);
        if (mto.length === 0) throw new Error("Mantenimiento no encontrado.");
        const id_unidad = mto[0].id_unidad;
        const descFinal = observaciones ? `${descripcion_trabajo} | Obs: ${observaciones}` : descripcion_trabajo;
        
        await connection.query(`UPDATE Tbl_Mantenimientos SET fecha_fin_real = ?, descripcion = ?, realizado_externamente = ? WHERE id_mantenimiento = ?`, [fecha_fin_real, descFinal, realizado_externamente ? 1 : 0, id_mantenimiento]);
        
        let bloqueoRazon = null;
        const [incidencias] = await connection.query("SELECT count(*) as total FROM Tbl_Incidencias WHERE id_unidad_afectada = ? AND estado_incidencia IN ('Abierta', 'Pendiente', 'En Revisión')", [id_unidad]);
        if (incidencias[0].total > 0) bloqueoRazon = "Incidencias pendientes";
        if (!bloqueoRazon) {
            const [futuros] = await connection.query("SELECT count(*) as total FROM Tbl_Mantenimientos WHERE id_unidad = ? AND fecha_inicio > NOW() AND fecha_fin_real IS NULL AND id_mantenimiento != ?", [id_unidad, id_mantenimiento]);
            if (futuros[0].total > 0) bloqueoRazon = "Mantenimiento futuro programado";
        }
        if (!bloqueoRazon) {
            const [estadoActual] = await connection.query("SELECT id_estado FROM Tbl_Unidades_Material WHERE id_unidad = ?", [id_unidad]);
            if ([4, 5].includes(estadoActual[0].id_estado)) bloqueoRazon = "Estado administrativo restrictivo (Baja/Bloqueo)";
        }
        let mensaje = "Mantenimiento finalizado.";
        if (bloqueoRazon) { mensaje += ` ATENCIÓN: La unidad NO se liberó a 'Disponible' debido a: ${bloqueoRazon}.`; } 
        else { await connection.query("UPDATE Tbl_Unidades_Material SET id_estado = 1 WHERE id_unidad = ?", [id_unidad]); mensaje += " Unidad liberada y DISPONIBLE nuevamente."; }
        
        await connection.commit();
        res.json({ message: mensaje, bloqueado: !!bloqueoRazon });
    } catch (error) { 
        if (connection) await connection.rollback(); 
        console.error("Error al finalizar:", error); 
        res.status(500).json({ error: error.message }); 
    } finally {
        if (connection) connection.release();
    }
};


export const getReporteActivos = async (req, res) => {
    const { fecha_inicio, fecha_fin, id_tipo_mantenimiento, estado_tiempo, mostrar_todos } = req.query;
    
    const connection = await db.promise();
    try {
        let query = `
            SELECT 
                mt.id_mantenimiento, 
                u.identificador_barcode, 
                m.nombre as nombre_material, 
                tm.nombre_tipo as tipo_mantenimiento, 
                mt.fecha_inicio, 
                mt.fecha_fin_estimada, 
                mt.fecha_fin_real, 
                DATEDIFF(NOW(), mt.fecha_fin_estimada) as dias_retraso 
            FROM Tbl_Mantenimientos mt 
            JOIN Tbl_Unidades_Material u ON mt.id_unidad = u.id_unidad 
            JOIN Tbl_Materiales m ON u.id_material_base = m.id_material 
            JOIN Tbl_Tipos_Mantenimiento tm ON mt.id_tipo_mantenimiento = tm.id_tipo_mantenimiento 
            WHERE 1=1 
        `;
        
        const params = [];

        // 1. Filtro de Estado (Histórico vs Activos)
        if (mostrar_todos === 'true') {
            // Trae todo
        } else if (mostrar_todos === 'finalizados') {
             query += ` AND mt.fecha_fin_real IS NOT NULL`;
        } else {
            // Por defecto solo Activos
            query += ` AND mt.fecha_fin_real IS NULL`;
        }

        // 2. Filtros de Fecha INDEPENDIENTES (Corrección solicitada)
        if (fecha_inicio) { 
            query += ` AND mt.fecha_inicio >= ?`; 
            params.push(`${fecha_inicio} 00:00:00`); 
        }
        if (fecha_fin) { 
            query += ` AND mt.fecha_inicio <= ?`; 
            params.push(`${fecha_fin} 23:59:59`); 
        }

        // 3. Filtro Tipo
        if (id_tipo_mantenimiento) { 
            query += ` AND mt.id_tipo_mantenimiento = ?`; 
            params.push(id_tipo_mantenimiento); 
        }

        // 4. Lógica de Tiempo (Corrección "A tiempo")
        // A tiempo = (Activo Y (Fecha estimada es futura O Fecha estimada es NULL))
        if (estado_tiempo === 'atrasado') { 
            query += ` AND (mt.fecha_fin_real IS NULL AND mt.fecha_fin_estimada < NOW())`; 
        } else if (estado_tiempo === 'atiempo') { 
            query += ` AND (mt.fecha_fin_real IS NULL AND (mt.fecha_fin_estimada >= NOW() OR mt.fecha_fin_estimada IS NULL))`; 
        }

        query += ` ORDER BY mt.fecha_inicio ASC`;

        const [resultados] = await connection.query(query, params);
        
        const reporte = resultados.map(item => ({ 
            ...item, 
            // Si fecha_fin_estimada es null, dias_retraso será null, asumimos "En Curso"
            estado_actual: item.fecha_fin_real ? 'Finalizado' : ((item.dias_retraso > 0) ? 'Atrasado' : 'En Curso'), 
            clase_estado: item.fecha_fin_real ? 'finalizado' : ((item.dias_retraso > 0) ? 'retraso' : 'normal') 
        }));
        
        res.json(reporte);

    } catch (error) { 
        console.error(error); 
        res.status(500).json({ error: error.message }); 
    }
};