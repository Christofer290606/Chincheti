import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext'; // IMPORTAR AUTH

const DetalleIncidenciaPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth(); // LEER USUARIO
  const esGestor = ['coordinador', 'almacenista'].includes(usuario?.rol);

  const [incidencia, setIncidencia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Estado para el formulario de resolución
  const [solucion, setSolucion] = useState('');
  const [resolving, setResolving] = useState(false);
  const [msgResolution, setMsgResolution] = useState('');

  useEffect(() => {
    const fetchDetalle = async () => {
      try {
        const { data } = await api.get(`/incidencias/${id}`);
        setIncidencia(data);
      } catch (err) {
        setError('No se pudo cargar la incidencia. ' + (err.response?.data?.error || ''));
      } finally {
        setLoading(false);
      }
    };
    fetchDetalle();
  }, [id]);

  const handleResolver = async (e) => {
    e.preventDefault();
    
    if (solucion.trim().length < 10) {
        return setMsgResolution('Error: La justificación debe tener al menos 10 caracteres.');
    }

    setResolving(true);
    try {
        await api.put(`/incidencias/${id}/resolver`, { solucion });
        setMsgResolution('success'); 
        
        // Recargar datos
        const { data } = await api.get(`/incidencias/${id}`);
        setIncidencia(data);
        
    } catch (err) {
        setMsgResolution(err.response?.data?.error || 'Error al resolver.');
    } finally {
        setResolving(false);
    }
  };

  if (loading) return <div className="content-section active"><p>Cargando detalle...</p></div>;
  if (error) return <div className="content-section active"><p style={{color:'red'}}>{error}</p><Link to="/incidencias">Volver</Link></div>;
  if (!incidencia) return null;

  const esAbierta = incidencia.estado_incidencia === 'Abierta';

  return (
    <div className="content-section active">
      <Link to="/incidencias" className="volver">{"< Volver al listado"}</Link>
      
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'10px'}}>
        <h2>Detalle de Incidencia #{incidencia.id_incidencia}</h2>
        <span style={{
            padding:'5px 15px', 
            borderRadius:'20px', 
            background: esAbierta ? '#ffeeba' : '#d4edda',
            color: esAbierta ? '#856404' : '#155724',
            fontWeight:'bold'
        }}>
            {incidencia.estado_incidencia.toUpperCase()}
        </span>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginTop:'20px'}}>
        
        {/* COLUMNA IZQUIERDA: INFORMACIÓN GENERAL */}
        <div className="card">
            <h3> Información General</h3>
            <p><strong>Tipo:</strong> {incidencia.nombre_tipo} {incidencia.es_critica === 1 && <span style={{color:'red'}}>(CRÍTICA)</span>}</p>
            <p><strong>Fecha Registro:</strong> {new Date(incidencia.fecha_registro).toLocaleString()}</p>
            <p><strong>Registrado por:</strong> {incidencia.reportado_por}</p>
            <hr style={{margin:'15px 0', border:'0', borderTop:'1px solid #eee'}}/>
            <p><strong>Descripción:</strong></p>
            <div style={{background:'#f9f9f9', padding:'10px', borderRadius:'5px', fontStyle:'italic'}}>
                "{incidencia.descripcion}"
            </div>
        </div>

        {/* COLUMNA DERECHA: AFECTADOS Y RESOLUCIÓN */}
        <div style={{display:'flex', flexDirection:'column', gap:'20px'}}>
            
            {/* DATOS DE AFECTADOS */}
            <div className="card">
                <h3> Involucrados</h3>
                <p><strong>Usuario Afectado:</strong> <br/>
                   {incidencia.nombre_afectado} <br/>
                   <small style={{color:'#666'}}>{incidencia.matricula_afectado || incidencia.num_empleado_afectado || 'Sin ID externo'}</small>
                </p>
                
                <p style={{marginTop:'10px'}}><strong>Material Involucrado:</strong> <br/>
                   {incidencia.nombre_material ? (
                       <>
                        {incidencia.nombre_material} <br/>
                        <small style={{color:'#666'}}>Barcode: {incidencia.identificador_barcode}</small>
                       </>
                   ) : <span style={{color:'#999'}}>No aplica / General</span>}
                </p>
            </div>

            {/* SECCIÓN DE RESOLUCIÓN */}
            <div className="card" style={{borderLeft: esAbierta ? '5px solid #d9534f' : '5px solid #28a745'}}>
                <h3> Resolución</h3>
                
                {esAbierta ? (
                    esGestor ? (
                        /* FORMULARIO SOLO PARA GESTORES */
                        <form onSubmit={handleResolver}>
                            <label style={{display:'block', marginBottom:'5px'}}>Justificación de cierre:</label>
                            <textarea 
                                value={solucion}
                                onChange={(e) => setSolucion(e.target.value)}
                                placeholder="Describa cómo se solucionó (Mínimo 10 caracteres)..."
                                style={{width:'100%', minHeight:'80px', padding:'8px', borderColor: msgResolution && msgResolution !== 'success' ? 'red' : '#ccc'}}
                                disabled={resolving}
                            />
                            
                            {msgResolution && msgResolution !== 'success' && (
                                <p style={{color:'red', fontSize:'0.9rem', marginTop:'5px'}}>{msgResolution}</p>
                            )}

                            <button 
                                type="submit" 
                                className="btn confirm" 
                                style={{width:'100%', marginTop:'10px'}}
                                disabled={resolving}
                            >
                                {resolving ? 'Procesando...' : ' Marcar como Resuelta'}
                            </button>
                        </form>
                    ) : (
                        /* MENSAJE PARA USUARIOS NORMALES */
                        <p style={{color:'#666', fontStyle:'italic'}}>Esta incidencia está siendo atendida por el personal administrativo.</p>
                    )
                ) : (
                    /* INFO DE RESOLUCIÓN */
                    <div>
                        <p><strong>Resuelto por:</strong> {incidencia.nombre_resolvio}</p>
                        <p><strong>Fecha Resolución:</strong> {new Date(incidencia.fecha_cierre).toLocaleString()}</p>
                        <p><strong>Motivo/Solución:</strong></p>
                        <div style={{background:'#e8f5e9', padding:'10px', borderRadius:'5px', color:'#2e7d32'}}>
                            {incidencia.resolucion_final}
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default DetalleIncidenciaPage;