import mysql from 'mysql2/promise';
import bwipjs from 'bwip-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURACIÓN ---
const BARCODE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'barcodes'); 
const DB_CONFIG = {
    host: 'localhost',
    user: 'root',      
    password: '',      
    database: 'bd_almacen_ceti'
};

if (!fs.existsSync(BARCODE_DIR)) {
    fs.mkdirSync(BARCODE_DIR, { recursive: true });
}

const DATOS_ALMACEN = {
    1: { nombre: 'Suministro', marcas: ['3M', 'Truper', 'Resisto'], categoria: [3] }, 
    2: { nombre: 'Laptop', marcas: ['Dell', 'HP', 'Lenovo'], categoria: [1] }, 
    3: { nombre: 'Gato Hidráulico', marcas: ['Mikels', 'Surtek'], categoria: [2] }, 
    4: { nombre: 'Multímetro', marcas: ['Fluke', 'Klein'], categoria: [1] }, 
    5: { nombre: 'Taladro', marcas: ['Bosch', 'DeWalt'], categoria: [2] }, 
    6: { nombre: 'Buril', marcas: ['Sandvik', 'Kennametal'], categoria: [2] }, 
    7: { nombre: 'Fuente Poder', marcas: ['Tektronix', 'Rigol'], categoria: [1] }, 
    8: { nombre: 'Sensor Presión', marcas: ['Festo', 'SMC'], categoria: [1] }, 
    9: { nombre: 'Ponchadora', marcas: ['Klein', 'Steren'], categoria: [2] }, 
    10: { nombre: 'Micrómetro', marcas: ['Mitutoyo', 'Starrett'], categoria: [1] }, 
    11: { nombre: 'Compresor', marcas: ['Evans', 'Goni'], categoria: [1] }, 
    12: { nombre: 'Transformador', marcas: ['Prolec', 'Iusa'], categoria: [1] }, 
    13: { nombre: 'Bomba', marcas: ['Siemens', 'Evans'], categoria: [1] } 
};

