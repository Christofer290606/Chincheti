import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Modal from '../components/Modal/Modal'; 

const ConfiguracionMtoPage = () => {
    const [categorias, setCategorias] = useState([]);
    const [tipos, setTipos] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Estado para cambios pendientes (Dirty checking)
    const [cambiosPendientes, setCambiosPendientes] = useState({}); // { id_cat: { ...datos } }

    // Estado Modal Tipos
    const [modalOpen, setModalOpen] = useState(false);
    const [tipoForm, setTipoForm] = useState({ id_tipo: null, nombre_tipo: '', descripcion: '' });

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const { data } = await api.get('/configuracion');
            setCategorias(data.categorias);
            setTipos(data.tipos);
            setCambiosPendientes({});
        } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    // --- MANEJO DE UMBRALES (CATEGORÍAS) ---
    const handleThresholdChange = (id_cat, field, value) => {
        const val = parseInt(value);
        
        // Validaciones RQNF26.1
        if (field === 'limite_mto_ligero' && (val < 1 || val > 10)) return; // Rango 1-10
        if (field === 'umbral_antiguedad_meses' && (val < 12 || val > 240)) return; // Rango 1-20 años (en meses)

        // Actualizar estado local
        setCategorias(prev => prev.map(c => c.id_categoria === id_cat ? { ...c, [field]: val } : c));
        
        // Marcar como pendiente de guardar
        const original = categorias.find(c => c.id_categoria === id_cat);
        setCambiosPendientes(prev => ({
            ...prev,
            [id_cat]: { 
                id_categoria: id_cat,
                limite_mto_ligero: field === 'limite_mto_ligero' ? val : (prev[id_cat]?.limite_mto_ligero || original.limite_mto_ligero),
                umbral_antiguedad_meses: field === 'umbral_antiguedad_meses' ? val : (prev[id_cat]?.umbral_antiguedad_meses || original.umbral_antiguedad_meses)
            }
        }));
    };

    const guardarUmbrales = async () => {
        const listaCambios = Object.values(cambiosPendientes);
        if (listaCambios.length === 0) return;

        if (!window.confirm(`¿Confirmar cambios en ${listaCambios.length} categorías?\nEsta acción quedará registrada en la bitácora.`)) return;

        try {
            await api.put('/configuracion/umbrales', { cambios: listaCambios });
            alert(" Configuración guardada correctamente.");
            setCambiosPendientes({});
            fetchConfig(); // Recargar para asegurar sincronía
        } catch (error) {
            alert("Error al guardar.");
        }
    };

    // --- MANEJO DE TIPOS DE MANTENIMIENTO ---
    const handleToggleTipo = async (tipo) => {
        if (!window.confirm(`¿${tipo.activo ? 'Desactivar' : 'Activar'} el tipo "${tipo.nombre_tipo}"?`)) return;
        try {
            await api.post('/configuracion/tipos', { accion: 'estado', id_tipo: tipo.id_tipo_mantenimiento, activo: !tipo.activo });
            fetchConfig();
        } catch (error) { alert("Error al cambiar estado."); }
    };

    const handleSaveTipo = async (e) => {
        e.preventDefault();
        try {
            const accion = tipoForm.id_tipo ? 'editar' : 'crear';
            await api.post('/configuracion/tipos', { accion, ...tipoForm });
            setModalOpen(false);
            fetchConfig();
            alert(`Tipo ${accion === 'crear' ? 'creado' : 'actualizado'} correctamente.`);
        } catch (error) { alert("Error al guardar tipo."); }
    };

    return (
        <div className="content-section active">
            <h2 style={{color:'#003366'}}> Panel de Configuración de Mantenimiento</h2>
            
            {/* SECCIÓN 1: TIPOS DE MANTENIMIENTO */}
            <div className="card" style={{marginBottom:'30px'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                    <h3 style={{margin:0, color:'#0056b3'}}> Tipos de Mantenimiento</h3>
                    <button className="btn confirm" onClick={()=>{setTipoForm({id_tipo:null, nombre_tipo:'', descripcion:''}); setModalOpen(true);}}>+ Nuevo Tipo</button>
                </div>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Nombre</th>
                            <th>Descripción</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tipos.map(t => (
                            <tr key={t.id_tipo_mantenimiento} style={{opacity: t.activo ? 1 : 0.6}}>
                                <td>{t.id_tipo_mantenimiento}</td>
                                <td><strong>{t.nombre_tipo}</strong></td>
                                <td>{t.descripcion || '-'}</td>
                                <td>
                                    <span className={`badge ${t.activo ? 'disponible' : 'baja'}`}>
                                        {t.activo ? 'Activo' : 'Inactivo'}
                                    </span>
                                </td>
                                <td>
                                    <button className="btn-item" onClick={()=>{setTipoForm({id_tipo:t.id_tipo_mantenimiento, nombre_tipo:t.nombre_tipo, descripcion:t.descripcion}); setModalOpen(true);}}>Editar</button>
                                    <button 
                                        className="btn-item" 
                                        style={{background: t.activo ? '#dc3545' : '#28a745', marginLeft:'5px'}}
                                        onClick={() => handleToggleTipo(t)}
                                    >
                                        {t.activo ? 'Desactivar' : 'Activar'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* SECCIÓN 2: UMBRALES Y REGLAS */}
            <div className="card">
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                    <h3 style={{margin:0, color:'#0056b3'}}> Reglas de Alertas Automáticas</h3>
                    {Object.keys(cambiosPendientes).length > 0 && (
                        <span style={{color:'#d39e00', fontWeight:'bold'}}>⚠ Cambios sin guardar</span>
                    )}
                </div>
                <p style={{fontSize:'0.9rem', color:'#666', marginBottom:'20px'}}>
                    Defina los límites para cada categoría. <br/>
                    • <strong>Límite Ligeros:</strong> Cantidad (1-10). <br/>
                    • <strong>Umbral Antigüedad:</strong> Años (1-20). El sistema convertirá esto a meses automáticamente.
                </p>

                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Categoría</th>
                            <th>Max. Mto. Ligeros (1-10)</th>
                            <th>Alerta Antigüedad (Años)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {categorias.map(c => (
                            <tr key={c.id_categoria} style={{background: cambiosPendientes[c.id_categoria] ? '#fff3cd' : 'transparent'}}>
                                <td><strong>{c.nombre_categoria}</strong></td>
                                <td>
                                    <input 
                                        type="number" min="1" max="10"
                                        value={c.limite_mto_ligero} 
                                        onChange={(e) => handleThresholdChange(c.id_categoria, 'limite_mto_ligero', e.target.value)}
                                        style={{padding:'8px', width:'80px', textAlign:'center', border: '1px solid #ccc', borderRadius:'4px'}}
                                    />
                                    <span style={{marginLeft:'5px', fontSize:'0.8em', color:'#666'}}>veces</span>
                                </td>
                                <td>
                                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                        <input 
                                            type="number" min="1" max="20"
                                            value={Math.round(c.umbral_antiguedad_meses / 12)} // Mostrar en Años
                                            onChange={(e) => handleThresholdChange(c.id_categoria, 'umbral_antiguedad_meses', e.target.value * 12)} // Guardar en Meses
                                            style={{padding:'8px', width:'80px', textAlign:'center', border: '1px solid #ccc', borderRadius:'4px'}}
                                        />
                                        <span style={{fontSize:'0.8em', color:'#666'}}>años ({c.umbral_antiguedad_meses} meses)</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                
                <div style={{marginTop:'20px', textAlign:'right', padding:'10px', borderTop:'1px solid #eee'}}>
                    <button 
                        onClick={guardarUmbrales} 
                        className="btn confirm" 
                        disabled={Object.keys(cambiosPendientes).length === 0}
                        style={{opacity: Object.keys(cambiosPendientes).length === 0 ? 0.5 : 1}}
                    >
                         Guardar Configuración
                    </button>
                </div>
            </div>

            {/* MODAL TIPOS */}
            {modalOpen && (
                <Modal onClose={()=>setModalOpen(false)}>
                    <h3 style={{color:'#003366'}}>{tipoForm.id_tipo ? 'Editar' : 'Crear'} Tipo de Mantenimiento</h3>
                    <form onSubmit={handleSaveTipo}>
                        <label>Nombre:</label>
                        <div className="input-box">
                            <input 
                                value={tipoForm.nombre_tipo} 
                                onChange={e=>setTipoForm({...tipoForm, nombre_tipo:e.target.value})} 
                                required 
                            />
                        </div>
                        <label>Descripción:</label>
                        <div className="input-box">
                            <textarea 
                                value={tipoForm.descripcion} 
                                onChange={e=>setTipoForm({...tipoForm, descripcion:e.target.value})} 
                            />
                        </div>
                        <div className="modal-buttons" style={{marginTop:'20px'}}>
                            <button type="button" className="btn cancel" onClick={()=>setModalOpen(false)}>Cancelar</button>
                            <button type="submit" className="btn confirm">Guardar</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default ConfiguracionMtoPage;