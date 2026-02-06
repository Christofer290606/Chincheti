import db from '../config/db.js';

/**
 * Función Auxiliar: Obtener el ID de un tipo de incidencia
 */
const getTipoIncidenciaId = async (nombreTipo, connection) => {
  const [tipo] = await connection.query("SELECT id_tipo_incidencia, nivel_prioridad FROM Tbl_Tipos_Incidencia WHERE nombre_tipo = ?", [nombreTipo]);
  if (tipo.length === 0) throw new Error(`Tipo de incidencia no encontrado: ${nombreTipo}`);
  return tipo[0];
};

/**
 * Función Auxiliar: Obtener el ID del usuario "Sistema"
 */
const getIdUsuarioSistema = async (connection) => {
  return 1; // Asumimos ID 1 es Admin/Sistema
};

/**
 * Tarea Cron: generarIncidenciasNoRecogido
 */
export const generarIncidenciasNoRecogido = async () => {
  console.log('\n⏰ [CRON] Iniciando barrido de vales no recogidos...');
  
  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();

    // 1. Obtener IDs de configuración
    const [estadoAprobado] = await connection.query("SELECT id_estado FROM Tbl_Estados_Vales WHERE nombre_estado = 'Aprobado'");
    const [estadoNoRecogido] = await connection.query("SELECT id_estado FROM Tbl_Estados_Vales WHERE nombre_estado = 'No Recogido'");
    
    if (!estadoAprobado.length || !estadoNoRecogido.length) throw new Error("Faltan estados en la BD.");

    const ID_APROBADO = estadoAprobado[0].id_estado;
    const ID_NO_RECOGIDO = estadoNoRecogido[0].id_estado;

    const tipoIncidencia = await getTipoIncidenciaId('Material no recogido', connection);
    const ID_TIPO_INCIDENCIA = tipoIncidencia.id_tipo_incidencia;
    
    // Convertimos 'Alta'/'Critica' a booleano
    const esCritica = ['Alta', 'Critica'].includes(tipoIncidencia.nivel_prioridad);
    
    const ID_SISTEMA = await getIdUsuarioSistema(connection);

    // 2. Buscar vales 'Aprobados' que ya vencieron hoy (su fecha de recolección pasó)
    // Usamos FOR UPDATE para bloquear esas filas mientras procesamos
    const [valesAtrasados] = await connection.query(`
      SELECT id_vale, id_usuario_solicitante, fecha_recoleccion 
      FROM Tbl_Vales 
      WHERE id_estado_vale = ? 
      AND fecha_recoleccion < NOW() 
      FOR UPDATE
    `, [ID_APROBADO]);

    if (valesAtrasados.length === 0) {
      console.log('   ✅ No hay vales atrasados por procesar.');
      await connection.commit();
      return;
    }

    console.log(`   🔎 Encontrados ${valesAtrasados.length} vales vencidos.`);

    // 3. Procesar cada vale
    for (const vale of valesAtrasados) {
      
      // 3a. Obtener una unidad asociada al vale para llenar la FK id_unidad_afectada
      // Buscamos cualquier unidad reservada en ese vale
      const [detalle] = await connection.query(`
          SELECT u.id_unidad 
          FROM Tbl_Vales_Detalle vd
          JOIN Tbl_Unidades_Material u ON vd.id_material_base = u.id_material_base
          WHERE vd.id_vale = ? 
          LIMIT 1
      `, [vale.id_vale]);

      // Si no encontramos unidad (raro), usamos NULL si la BD lo permite, o saltamos.
      // Asumiremos que encontramos una para asociar la incidencia.
      const idUnidad = detalle.length > 0 ? detalle[0].id_unidad : null;

      const titulo = "[AUTO] Material no recogido";
      const descripcion = `Generación automática: El usuario no recogió el material del vale #${vale.id_vale} a la hora acordada (${new Date(vale.fecha_recoleccion).toLocaleString()}).`;

      // 3b. Crear la incidencia (Usando nombres de columnas CORRECTOS)
      await connection.query(`
        INSERT INTO Tbl_Incidencias 
        (titulo, descripcion, id_tipo_incidencia, id_usuario_reporta, id_usuario_afectado, id_unidad_afectada, id_vale, es_critica, estado_incidencia, fecha_registro)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Abierta', NOW())
      `, [titulo, descripcion, ID_TIPO_INCIDENCIA, ID_SISTEMA, vale.id_usuario_solicitante, idUnidad, vale.id_vale, esCritica ? 1 : 0]);
      
      // 3c. Actualizar el vale a 'No Recogido'
      await connection.query(
        "UPDATE Tbl_Vales SET id_estado_vale = ?, motivo_rechazo = ? WHERE id_vale = ?",
        [ID_NO_RECOGIDO, 'Sistema: Material no recogido a tiempo.', vale.id_vale]
      );

      // 3d. Bloquear usuario si es crítica (RQF29)
      if (esCritica) {
        await connection.query(
          "UPDATE Tbl_Usuarios SET estatus = 'Bloqueado' WHERE id_usuario = ?",
          [vale.id_usuario_solicitante]
        );
        console.log(`      ⛔ Usuario ${vale.id_usuario_solicitante} BLOQUEADO.`);
      }
    }
    
    await connection.commit();
    console.log(`   🏁 Procesamiento finalizado. ${valesAtrasados.length} incidencias generadas.`);

  } catch (error) {
    await connection.rollback();
    console.error('   ❌ [CRON ERROR] Falló el barrido:', error);
  } finally {
    connection.release();
  }
};