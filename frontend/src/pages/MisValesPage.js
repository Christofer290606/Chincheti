import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const MisValesPage = () => {
  const { usuario } = useAuth(); 
  const navigate = useNavigate();

  // 1. Inicializamos siempre como array vacío para evitar el error .filter
  const [vales, setVales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const esGestorPuro = ['almacenista', 'coordinador', 'administrador'].includes(usuario.rol);
  const [tabActiva, setTabActiva] = useState(esGestorPuro ? 'por_revisar' : 'mis_solicitudes'); 
  const [rechazoModal, setRechazoModal] = useState({ abierto: false, id_vale: null, motivo: '' });

  useEffect(() => {
    cargarVales();
  }, []);

  const cargarVales = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data } = await api.get('/vales');
      
      // 2. Validación de seguridad para los datos recibidos
      if (data && Array.isArray(data)) {
          setVales(data);
      } else if (data && data.vales) {
          setVales(data.vales);
      } else {
          setVales([]); // Si no hay datos, aseguramos array vacío
      }
    } catch (err) {
      console.error("Error en petición /vales:", err);
      // Capturamos el mensaje de error real del backend
      setError(err.response?.data?.error || 'Error de conexión con el servidor (500)');
      setVales([]); 
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Uso de Optional Chaining (?.) para prevenir errores de lectura
  const misSolicitudes = (vales || []).filter(v => v.id_usuario_solicitante == usuario.id_usuario);
  
  const solicitudesPorRevisar = (vales || []).filter(v => {
      if (usuario.rol === 'maestro') {
          return v.id_maestro_responsable == usuario.id_usuario && v.nombre_estado === 'Pendiente Maestro';
      }
      if (esGestorPuro) {
          return [2, 3, 5].includes(v.id_estado_vale) || v.nombre_estado === 'Aprobado';
      }
      return false;
  });

  const handleGestionar = async (id, accion, motivo = null) => {
    if (accion === 'Aprobar') {
        if (!window.confirm(`¿Confirmar APROBACIÓN del folio #${id}?`)) return;
    }
    try {
        await api.put(`/vales/${id}/gestionar`, { accion, motivo_rechazo: motivo });
        alert(`Solicitud procesada correctamente.`);
        setRechazoModal({ abierto: false, id_vale: null, motivo: '' }); 
        cargarVales(); 
    } catch (error) {
        alert(error.response?.data?.error || "Error al procesar");
    }
  };

  const listaVisible = tabActiva === 'mis_solicitudes' ? misSolicitudes : solicitudesPorRevisar;
  const tituloPagina = esGestorPuro ? 'Gestión de Solicitudes (Almacén)' : (usuario.rol === 'maestro' ? 'Panel de Maestro' : 'Mis Vales');

  if (isLoading) return <div className="content-section active"><p>Cargando solicitudes...</p></div>;

  return (
    <div className="content-section active">
      {/* 4. Mostrar error visualmente si existe */}
      {error && (
          <div style={{ background: '#fff5f5', color: '#c53030', padding: '15px', borderRadius: '8px', border: '1px solid #feb2b2', marginBottom: '20px' }}>
              <strong> Error del Sistema:</strong> {error}
              <button onClick={cargarVales} style={{ marginLeft: '15px', cursor: 'pointer', background: '#c53030', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px' }}>Reintentar</button>
          </div>
      )}

      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
        <h2 style={{color: '#003366', margin:0}}>{tituloPagina}</h2>
        {!esGestorPuro && <Link to="/inventario" className="btn confirm" style={{textDecoration:'none'}}>+ Nueva Solicitud</Link>}
      </div>

      {usuario.rol === 'maestro' && (
          <div style={{display:'flex', borderBottom:'2px solid #ddd', marginBottom:'20px'}}>
              <button onClick={() => setTabActiva('mis_solicitudes')} style={{ padding:'10px 20px', background:'none', border:'none', cursor:'pointer', borderBottom: tabActiva === 'mis_solicitudes' ? '3px solid #003366' : 'none', fontWeight: tabActiva === 'mis_solicitudes' ? 'bold' : 'normal' }}>
                  Mis Pedidos ({misSolicitudes.length})
              </button>
              <button onClick={() => setTabActiva('por_revisar')} style={{ padding:'10px 20px', background:'none', border:'none', cursor:'pointer', borderBottom: tabActiva === 'por_revisar' ? '3px solid #d9534f' : 'none', fontWeight: tabActiva === 'por_revisar' ? 'bold' : 'normal' }}>
                  Por Aprobar ({solicitudesPorRevisar.length})
              </button>
          </div>
      )}

      <div className="vales-container">
        {listaVisible.length > 0 ? (
          listaVisible.map((vale) => (
            <div className="vale" key={vale.id_vale} style={{borderLeft: `5px solid ${obtenerColorBorde(vale.nombre_estado)}`}}>
              <div className="vale-header">
                <span>Folio: <strong>{vale.id_vale}</strong> <span className="tipo">({vale.tipo_vale})</span></span>
                <span>{new Date(vale.fecha_recoleccion).toLocaleDateString()}</span>
              </div>
              <div className="vale-items">
                {(esGestorPuro || tabActiva === 'por_revisar') && (
                    <p style={{color:'#003366', fontWeight:'bold', fontSize:'1.1em'}}>👤 Solicitante: {vale.nombre_solicitante}</p>
                )}
                {vale.motivo_solicitud && <p style={{fontStyle:'italic', fontSize:'0.9em'}}>"{vale.motivo_solicitud}"</p>}
                <p><strong>Estado:</strong> <span style={{color: obtenerColorTexto(vale.nombre_estado), fontWeight:'bold'}}>{vale.nombre_estado}</span></p>
              </div>
              <div className="vale-footer">
                <div style={{display:'flex', gap:'10px', width:'100%'}}>
                    {vale.nombre_estado?.includes('Pendiente') && (esGestorPuro || (usuario.rol === 'maestro' && tabActiva === 'por_revisar')) && (
                        <>
                            <button className="btn confirm" style={{flex:1}} onClick={() => handleGestionar(vale.id_vale, 'Aprobar')}>✅ Aprobar</button>
                            <button className="btn cancel" style={{flex:1}} onClick={() => setRechazoModal({ abierto: true, id_vale: vale.id_vale, motivo: '' })}>🚫 Rechazar</button>
                        </>
                    )}
                    <Link to={`/vales/${vale.id_vale}`} className="btn-item" style={{background:'#6c757d', padding:'8px', flex: 0.5, textAlign:'center', color:'white', textDecoration:'none', borderRadius:'4px'}}>Ver</Link>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="card" style={{textAlign:'center', padding:'30px', color:'#666'}}>
            <p>{error ? "Error al cargar datos" : "No hay solicitudes en esta sección."}</p>
          </div>
        )}
      </div>

      {/* Modal Rechazo simplificado */}
      {rechazoModal.abierto && (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>Motivo de Rechazo</h3>
                <textarea rows="3" style={{width:'100%', marginBottom:'10px'}} value={rechazoModal.motivo} onChange={(e) => setRechazoModal({...rechazoModal, motivo: e.target.value})} />
                <div className="form-buttons">
                    <button className="btn cancel" onClick={() => setRechazoModal({ abierto: false, id_vale: null, motivo: '' })}>Cancelar</button>
                    <button className="btn confirm" disabled={rechazoModal.motivo.length < 5} onClick={() => handleGestionar(rechazoModal.id_vale, 'Rechazar', rechazoModal.motivo)}>Confirmar</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

const obtenerColorBorde = (estado) => {
  if (!estado) return '#ccc';
  if (estado.includes('Pendiente')) return '#f59e0b';
  if (estado === 'Aprobado') return '#10b981'; 
  if (estado === 'Entregado') return '#3b82f6';
  if (estado === 'Rechazado') return '#ef4444';
  return '#ccc';
};

const obtenerColorTexto = (estado) => {
  if (estado === 'Rechazado') return '#ef4444';
  if (estado === 'Aprobado') return '#10b981';
  return 'inherit';
};

export default MisValesPage;