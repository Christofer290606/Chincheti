import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas'; 
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';

const EstadisticasPage = () => {
  const { usuario } = useAuth();
  
  // --- ESTADOS DE DATOS ---
  const [stats, setStats] = useState({
    usoMateriales: [], valesTipo: [], incidenciasTipo: [], rankingMateriales: [], inventarioEstado: [],
    mantenimientos: [], cumplimiento: []
  });
  const [catalogos, setCatalogos] = useState({ roles: [], categorias: [], almacenes: [], estadosMat: [], tiposInc: [] });

  // --- CONTROL UI ---
  const [graficaSeleccionada, setGraficaSeleccionada] = useState('todas'); 
  const [isLoading, setIsLoading] = useState(true);
  const [errorFecha, setErrorFecha] = useState(null);

  // --- FILTROS ---
  const [periodo, setPeriodo] = useState('mes');
  const [filtros, setFiltros] = useState({
    fecha_inicio: '', 
    fecha_fin: '',
    id_rol: '',
    id_categoria: '',
    id_almacen: '',
    id_estado_material: '',
    tipo_vale: '',
    id_tipo_incidencia: ''
  });

  const COLORS_PIE = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
  const COLORS = {
      ranking: '#8884d8',
      uso: '#82ca9d',
      vales: '#0088FE',
      incidencias: '#FF8042',
      inventario: '#00C49F',
      mantenimiento: '#FFBB28',
      cumplimiento: '#AF19FF'
  };

  // 1. Cargar Catálogos
  useEffect(() => {
      const fetchCatalogos = async () => {
          try {
              const { data } = await api.get('/estadisticas/catalogos');
              setCatalogos(data);
          } catch(e) { console.error("Error catálogos", e); }
      };
      fetchCatalogos();
  }, []);

  // 2. Lógica de Fechas
  useEffect(() => {
      if (periodo === 'custom') return;
      const fin = new Date();
      const inicio = new Date();
      switch(periodo) {
          case 'semana': inicio.setDate(fin.getDate() - 7); break;
          case 'mes': inicio.setMonth(fin.getMonth() - 1); break;
          case '3meses': inicio.setMonth(fin.getMonth() - 3); break;
          case '6meses': inicio.setMonth(fin.getMonth() - 6); break;
          case 'anio': inicio.setFullYear(fin.getFullYear() - 1); break;
          default: inicio.setMonth(fin.getMonth() - 1);
      }
      setFiltros(prev => ({
          ...prev,
          fecha_inicio: inicio.toISOString().split('T')[0],
          fecha_fin: fin.toISOString().split('T')[0]
      }));
      setErrorFecha(null);
  }, [periodo]);

  // 3. Validación de Fechas Custom
  useEffect(() => {
      if (periodo === 'custom' && filtros.fecha_inicio && filtros.fecha_fin) {
          const inicio = new Date(filtros.fecha_inicio);
          const fin = new Date(filtros.fecha_fin);
          const diffDays = Math.ceil(Math.abs(fin - inicio) / (1000 * 60 * 60 * 24)); 

          if (fin < inicio) {
              setErrorFecha("La fecha de fin no puede ser anterior a la de inicio.");
              return;
          }
          if (diffDays > 365) {
              setErrorFecha("El rango no puede exceder 12 meses.");
              return;
          }
          setErrorFecha(null);
      }
  }, [periodo, filtros.fecha_inicio, filtros.fecha_fin]);

  // 4. Fetch Data
  useEffect(() => {
      if(filtros.fecha_inicio && filtros.fecha_fin && !errorFecha) fetchAllStats();
  }, [filtros, errorFecha]);

  const fetchAllStats = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      Object.keys(filtros).forEach(key => {
          if (filtros[key]) params.append(key, filtros[key]);
      });
      const qs = `?${params.toString()}`;

      const [resUso, resVales, resIncidencias, resRanking, resInv, resManto, resCump] = await Promise.all([
        api.get(`/estadisticas/uso-materiales${qs}`),
        api.get(`/estadisticas/vales-tipo${qs}`),
        api.get(`/estadisticas/incidencias-tipo${qs}`),
        api.get(`/estadisticas/ranking-materiales${qs}`),
        api.get(`/estadisticas/inventario-estado${qs}`),
        api.get(`/estadisticas/mantenimientos${qs}`),
        api.get(`/estadisticas/cumplimiento${qs}`)
      ]);

      setStats({
        usoMateriales: resUso.data,
        valesTipo: resVales.data,
        incidenciasTipo: resIncidencias.data,
        rankingMateriales: resRanking.data,
        inventarioEstado: resInv.data,
        mantenimientos: resManto.data,
        cumplimiento: resCump.data
      });
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
  };

  const handleFiltroChange = (e) => setFiltros({ ...filtros, [e.target.name]: e.target.value });

  const exportarPDF = async () => {
      const input = document.getElementById('dashboard-container');
      const canvas = await html2canvas(input, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      const margen = 15;
      let y = 20;
      pdf.setFontSize(18); pdf.setTextColor(0, 51, 102);
      pdf.text("Reporte de Estadísticas", margen, y);
      y+=10;
      
      pdf.setFontSize(10); pdf.setTextColor(50);
      pdf.text(`Fecha: ${new Date().toLocaleString()}`, margen, y);
      y+=5;
      
      const textoPeriodo = periodo === 'custom' ? `Personalizado (${filtros.fecha_inicio} al ${filtros.fecha_fin})` : periodo.toUpperCase();
      pdf.text(`Periodo: ${textoPeriodo}`, margen, y);
      pdf.text(`Generado por: ${usuario.nombre_completo}`, margen, y+5);
      y+=15;

      pdf.addImage(imgData, 'PNG', 0, y, pdfWidth, pdfHeight);
      pdf.save("Reporte_Grafico.pdf");
  };

  // --- LÓGICA DE VISIBILIDAD INTELIGENTE (Corregido Aquí) ---
  const verFiltroAlmacen = ['coordinador', 'administrador'].includes((usuario.rol||'').toLowerCase());
  const verFiltrosTiempoYRol = graficaSeleccionada !== 'inventario';
  const verEstadoMat = graficaSeleccionada === 'todas' || graficaSeleccionada === 'inventario';
  const verTipoVale = graficaSeleccionada === 'todas' || graficaSeleccionada === 'vales' || graficaSeleccionada === 'cumplimiento';
  const verTipoInc = graficaSeleccionada === 'todas' || graficaSeleccionada === 'incidencias';
  
  const debeMostrar = (idGrafica) => graficaSeleccionada === 'todas' || graficaSeleccionada === idGrafica;

  // Componente de Carta
  const ChartCard = ({ title, children }) => (
      <div className="chart-card" style={{ background: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border:'1px solid #eee', minHeight:'300px' }}>
          <h4 style={{textAlign:'center', color:'#555', marginBottom:'15px'}}>{title}</h4>
          <div style={{ width: '100%', height: '250px' }}>{children}</div>
      </div>
  );

  return (
    <div className="content-section active">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
          <h2 style={{ color:'#003366', margin:0 }}>Estadísticas</h2>
          <button 
            onClick={exportarPDF} 
            className="btn confirm" 
            style={{background: errorFecha ? '#ccc' : '#d32f2f', cursor: errorFecha ? 'not-allowed' : 'pointer'}}
            disabled={!!errorFecha}
          >
            Exportar PDF
          </button>
      </div>
      
      {/* --- PANEL DE CONTROL --- */}
      <div className="card" style={{ marginBottom: '20px', padding: '15px', background:'#f8f9fa' }}>
        
        {errorFecha && (
            <div style={{background:'#f8d7da', color:'#721c24', padding:'10px', borderRadius:'5px', marginBottom:'15px', textAlign:'center', border:'1px solid #f5c6cb'}}>
                {errorFecha}
            </div>
        )}

        <div style={{display:'flex', gap:'15px', flexWrap:'wrap', alignItems:'flex-end'}}>
            
            <div style={{flex: 1, minWidth:'200px'}}>
                <label style={{fontWeight:'bold', fontSize:'0.9em', display:'block', marginBottom:'5px', color:'#003366'}}>
                    Visualizar:
                </label>
                <select 
                    value={graficaSeleccionada} 
                    onChange={(e) => setGraficaSeleccionada(e.target.value)} 
                    style={{width:'100%', padding:'8px', borderRadius:'4px', border:'2px solid #003366', fontWeight:'bold'}}
                >
                    <option value="todas">Todas las Gráficas</option>
                    <option value="ranking">Top Materiales Solicitados</option>
                    <option value="uso">Préstamos por Categoría</option>
                    <option value="vales">Distribución de Vales</option>
                    <option value="incidencias">Incidencias</option>
                    <option value="mantenimiento">Historial Mantenimiento</option>
                    <option value="cumplimiento">Cumplimiento Entregas</option>
                    <option value="inventario">Estado del Inventario</option>
                </select>
            </div>

            <div style={{flex: 1, minWidth:'150px'}}>
                <label style={{fontWeight:'bold', fontSize:'0.9em', display:'block', marginBottom:'5px'}}>Categoría:</label>
                <select name="id_categoria" onChange={handleFiltroChange} style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}}>
                    <option value="">(Todas)</option>
                    {catalogos.categorias.map(c => <option key={c.id_categoria} value={c.id_categoria}>{c.nombre_categoria}</option>)}
                </select>
            </div>

            {verFiltroAlmacen && (
                <div style={{flex: 1, minWidth:'150px'}}>
                    <label style={{fontWeight:'bold', fontSize:'0.9em', display:'block', marginBottom:'5px', color:'#d63384'}}>Almacén:</label>
                    <select name="id_almacen" onChange={handleFiltroChange} style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}}>
                        <option value="">(Todos de mi carrera)</option>
                        {catalogos.almacenes.map(a => <option key={a.id_almacen} value={a.id_almacen}>{a.nombre_almacen}</option>)}
                    </select>
                </div>
            )}

            {verFiltrosTiempoYRol && (
                <>
                    <div style={{flex: 1, minWidth:'150px'}}>
                        <label style={{fontWeight:'bold', fontSize:'0.9em', display:'block', marginBottom:'5px'}}>Periodo:</label>
                        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}}>
                            <option value="mes">Último Mes</option>
                            <option value="semana">Última Semana</option>
                            <option value="3meses">3 Meses</option>
                            <option value="6meses">6 Meses</option>
                            <option value="anio">Año Actual</option>
                            <option value="custom">Personalizado...</option>
                        </select>
                    </div>

                    <div style={{flex: 1, minWidth:'120px'}}>
                        <label style={{fontWeight:'bold', fontSize:'0.9em', display:'block', marginBottom:'5px'}}>Rol:</label>
                        <select name="id_rol" onChange={handleFiltroChange} style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}}>
                            <option value="">(Todos)</option>
                            {catalogos.roles.map(r => <option key={r.id_rol} value={r.id_rol}>{r.nombre_rol}</option>)}
                        </select>
                    </div>
                </>
            )}

            {verEstadoMat && (
                <div style={{flex: 1, minWidth:'120px'}}>
                    <label style={{fontWeight:'bold', fontSize:'0.9em', display:'block', marginBottom:'5px'}}>Estado Mat:</label>
                    <select name="id_estado_material" onChange={handleFiltroChange} style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}}>
                        <option value="">(Todos)</option>
                        {catalogos.estadosMat.map(e => <option key={e.id_estado} value={e.id_estado}>{e.nombre_estado}</option>)}
                    </select>
                </div>
            )}

            {verTipoVale && (
                <div style={{flex: 1, minWidth:'120px'}}>
                    <label style={{fontWeight:'bold', fontSize:'0.9em', display:'block', marginBottom:'5px'}}>Tipo Vale:</label>
                    <select name="tipo_vale" onChange={handleFiltroChange} style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}}>
                        <option value="">(Todos)</option>
                        <option value="Clase">Clase</option>
                        <option value="Extra-clase">Extra-clase</option>
                        <option value="Practica">Práctica</option>
                    </select>
                </div>
            )}

            {verTipoInc && (
                <div style={{flex: 1, minWidth:'120px'}}>
                    <label style={{fontWeight:'bold', fontSize:'0.9em', display:'block', marginBottom:'5px'}}>Incidencia:</label>
                    <select name="id_tipo_incidencia" onChange={handleFiltroChange} style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}}>
                        <option value="">(Todas)</option>
                        {catalogos.tiposInc.map(t => <option key={t.id_tipo_incidencia} value={t.id_tipo_incidencia}>{t.nombre_tipo}</option>)}
                    </select>
                </div>
            )}
        </div>
        
        {periodo === 'custom' && verFiltrosTiempoYRol && (
            <div style={{marginTop:'15px', paddingTop:'15px', borderTop:'1px solid #eee', display:'flex', gap:'10px', alignItems:'center'}}>
                <small style={{fontWeight:'bold'}}>Desde:</small>
                <input 
                    type="date" 
                    name="fecha_inicio" 
                    value={filtros.fecha_inicio} 
                    onChange={handleFiltroChange} 
                    style={{padding:'5px', border: errorFecha ? '2px solid #dc3545' : '1px solid #ccc'}}
                />
                <small style={{fontWeight:'bold'}}>Hasta:</small>
                <input 
                    type="date" 
                    name="fecha_fin" 
                    value={filtros.fecha_fin} 
                    onChange={handleFiltroChange} 
                    style={{padding:'5px', border: errorFecha ? '2px solid #dc3545' : '1px solid #ccc'}}
                />
            </div>
        )}
      </div>

      {/* --- GRID DE GRÁFICAS --- */}
      <div id="dashboard-container">
        {isLoading ? <p style={{textAlign:'center', marginTop:'30px'}}>Cargando datos...</p> : (
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(400px, 1fr))', gap:'20px'}}>
                
                {debeMostrar('ranking') && (
                    <ChartCard title="Top 10 Materiales Solicitados">
                        <ResponsiveContainer>
                            <BarChart data={stats.rankingMateriales} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" allowDecimals={false} />
                                <YAxis dataKey="name" type="category" width={90} style={{fontSize:'11px'}} />
                                <Tooltip />
                                <Bar dataKey="value" fill={COLORS.ranking} name="Solicitudes" radius={[0,4,4,0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}

                {debeMostrar('uso') && (
                    <ChartCard title="Préstamos por Categoría">
                        <ResponsiveContainer>
                            <BarChart data={stats.usoMateriales} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" allowDecimals={false} />
                                <YAxis dataKey="name" type="category" width={90} style={{fontSize:'11px'}} />
                                <Tooltip />
                                <Bar dataKey="value" fill={COLORS.uso} name="Préstamos" radius={[0,4,4,0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}

                {debeMostrar('vales') && (
                    <ChartCard title="Distribución de Vales">
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={stats.valesTipo} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" dataKey="value" nameKey="name" label>
                                    {stats.valesTipo.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS_PIE[index % COLORS_PIE.length]} />)}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}

                {debeMostrar('incidencias') && (
                    <ChartCard title="Incidencias por Tipo">
                        <ResponsiveContainer>
                            <BarChart data={stats.incidenciasTipo} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" allowDecimals={false} />
                                <YAxis dataKey="name" type="category" width={90} style={{fontSize:'11px'}} />
                                <Tooltip />
                                <Bar dataKey="value" fill={COLORS.incidencias} name="Incidencias" radius={[0,4,4,0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}

                {debeMostrar('mantenimiento') && (
                    <ChartCard title="Historial de Mantenimiento">
                        <ResponsiveContainer>
                            <BarChart data={stats.mantenimientos} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" allowDecimals={false} />
                                <YAxis dataKey="name" type="category" width={90} style={{fontSize:'11px'}} />
                                <Tooltip />
                                <Bar dataKey="value" fill={COLORS.mantenimiento} name="Mantenimientos" radius={[0,4,4,0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}

                {debeMostrar('cumplimiento') && (
                    <ChartCard title="Cumplimiento en Entregas">
                        <ResponsiveContainer>
                            <BarChart data={stats.cumplimiento} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" allowDecimals={false} />
                                <YAxis dataKey="name" type="category" width={90} style={{fontSize:'11px'}} />
                                <Tooltip />
                                <Bar dataKey="value" fill={COLORS.cumplimiento} name="Vales" radius={[0,4,4,0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}

                {debeMostrar('inventario') && (
                    <ChartCard title="Estado Actual del Inventario">
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={stats.inventarioEstado} cx="50%" cy="50%" outerRadius={80} fill="#00C49F" dataKey="value" nameKey="name" label>
                                    {stats.inventarioEstado.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS_PIE[index % COLORS_PIE.length]} />)}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}

            </div>
        )}
      </div>
    </div>
  );
};

export default EstadisticasPage;