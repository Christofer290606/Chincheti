import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from '../components/Modal/Modal'; // Asegúrate de importar tu componente Modal

const HistorialMantenimientoPage = () => {
    const { id } = useParams(); 
    const [data, setData] = useState({ unidad: {}, historial: [] });
    const [loading, setLoading] = useState(true);

    // Estados Filtros y Orden
    const [filtros, setFiltros] = useState({ fecha_inicio: '', fecha_fin: '', id_tipo_mantenimiento: '' });
    const [orden, setOrden] = useState({ campo: 'fecha_inicio', dir: 'DESC' });

    // RQF24: Estados para el Formulario de Cierre
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedMto, setSelectedMto] = useState(null);
    const [cierreForm, setCierreForm] = useState({
        fecha_fin_real: '',
        descripcion_trabajo: '',
        realizado_externamente: false,
        observaciones: ''
    });

    useEffect(() => { fetchHistorial(); }, [id, filtros, orden]);

    const fetchHistorial = async () => {
        setLoading(true);
        try {
            const params = { ...filtros, ordenar_por: orden.campo, orden_dir: orden.dir };
            Object.keys(params).forEach(key => !params[key] && delete params[key]);
            const response = await api.get(`/mantenimientos/unidad/${id}/historial`, { params });
            setData(response.data);
        } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    const handleSort = (campo) => {
        const nuevaDir = (orden.campo === campo && orden.dir === 'DESC') ? 'ASC' : 'DESC';
        setOrden({ campo, dir: nuevaDir });
    };

    // --- MANEJO DEL FORMULARIO DE CIERRE (RQF24) ---
    const handleOpenCierre = (mto) => {
        setSelectedMto(mto);
        // Pre-llenar con fecha actual y la ubicación original
        const now = new Date();
        const localNow = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        
        setCierreForm({
            fecha_fin_real: localNow,
            descripcion_trabajo: '', // Usuario debe describir el trabajo final
            realizado_externamente: !!mto.realizado_externamente, // Pre-seleccionar lo que se dijo al inicio
            observaciones: ''
        });
        setModalOpen(true);
    };

    const handleSubmitCierre = async (e) => {
        e.preventDefault();
        if (!window.confirm("¿Confirmar finalización del mantenimiento?")) return;

        try {
            const { data: res } = await api.put('/mantenimientos/finalizar', {
                id_mantenimiento: selectedMto.id_mantenimiento,
                ...cierreForm
            });
            
            alert(res.message); // Mensaje del backend (incluye si se liberó o no)
            setModalOpen(false);
            fetchHistorial(); // Recargar tabla
        } catch (error) {
            alert(error.response?.data?.error || "Error al finalizar");
        }
    };

    const exportarPDF = () => {
        const doc = new jsPDF();
        doc.text(`Historial de Mantenimiento`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Unidad: ${data.unidad.nombre} (${data.unidad.identificador_barcode})`, 14, 28);
        
        const tableColumn = ["Fecha Inicio", "Tipo", "Descripción", "Estado / Fin", "Ubicación"];
        const tableRows = data.historial.map(item => [
            new Date(item.fecha_inicio).toLocaleDateString(),
            item.tipo,
            item.descripcion_falla,
            item.fecha_fin_real ? new Date(item.fecha_fin_real).toLocaleDateString() : "En Proceso",
            item.realizado_externamente ? "Externo" : "Interno"
        ]);
        autoTable(doc, { head: [tableColumn], body: tableRows, startY: 35 });
        doc.save(`Historial_${data.unidad.identificador_barcode}.pdf`);
    };

    return (
        <div className="content-section active">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                <div>
                    <Link to="/inventario" style={{color:'#666', textDecoration:'none', fontSize:'0.9rem'}}>← Volver</Link>
                    <h2 style={{color:'#003366', margin:'5px 0'}}>
                        Historial: {data.unidad.nombre} <span style={{fontSize:'0.8em', fontWeight:'normal'}}>({data.unidad.identificador_barcode})</span>
                    </h2>
                </div>
                <button onClick={exportarPDF} className="btn confirm" disabled={data.historial.length===0}>📄 PDF</button>
            </div>

            {/* Filtros ... (Igual que antes) ... */}
            <div className="card" style={{padding:'15px', marginBottom:'20px', background:'#f8f9fa'}}>
                <div style={{display:'flex', gap:'15px', flexWrap:'wrap', alignItems:'flex-end'}}>
                    <div><label style={{fontWeight:'bold', fontSize:'0.9em'}}>Desde:</label><input type="date" value={filtros.fecha_inicio} onChange={(e)=>setFiltros({...filtros, fecha_inicio:e.target.value})} style={{padding:'5px', width:'100%', border:'1px solid #ccc', borderRadius:'4px'}} /></div>
                    <div><label style={{fontWeight:'bold', fontSize:'0.9em'}}>Hasta:</label><input type="date" value={filtros.fecha_fin} onChange={(e)=>setFiltros({...filtros, fecha_fin:e.target.value})} style={{padding:'5px', width:'100%', border:'1px solid #ccc', borderRadius:'4px'}} /></div>
                    <button onClick={fetchHistorial} className="btn-item" style={{background:'#6c757d', color:'white'}}>Filtrar</button>
                </div>
            </div>

            {/* Tabla */}
            <div className="card">
                {loading ? <p>Cargando...</p> : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th onClick={()=>handleSort('fecha_inicio')} style={{cursor:'pointer'}}>Fecha Inicio</th>
                                <th onClick={()=>handleSort('tipo')} style={{cursor:'pointer'}}>Tipo</th>
                                <th>Descripción / Trabajo</th>
                                <th>Ubicación</th>
                                <th>Estado / Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.historial.map(item => (
                                <tr key={item.id_mantenimiento}>
                                    <td>
                                        {new Date(item.fecha_inicio).toLocaleDateString()} <br/>
                                        <small>{new Date(item.fecha_inicio).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</small>
                                    </td>
                                    <td>{item.tipo}</td>
                                    <td style={{maxWidth:'300px'}}>
                                        {item.descripcion_falla}
                                    </td>
                                    <td>{item.realizado_externamente ? 'Externo' : 'Interno'}</td>
                                    <td>
                                        {item.fecha_fin_real ? (
                                            <span style={{color:'green', fontWeight:'bold'}}>
                                                 Finalizado <br/>
                                                <small style={{fontWeight:'normal', color:'#666'}}>{new Date(item.fecha_fin_real).toLocaleDateString()}</small>
                                            </span>
                                        ) : (
                                            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                                <span style={{color:'#d39e00', fontWeight:'bold', background:'#fff3cd', padding:'2px 6px', borderRadius:'4px'}}>En Proceso</span>
                                                {/* BOTÓN FINALIZAR (RQF24) */}
                                                <button 
                                                    onClick={() => handleOpenCierre(item)} 
                                                    className="btn-item"
                                                    style={{background:'#28a745', padding:'4px 8px'}}
                                                >
                                                    Finalizar
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {data.historial.length === 0 && <tr><td colSpan="5" style={{textAlign:'center', padding:'20px'}}>Sin registros.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>

            {/* MODAL DE CIERRE (RQF24) */}
            {modalOpen && (
                <Modal onClose={() => setModalOpen(false)}>
                    <h3 style={{color:'#003366', marginBottom:'15px'}}>Finalizar Mantenimiento</h3>
                    <form onSubmit={handleSubmitCierre}>
                        
                        <div className="modal-grid">
                            <div>
                                <label>Fecha y Hora Fin Real:</label>
                                <div className="input-box">
                                    <input 
                                        type="datetime-local" 
                                        required 
                                        value={cierreForm.fecha_fin_real}
                                        onChange={(e) => setCierreForm({...cierreForm, fecha_fin_real: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label>Confirmar Ubicación:</label>
                                <div className="input-box" style={{display:'flex', gap:'15px', alignItems:'center', height:'40px'}}>
                                    <label><input type="radio" name="loc" checked={!cierreForm.realizado_externamente} onChange={()=>setCierreForm({...cierreForm, realizado_externamente: false})} /> Plantel</label>
                                    <label><input type="radio" name="loc" checked={cierreForm.realizado_externamente} onChange={()=>setCierreForm({...cierreForm, realizado_externamente: true})} /> Fuera</label>
                                </div>
                            </div>
                        </div>

                        <label>Descripción del Trabajo Realizado (Obligatorio):</label>
                        <div className="input-box">
                            <textarea 
                                required
                                style={{minHeight:'80px'}}
                                value={cierreForm.descripcion_trabajo}
                                onChange={(e) => setCierreForm({...cierreForm, descripcion_trabajo: e.target.value})}
                                placeholder="Detalle qué se reparó, piezas cambiadas, etc."
                            />
                        </div>

                        <label>Observaciones Finales (Opcional):</label>
                        <div className="input-box">
                            <textarea 
                                style={{minHeight:'50px'}}
                                value={cierreForm.observaciones}
                                onChange={(e) => setCierreForm({...cierreForm, observaciones: e.target.value})}
                                placeholder="Notas adicionales..."
                            />
                        </div>

                        <div className="modal-buttons" style={{marginTop:'20px'}}>
                            <button type="button" className="btn cancel" onClick={() => setModalOpen(false)}>Cancelar</button>
                            <button type="submit" className="btn confirm">Completar y Liberar</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default HistorialMantenimientoPage;