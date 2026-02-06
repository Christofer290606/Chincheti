import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'; 
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const HistorialUsuarioPage = () => {
    const { id_usuario } = useParams();
    const { usuario } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const handleVolver = (e) => {
        if (e) e.preventDefault();
        // Lógica inteligente de retorno
        if (location.state?.from) {
            navigate(location.state.from);
        } else if (usuario.rol === 'almacenista') {
            navigate(-1); 
        } else {
            navigate('/usuarios');
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await api.get(`/vales/historial/${id_usuario}`);
                setData(res.data);
            } catch (err) {
                console.error("Error API:", err);
                setError("Error al cargar datos. Verifique que el usuario tenga movimientos.");
            } finally {
                setLoading(false);
            }
        };
        if (id_usuario) fetchData();
    }, [id_usuario]);

    if (loading) return <div className="content-section active" style={{padding:'20px'}}><h2> Cargando expediente...</h2></div>;
    
    if (error) return (
        <div className="content-section active" style={{padding:'20px'}}>
            <h2 style={{color:'red'}}> Aviso</h2>
            <p>{error}</p>
            <button onClick={handleVolver} className="btn cancel">Volver</button>
        </div>
    );

    if (!data || !data.usuario) return <div className="content-section active"><p>Usuario no encontrado.</p></div>;

    const { usuario: infoUsuario, estadisticas, historial } = data;
    const porcentaje = estadisticas?.total_vales > 0 
        ? ((estadisticas.total_puntuales / estadisticas.total_vales) * 100).toFixed(1) 
        : "100.0";

    let colorEstado = '#28a745'; 
    if (parseFloat(porcentaje) < 80) colorEstado = '#ffc107'; 
    if (parseFloat(porcentaje) < 50 || parseInt(estadisticas?.total_incidencias) > 0) colorEstado = '#dc3545'; 

    return (
        <div className="content-section active">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                <h2 style={{color: '#003366', margin:0}}>Expediente de Usuario</h2>
                
                {/* BOTÓN CON ESTILO DE SISTEMA */}
                <button 
                    onClick={handleVolver} 
                    className="btn cancel" 
                    style={{ padding: '8px 20px', fontSize: '0.9rem' }}
                >
                    Volver
                </button>
            </div>

            <div className="card" style={{borderTop: `6px solid ${colorEstado}`}}>
                <div style={{display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:'10px'}}>
                    <div>
                        <h3 style={{margin:0, color:'#333'}}>{infoUsuario?.nombre_completo}</h3>
                        <div style={{color:'#666'}}>{infoUsuario?.correo}</div>
                        <span style={{background:'#eee', padding:'2px 8px', borderRadius:'4px', fontSize:'0.8em', textTransform:'capitalize'}}>{infoUsuario?.rol}</span>
                    </div>
                    <div style={{textAlign:'right'}}>
                        <div style={{fontSize:'0.9em', color:'#666'}}>Puntualidad</div>
                        <div style={{fontSize:'1.5em', fontWeight:'bold', color: colorEstado}}>{porcentaje}%</div>
                    </div>
                </div>

                <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:'15px', marginTop:'25px', textAlign:'center'}}>
                    <div className="stat-box" style={{background:'#f8f9fa', padding:'10px', borderRadius:'8px', border:'1px solid #ddd'}}>
                        <div style={{fontSize:'1.4em', fontWeight:'bold'}}>{estadisticas?.total_vales || 0}</div>
                        <div style={{fontSize:'0.8em', color:'#666'}}>Préstamos</div>
                    </div>
                    <div className="stat-box" style={{background:'#e8f5e9', padding:'10px', borderRadius:'8px', border:'1px solid #c8e6c9'}}>
                        <div style={{fontSize:'1.4em', fontWeight:'bold', color:'#2e7d32'}}>{estadisticas?.total_puntuales || 0}</div>
                        <div style={{fontSize:'0.8em', color:'#2e7d32'}}>A Tiempo</div>
                    </div>
                    <div className="stat-box" style={{background:'#ffebee', padding:'10px', borderRadius:'8px', border:'1px solid #ffcdd2'}}>
                        <div style={{fontSize:'1.4em', fontWeight:'bold', color:'#c62828'}}>{estadisticas?.total_retrasos || 0}</div>
                        <div style={{fontSize:'0.8em', color:'#c62828'}}>Retrasos</div>
                    </div>
                    <div className="stat-box" style={{background:'#fff3e0', padding:'10px', borderRadius:'8px', border:'1px solid #ffe0b2'}}>
                        <div style={{fontSize:'1.4em', fontWeight:'bold', color:'#ef6c00'}}>{estadisticas?.total_incidencias || 0}</div>
                        <div style={{fontSize:'0.8em', color:'#ef6c00'}}>Incidencias</div>
                    </div>
                </div>
            </div>

            <h3 style={{marginTop:'30px', color:'#003366'}}>Historial de Movimientos</h3>
            
            <div className="card" style={{overflowX:'auto'}}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Folio</th>
                            <th>Materiales</th>
                            <th>Estado</th>
                            <th>Recolección</th>
                            <th>Devolución</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historial?.length > 0 ? (
                            historial.map(v => (
                                <tr key={v.id_vale}>
                                    <td style={{fontWeight:'bold'}}>#{v.id_vale}</td>
                                    <td>{v.materiales}</td>
                                    <td>
                                        <span className="badge" style={{
                                            padding:'4px 8px', borderRadius:'4px', fontSize:'0.85em', fontWeight:'bold',
                                            background: v.nombre_estado === 'Rechazado' ? '#ffebee' : (v.estatus_devolucion === 'Con retraso' ? '#fff3cd' : '#e3f2fd'),
                                            color: v.nombre_estado === 'Rechazado' ? '#c62828' : (v.estatus_devolucion === 'Con retraso' ? '#856404' : '#0277bd')
                                        }}>
                                            {v.nombre_estado}
                                        </span>
                                    </td>
                                    <td>{new Date(v.fecha_recoleccion).toLocaleDateString()}</td>
                                    <td>{v.fecha_hora_devolucion_real ? new Date(v.fecha_hora_devolucion_real).toLocaleString() : '-'}</td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="5" style={{textAlign:'center', padding:'20px', color:'#666'}}>Sin historial registrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default HistorialUsuarioPage;