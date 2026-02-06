import db from '../config/db.js';

// --- HELPER: Registrar en Bitácora ---
const registrarAuditoria = async (connection, id_usuario, accion, detalle) => {
    await connection.query(
        "INSERT INTO Tbl_Bitacora_Configuracion (id_usuario, accion, detalle) VALUES (?, ?, ?)",
        [id_usuario, accion, JSON.stringify(detalle)]
    );
};

// --- 1. OBTENER TODA LA CONFIGURACIÓN ---
export const getFullConfig = async (req, res) => {
    try {
        // Para lecturas simples no necesitamos transacción, usamos el pool directo
        const pool = db.promise();
        
        // Categorías (Umbrales)
        const [categorias] = await pool.query(`
            SELECT id_categoria, nombre_categoria, limite_mto_ligero, umbral_antiguedad_meses 
            FROM Tbl_Categorias ORDER BY nombre_categoria
        `);

        // Tipos de Mantenimiento
        const [tipos] = await pool.query(`
            SELECT id_tipo_mantenimiento, nombre_tipo, descripcion, activo 
            FROM Tbl_Tipos_Mantenimiento ORDER BY id_tipo_mantenimiento
        `);

        res.json({ categorias, tipos });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- 2. ACTUALIZAR UMBRALES (CATEGORÍAS) ---
export const updateUmbrales = async (req, res) => {
    const { cambios } = req.body; 
    const { id_usuario } = req.usuario;

    // CORRECCIÓN: Obtener una conexión dedicada del pool
    const pool = db.promise();
    const connection = await pool.getConnection(); 

    try {
        await connection.beginTransaction();

        for (const c of cambios) {
            await connection.query(
                "UPDATE Tbl_Categorias SET limite_mto_ligero = ?, umbral_antiguedad_meses = ? WHERE id_categoria = ?",
                [c.limite_mto_ligero, c.umbral_antiguedad_meses, c.id_categoria]
            );
        }

        // Registrar Auditoría
        await registrarAuditoria(connection, id_usuario, 'Actualizar Umbrales', cambios);

        await connection.commit();
        res.json({ message: "Umbrales actualizados y registrados en bitácora." });

    } catch (error) {
        // Ahora sí existe rollback porque 'connection' es una conexión real, no el pool
        await connection.rollback();
        console.error("Error updateUmbrales:", error);
        res.status(500).json({ error: error.message });
    } finally {
        // IMPORTANTE: Liberar la conexión para que vuelva al pool
        connection.release();
    }
};

// --- 3. GESTIONAR TIPOS DE MANTENIMIENTO (CRUD) ---
export const manageTipoMantenimiento = async (req, res) => {
    const { accion, id_tipo, nombre_tipo, descripcion, activo } = req.body; 
    const { id_usuario } = req.usuario;

    // CORRECCIÓN: Obtener una conexión dedicada del pool
    const pool = db.promise();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        if (accion === 'crear') {
            await connection.query(
                "INSERT INTO Tbl_Tipos_Mantenimiento (nombre_tipo, descripcion, activo) VALUES (?, ?, 1)",
                [nombre_tipo, descripcion]
            );
            await registrarAuditoria(connection, id_usuario, 'Crear Tipo Mto', { nombre: nombre_tipo });
        } 
        else if (accion === 'editar') {
            await connection.query(
                "UPDATE Tbl_Tipos_Mantenimiento SET nombre_tipo = ?, descripcion = ? WHERE id_tipo_mantenimiento = ?",
                [nombre_tipo, descripcion, id_tipo]
            );
            await registrarAuditoria(connection, id_usuario, 'Editar Tipo Mto', { id: id_tipo, nuevo_nombre: nombre_tipo });
        }
        else if (accion === 'estado') {
            await connection.query(
                "UPDATE Tbl_Tipos_Mantenimiento SET activo = ? WHERE id_tipo_mantenimiento = ?",
                [activo ? 1 : 0, id_tipo]
            );
            await registrarAuditoria(connection, id_usuario, 'Cambiar Estado Tipo Mto', { id: id_tipo, activo });
        }

        await connection.commit();
        res.json({ message: "Configuración de tipos actualizada." });

    } catch (error) {
        await connection.rollback();
        console.error("Error manageTipoMantenimiento:", error);
        res.status(500).json({ error: error.message });
    } finally {
        // IMPORTANTE: Liberar la conexión
        connection.release();
    }
};