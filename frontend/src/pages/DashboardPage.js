import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Link } from 'react-router-dom';
import AlertasPanel from '../components/AlertasPanel';

const DashboardPage = () => {
  const { usuario } = useAuth();
  const [resumen, setResumen] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Solo Coordinadores y Almacenistas ven el tablero de control.
  const esGestorOperativo = ['coordinador', 'almacenista'].includes(usuario?.rol);

  useEffect(() => {
    if (esGestorOperativo) {
      fetchResumen();
    } else {
      setIsLoading(false);
    }
  }, [usuario, esGestorOperativo]);

  const fetchResumen = async () => {
    try {
      const { data } = await api.get('/estadisticas/resumen');
      setResumen(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar el resumen');
    } finally {
      setIsLoading(false);
    }
  };

  // Convertimos a número seguro para evitar errores lógicos
  const numVales = Number(resumen?.vales_pendientes || 0);
  const numIncidencias = Number(resumen?.incidencias_abiertas || 0);

  // Estilos para tarjetas compactas
  const kpiCardStyle = {
    background: 'white',
    borderRadius: '8px',
    padding: '15px', 
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
    minHeight: '90px', 
    position: 'relative',
    overflow: 'hidden'
  };

  const kpiNumberStyle = { fontSize: '1.8rem', fontWeight: 'bold', margin: '0', color: '#333' };
  const kpiLabelStyle = { fontSize: '0.85rem', color: '#666', marginTop: '5px', textTransform: 'uppercase' };

  return (
    <div className="content-section active">
      
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
        <h2 style={{color: '#003366', margin: 0, fontSize: '1.5rem'}}> Hola, {usuario?.nombre_completo}</h2>
        <span style={{fontSize:'0.8rem', color:'#888'}}>{new Date().toLocaleDateString()}</span>
      </div>
      
      {isLoading && <p>Cargando información...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* --- VISTA PARA COORDINADORES Y ALMACENISTAS --- */}
      {esGestorOperativo && resumen && (
        <>
          {/* 1. KPIs SUPERIORES */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '15px',
            marginBottom: '20px'
          }}>
            {/* Vales Totales */}
            <div style={{...kpiCardStyle, borderLeft: '4px solid #007bff'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                 <h3 style={kpiNumberStyle}>{resumen.vales_totales}</h3>
              </div>
              <p style={kpiLabelStyle}>Vales Totales</p>
            </div>

            {/* Incidencias */}
            <div style={{...kpiCardStyle, borderLeft: '4px solid #ef4444'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                 <h3 style={kpiNumberStyle}>{numIncidencias}</h3>
              </div>
              <p style={kpiLabelStyle}>Incidencias Abiertas</p>
            </div>

            {/* Mantenimiento */}
            <div style={{...kpiCardStyle, borderLeft: '4px solid #f59e0b'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                 <h3 style={kpiNumberStyle}>{resumen.equipos_mantenimiento}</h3>
              </div>
              <p style={kpiLabelStyle}>En Mantenimiento</p>
            </div>

            {/* Disponibles */}
            <div style={{...kpiCardStyle, borderLeft: '4px solid #10b981'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                 <h3 style={kpiNumberStyle}>{resumen.unidades_disponibles}</h3>
              </div>
              <p style={kpiLabelStyle}>Unidades Disponibles</p>
            </div>
          </div>

          {/* 2. PANELES INFERIORES */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
            
            {/* ALERTAS DE MANTENIMIENTO */}
            <div>
                <AlertasPanel />
            </div>

            {/* ACCESOS RÁPIDOS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                
                {/* TARJETA: Gestión de Incidencias */}
                <div style={{ background:'white', padding:'15px', borderRadius:'8px', boxShadow:'0 2px 4px rgba(0,0,0,0.05)', borderLeft: '4px solid #ef4444' }}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <h4 style={{margin:0, color:'#c62828', fontSize:'1rem'}}>Gestión de Incidencias</h4>
                        {numIncidencias > 0 && <span style={{background:'#c62828', color:'white', padding:'2px 8px', borderRadius:'10px', fontSize:'0.7rem'}}>Atención</span>}
                    </div>
                    
                    <div style={{marginTop:'10px', fontSize:'0.9rem'}}>
                        {numIncidencias > 0 ? (
                            <>
                                <p style={{margin:'0 0 10px 0'}}>Hay <strong>{numIncidencias}</strong> incidencias activas.</p>
                                <Link to="/incidencias" className="btn-item" style={{ background:'#c62828', padding:'6px 12px', fontSize:'0.85rem' }}>
                                    Resolver Ahora
                                </Link>
                            </>
                        ) : (
                            <p style={{ color: '#888', margin:0 }}>No hay incidencias reportadas.</p>
                        )}
                    </div>
                </div>

                {/* TARJETA: Solicitudes de Vales */}
                <div style={{ background:'white', padding:'15px', borderRadius:'8px', boxShadow:'0 2px 4px rgba(0,0,0,0.05)', borderLeft: '4px solid #007bff' }}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <h4 style={{margin:0, color:'#0056b3', fontSize:'1rem'}}>Solicitudes de Vales</h4>
                        {numVales > 0 && <span style={{background:'#007bff', color:'white', padding:'2px 8px', borderRadius:'10px', fontSize:'0.7rem'}}>Nuevo</span>}
                    </div>

                    <div style={{marginTop:'10px', fontSize:'0.9rem'}}>
                        {numVales > 0 ? (
                            <>
                                <p style={{margin:'0 0 10px 0'}}>Hay <strong>{numVales}</strong> vales esperando atención.</p>
                                <Link to="/vales" className="btn-item" style={{ padding:'6px 12px', fontSize:'0.85rem' }}>
                                    Ir al Inbox
                                </Link>
                            </>
                        ) : (
                            <p style={{ color: '#888', margin:0 }}>No hay solicitudes pendientes.</p>
                        )}
                    </div>
                </div>

            </div>
          </div>
        </>
      )}

      {/* --- VISTA PARA ADMINISTRADOR --- */}
      {!esGestorOperativo && !isLoading && (
        <div className="card" style={{textAlign: 'center', padding: '40px'}}>
          <h3 style={{color: '#007bff'}}>Bienvenido al Sistema de Gestión</h3>
          <p style={{fontSize: '1rem', color: '#555', margin: '20px 0'}}>
            {usuario?.rol === 'administrador' 
              ? 'Panel de Administración de Usuarios y Logística.'
              : 'Panel de Alumno/Maestro.'
            }
          </p>
          {usuario?.rol === 'administrador' && (
             <div style={{display:'flex', justifyContent:'center', gap:'15px'}}>
                 <Link to="/usuarios" className="btn confirm">Gestionar Usuarios</Link>
             </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardPage;