import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext'; // IMPORTAR AUTH
import '../index.css'; 

const IncidenciasPage = () => {
  const { usuario } = useAuth(); // LEER USUARIO
  const esGestor = ['coordinador', 'almacenista'].includes(usuario?.rol);

  // --- ESTADOS DE FILTROS ---
  const [activeTab, setActiveTab] = useState('todas'); 
  
  const hoy = new Date();
  const hace30dias = new Date();
  hace30dias.setDate(hoy.getDate() - 30);

  const [filtros, setFiltros] = useState({
    busqueda: '',
    id_tipo: '',
    estado: '', 
    fecha_inicio: hace30dias.toISOString().split('T')[0],
    fecha_fin: hoy.toISOString().split('T')[0]
  });

  // --- DATOS ---
  const [incidencias, setIncidencias] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(false);

  // Cargar Tipos al inicio
  useEffect(() => {
    api.get('/incidencias/tipos').then(res => setTipos(res.data.tipos_incidencia || []));
  }, []);

  // Cargar Incidencias
  useEffect(() => {
    const fetchIncidencias = async () => {
      setLoading(true);
      try {
        const params = { ...filtros };

        if (activeTab === 'activas') {
            params.estado = 'Abierta';
            params.fecha_inicio = '';
            params.fecha_fin = '';
        }

        const { data } = await api.get('/incidencias', { params });
        setIncidencias(data.incidencias);
      } catch (error) {
        console.error("Error cargando lista", error);
      } finally {
        setLoading(false);
      }
    };
    fetchIncidencias();
  }, [filtros, activeTab]);

  const handleFiltroChange = (e) => {
    setFiltros({ ...filtros, [e.target.name]: e.target.value });
  };

  return (
    <div className="content-section active">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h2>Gestión de Incidencias</h2>
          
          {/* SOLO GESTORES PUEDEN CREAR */}
          {esGestor && (
             <Link to="/incidencias/nuevo" className="btn confirm">+ Nueva Incidencia</Link>
          )}
      </div>

      <div className="tabs-container" style={{margin:'20px 0', borderBottom:'2px solid #ddd'}}>
          <button 
            className={`tab-btn ${activeTab === 'activas' ? 'active' : ''}`}
            onClick={() => setActiveTab('activas')}
            style={{
                padding:'10px 20px', 
                border:'none', 
                background: activeTab === 'activas' ? '#d9534f' : 'transparent',
                color: activeTab === 'activas' ? 'white' : '#555',
                cursor:'pointer',
                fontWeight:'bold',
                borderRadius:'5px 5px 0 0'
            }}
          >
             Incidencias Activas
          </button>
          <button 
            className={`tab-btn ${activeTab === 'todas' ? 'active' : ''}`}
            onClick={() => setActiveTab('todas')}
            style={{
                padding:'10px 20px', 
                border:'none', 
                background: activeTab === 'todas' ? '#003366' : 'transparent',
                color: activeTab === 'todas' ? 'white' : '#555',
                cursor:'pointer',
                fontWeight:'bold',
                borderRadius:'5px 5px 0 0',
                marginLeft:'5px'
            }}
          >
             Historial Completo
          </button>
      </div>

      <div className="card filters-card" style={{display: 'flex', gap:'10px', flexWrap:'wrap', alignItems:'flex-end', padding:'15px', background:'#f8f9fa'}}>
        <div style={{flex:1, minWidth:'200px'}}>
            <label style={{fontSize:'0.8rem'}}>Búsqueda:</label>
            <input type="text" name="busqueda" placeholder="Usuario, Material, Desc..." value={filtros.busqueda} onChange={handleFiltroChange} style={{width:'100%', padding:'8px', border:'1px solid #ccc', borderRadius:'4px'}}/>
        </div>
        <div style={{width:'150px'}}>
            <label style={{fontSize:'0.8rem'}}>Tipo:</label>
            <select name="id_tipo" value={filtros.id_tipo} onChange={handleFiltroChange} style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}}>
                <option value="">Todos</option>
                {tipos.map(t => <option key={t.id_tipo_incidencia} value={t.id_tipo_incidencia}>{t.nombre_tipo}</option>)}
            </select>
        </div>
        {activeTab === 'todas' && (
             <div style={{width:'120px'}}>
                <label style={{fontSize:'0.8rem'}}>Estado:</label>
                <select name="estado" value={filtros.estado} onChange={handleFiltroChange} style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}}>
                    <option value="">Todos</option>
                    <option value="Abierta">Abierta</option>
                    <option value="Cerrada">Cerrada</option>
                </select>
            </div>
        )}
        <div style={{width:'130px'}}>
            <label style={{fontSize:'0.8rem'}}>Desde:</label>
            <input type="date" name="fecha_inicio" value={filtros.fecha_inicio} onChange={handleFiltroChange} style={{width:'100%', padding:'8px', border:'1px solid #ccc', borderRadius:'4px'}} disabled={activeTab === 'activas'} />
        </div>
        <div style={{width:'130px'}}>
            <label style={{fontSize:'0.8rem'}}>Hasta:</label>
            <input type="date" name="fecha_fin" value={filtros.fecha_fin} onChange={handleFiltroChange} style={{width:'100%', padding:'8px', border:'1px solid #ccc', borderRadius:'4px'}} disabled={activeTab === 'activas'}/>
        </div>
      </div>

      <div className="card" style={{marginTop:'20px', overflowX:'auto'}}>
          {loading ? <p>Cargando incidencias...</p> : (
              <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.9rem'}}>
                  <thead>
                      <tr style={{background:'#f1f1f1', textAlign:'left'}}>
                          <th style={{padding:'10px'}}>ID</th>
                          <th style={{padding:'10px'}}>Fecha</th>
                          <th style={{padding:'10px'}}>Tipo</th>
                          <th style={{padding:'10px'}}>Usuario Afectado</th>
                          <th style={{padding:'10px'}}>Material</th>
                          <th style={{padding:'10px'}}>Estado</th>
                          <th style={{padding:'10px'}}>Acciones</th>
                      </tr>
                  </thead>
                  <tbody>
                      {incidencias.length === 0 ? (
                          <tr><td colSpan="7" style={{padding:'20px', textAlign:'center'}}>No hay registros coincidentes.</td></tr>
                      ) : (
                          incidencias.map(inc => {
                              const esAbierta = inc.estado_incidencia === 'Abierta';
                              const rowStyle = esAbierta ? {background:'#fff5f5', borderLeft:'5px solid #d9534f'} : {borderBottom:'1px solid #eee'};
                              const linkDestino = `/incidencias/${inc.id_incidencia}`;

                              return (
                                  <tr key={inc.id_incidencia} style={rowStyle}>
                                      <td style={{padding:'10px'}}>
                                          #{inc.id_incidencia} 
                                          {inc.es_critica === 1 && <span style={{fontSize:'0.7rem', background:'red', color:'white', padding:'2px 5px', borderRadius:'4px', marginLeft:'5px'}}>CRÍTICA</span>}
                                      </td>
                                      <td style={{padding:'10px'}}>{new Date(inc.fecha_registro).toLocaleDateString()}</td>
                                      <td style={{padding:'10px'}}>{inc.nombre_tipo}</td>
                                      <td style={{padding:'10px'}}>{inc.nombre_afectado || 'N/A'}</td>
                                      <td style={{padding:'10px'}}>
                                          {inc.nombre_material ? (
                                              <div>
                                                  {inc.nombre_material} <br/>
                                                  <small style={{color:'#666'}}>{inc.identificador_barcode}</small>
                                              </div>
                                          ) : 'N/A'}
                                      </td>
                                      <td style={{padding:'10px'}}>
                                          <span style={{
                                              padding:'4px 8px', 
                                              borderRadius:'12px', 
                                              fontSize:'0.8rem',
                                              background: esAbierta ? '#ffeeba' : '#d4edda',
                                              color: esAbierta ? '#856404' : '#155724'
                                          }}>
                                              {inc.estado_incidencia}
                                          </span>
                                      </td>
                                      <td style={{padding:'10px'}}>
                                          <Link 
                                            to={linkDestino} 
                                            style={{color:'#003366', fontWeight:'bold', textDecoration:'none'}}
                                          >
                                              Ver Detalle
                                          </Link>
                                      </td>
                                  </tr>
                              );
                          })
                      )}
                  </tbody>
              </table>
          )}
      </div>
    </div>
  );
};

export default IncidenciasPage;