const main = async () => {
    console.log("🚀 INICIANDO CARGA MASIVA (LÓGICA SECUENCIAL)...");
    const connection = await mysql.createConnection(DB_CONFIG);

    try {
        await connection.beginTransaction();

        // 1. COMPLETAR ALMACENISTAS FALTANTES
        console.log("--- 1. Verificando Almacenistas ---");
        const [almacenes] = await connection.query("SELECT id_almacen, nombre_almacen, codigo_almacen, id_carrera FROM Tbl_Almacenes");
        
        for (const alm of almacenes) {
            const [check] = await connection.query("SELECT id_usuario FROM Tbl_Trabajadores WHERE id_almacen = ?", [alm.id_almacen]);
            if (check.length === 0) {
                const [resUser] = await connection.query("INSERT INTO Tbl_Usuarios (correo, password, id_rol) VALUES (?, ?, 3)", 
                    [`encargado${alm.id_almacen}@ceti.mx`, Buffer.from('123456', 'utf-8')]); 
                await connection.query("INSERT INTO Tbl_Trabajadores (id_usuario, nombre_completo, id_almacen, id_carrera) VALUES (?, ?, ?, ?)",
                    [resUser.insertId, `Encargado ${alm.nombre_almacen.substring(0,20)}`, alm.id_almacen, alm.id_carrera]);
            }
        }

        // 2. GENERAR MATERIALES Y UNIDADES
        console.log("--- 2. Generando Materiales e Imágenes ---");
        
        for (const alm of almacenes) {
            const contexto = DATOS_ALMACEN[alm.id_almacen] || { nombre: 'Item Genérico', marcas: ['Genérico'], categoria: [1,2,3] };
            
            let codigoCarrera = 'GEN';
            if (alm.id_carrera) {
                const [c] = await connection.query("SELECT codigo_carrera FROM Tbl_Carreras WHERE id_carrera = ?", [alm.id_carrera]);
                if (c.length) codigoCarrera = c[0].codigo_carrera;
            }

            // Crear 10 tipos de materiales por almacén
            for (let i = 1; i <= 10; i++) {
                const idCat = contexto.categoria[Math.floor(Math.random() * contexto.categoria.length)];
                const esConsumible = idCat === 3;
                const nombreMat = `${contexto.nombre} ${String.fromCharCode(64+i)}`; // Ej: Suministro A, Suministro B
                
                // Insertar Material Base
                const [resMat] = await connection.query(`
                    INSERT INTO Tbl_Materiales 
                    (nombre, marca, modelo, ano_modelo, id_categoria, id_almacen, id_carrera_exclusiva, proximo_id_unidad, mto_es_interno) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
                `, [
                    nombreMat,
                    contexto.marcas[Math.floor(Math.random() * contexto.marcas.length)],
                    `M-${Math.floor(Math.random()*1000)}`,
                    2020 + Math.floor(Math.random()*5),
                    idCat,
                    alm.id_almacen,
                    alm.id_carrera
                ]);

                const idMaterial = resMat.insertId;
                const prefijo = nombreMat.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
                
                let contador = 1;
                const loops = esConsumible ? 1 : 5; 
                const stockUnidad = esConsumible ? 50 : 1;

                for (let j = 0; j < loops; j++) {
                    let barcodeFinal = '';
                    let esUnico = false;

                    // --- BUCLE DE GENERACIÓN SECUENCIAL ---
                    // Si 'SUM000001...' existe, prueba 'SUM000002...', etc.
                    while (!esUnico) {
                        const idStr = String(contador).padStart(6, '0');
                        barcodeFinal = `${prefijo}${idStr}${codigoCarrera}${alm.codigo_almacen}`;
                        
                        const [check] = await connection.query("SELECT id_unidad FROM Tbl_Unidades_Material WHERE identificador_barcode = ?", [barcodeFinal]);
                        
                        if (check.length === 0) {
                            esUnico = true;
                        } else {
                            contador++; // Incrementamos el contador y probamos de nuevo en el siguiente ciclo
                        }
                    }
                    // --------------------------------------

                    // Generar PNG
                    try {
                        const png = await bwipjs.toBuffer({
                            bcid: 'code128',
                            text: barcodeFinal,
                            scale: 3,
                            height: 10,
                            includetext: true,
                            textxalign: 'center',
                            backgroundcolor: 'FFFFFF'
                        });
                        fs.writeFileSync(path.join(BARCODE_DIR, `${barcodeFinal}.png`), png);
                    } catch (e) {
                        console.error(`Error generando imagen ${barcodeFinal}:`, e.message);
                    }
                    
                    await connection.query(`
                        INSERT INTO Tbl_Unidades_Material 
                        (id_material_base, identificador_barcode, id_estado, cantidad_stock)
                        VALUES (?, ?, 1, ?)
                    `, [idMaterial, barcodeFinal, stockUnidad]);

                    contador++; // Avanzar para el siguiente loop de este mismo material
                }
                
                // Guardamos el último contador utilizado para este material
                // Así la próxima vez que se cree un item de este tipo, seguirá la secuencia.
                await connection.query("UPDATE Tbl_Materiales SET proximo_id_unidad = ? WHERE id_material = ?", [contador, idMaterial]);
            }
            console.log(`   -> Almacén ${alm.nombre_almacen} completado.`);
        }

        // 3. GENERAR VALES
        console.log("--- 3. Generando Historial de Vales ---");
        const [alumnos] = await connection.query("SELECT id_usuario FROM Tbl_Usuarios WHERE id_rol = 5 LIMIT 50");
        const [maestros] = await connection.query("SELECT id_usuario FROM Tbl_Usuarios WHERE id_rol = 4 LIMIT 10");
        const [unidades] = await connection.query("SELECT id_unidad, id_material_base FROM Tbl_Unidades_Material WHERE id_estado = 1"); 

        if (alumnos.length && maestros.length && unidades.length) {
            for (let k = 0; k < 200; k++) { 
                const alumno = alumnos[Math.floor(Math.random() * alumnos.length)].id_usuario;
                const maestro = maestros[Math.floor(Math.random() * maestros.length)].id_usuario;
                const unidad = unidades[Math.floor(Math.random() * unidades.length)];
                
                const estados = [6, 6, 6, 5, 3]; 
                const estado = estados[Math.floor(Math.random() * estados.length)];
                
                const fecha = new Date();
                fecha.setDate(fecha.getDate() - Math.floor(Math.random() * 60));
                const fechaStr = fecha.toISOString().slice(0, 19).replace('T', ' ');

                const [resVale] = await connection.query(`
                    INSERT INTO Tbl_Vales 
                    (id_usuario_solicitante, id_estado_vale, tipo_vale, fecha_emision, fecha_recoleccion, fecha_devolucion_esperada, espacio_uso, id_maestro_responsable)
                    VALUES (?, ?, 'Clase', ?, ?, DATE_ADD(?, INTERVAL 2 HOUR), 'Laboratorio', ?)
                `, [alumno, estado, fechaStr, fechaStr, fechaStr, maestro]);

                await connection.query(`
                    INSERT INTO Tbl_Vales_Detalle (id_vale, id_material_base, cantidad_solicitada, id_unidad_entregada)
                    VALUES (?, ?, 1, ?)
                `, [resVale.insertId, unidad.id_material_base, unidad.id_unidad]);
            }
        }

        // 4. GENERAR INCIDENCIAS
        console.log("--- 4. Generando Incidencias ---");
        for (let x = 0; x < 30; x++) {
            const alumno = alumnos[Math.floor(Math.random() * alumnos.length)].id_usuario;
            const unidad = unidades[Math.floor(Math.random() * unidades.length)].id_unidad;
            
            await connection.query(`
                INSERT INTO Tbl_Incidencias (titulo, descripcion, id_tipo_incidencia, id_usuario_reporta, id_usuario_afectado, id_unidad_afectada, estado_incidencia)
                VALUES (?, 'Falla generada por script', 1, 3, ?, ?, 'Abierta')
            `, [`Falla Simulada ${x}`, alumno, unidad]);
        }

        await connection.commit();
        console.log("✅ CARGA MASIVA EXITOSA.");
        process.exit(0);

    } catch (error) {
        await connection.rollback();
        console.error("❌ ERROR FATAL:", error);
        process.exit(1);
    }
};

main();