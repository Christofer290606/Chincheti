import React, { useState, useEffect } from 'react';
import api from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ReporteRechazosPage = () => {
  const [rechazos, setRechazos] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros: Fecha y Búsqueda General
  const [filtros, setFiltros] = useState({
    busqueda: '',
    fecha_inicio: '',
    fecha_fin: ''
  });

  const fetchRechazos = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtros.busqueda) params.busqueda = filtros.busqueda;
      if (filtros.fecha_inicio) params.fecha_inicio = filtros.fecha_inicio;
      if (filtros.fecha_fin) params.fecha_fin = filtros.fecha_fin;

      const { data } = await api.get('/vales/reporte-rechazos', { params });
      setRechazos(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Debounce para no llamar a la API en cada tecla
    const timer = setTimeout(() => {
        fetchRechazos();
    }, 500);
    return () => clearTimeout(timer);
  }, [filtros]);

  const handleFiltroChange = (e) => {
    setFiltros({ ...filtros, [e.target.name]: e.target.value });
  };

  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.text("Reporte Histórico de Rechazos", 14, 20);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 28);

    const tableColumn = ["Folio", "Fecha", "Solicitante", "Material", "Motivo Rechazo"];
    const tableRows = rechazos.map(r => [
      r.id_vale,
      new Date(r.fecha_rechazo).toLocaleDateString(),
      r.nombre_solicitante,
      r.nombre_material || 'N/A',
      r.motivo_rechazo
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 35,
    });
    doc.save("Reporte_Rechazos.pdf");
  };

  return (
    <div className="content-section active">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
        <h2 style={{color: '#003366', margin:0}}>Historial de Rechazos</h2>
        <button onClick={exportarPDF} className="btn confirm" disabled={rechazos.length === 0}>
            Descargar PDF
        </button>
      </div>

      <div className="card" style={{padding:'20px', marginBottom:'20px', background:'#f8f9fa'}}>
        <div style={{display:'flex', gap:'15px', flexWrap:'wrap', alignItems:'flex-end'}}>
            
            {/* Buscador General */}
            <div style={{flex: 2, minWidth:'250px'}}>
                <label style={{fontWeight:'bold', display:'block', marginBottom:'5px'}}>Buscar:</label>
                <input 
                    type="text" 
                    name="busqueda"
                    placeholder="Usuario, Material o Folio..." 
                    value={filtros.busqueda}
                    onChange={handleFiltroChange}
                    style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}}
                />
            </div>

            {/* Filtros de Fecha */}
            <div style={{flex: 1, minWidth:'150px'}}>
                <label style={{fontWeight:'bold', display:'block', marginBottom:'5px'}}>Desde:</label>
                <input 
                    type="date" 
                    name="fecha_inicio"
                    value={filtros.fecha_inicio}
                    onChange={handleFiltroChange}
                    style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}}
                />
            </div>
            <div style={{flex: 1, minWidth:'150px'}}>
                <label style={{fontWeight:'bold', display:'block', marginBottom:'5px'}}>Hasta:</label>
                <input 
                    type="date" 
                    name="fecha_fin"
                    value={filtros.fecha_fin}
                    onChange={handleFiltroChange}
                    style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}}
                />
            </div>
            
            {/* Botón Limpiar */}
            <div>
                <button 
                    onClick={() => setFiltros({busqueda:'', fecha_inicio:'', fecha_fin:''})}
                    style={{padding:'9px 15px', background:'#6c757d', color:'white', border:'none', borderRadius:'4px', cursor:'pointer'}}
                >
                    Limpiar
                </button>
            </div>
        </div>
      </div>

      <div className="card">
        {loading ? <p style={{textAlign:'center'}}>Cargando...</p> : (
            <table className="data-table" style={{width:'100%', borderCollapse:'collapse'}}>
                <thead>
                    <tr style={{background:'#003366', color:'white'}}>
                        <th style={{padding:'10px'}}>Folio</th>
                        <th style={{padding:'10px'}}>Fecha Rechazo</th>
                        <th style={{padding:'10px'}}>Solicitante</th>
                        <th style={{padding:'10px'}}>Material Solicitado</th>
                        <th style={{padding:'10px'}}>Motivo</th>
                    </tr>
                </thead>
                <tbody>
                    {rechazos.map((r, i) => (
                        <tr key={i} style={{borderBottom:'1px solid #eee'}}>
                            <td style={{padding:'10px', fontWeight:'bold'}}>#{r.id_vale}</td>
                            <td style={{padding:'10px'}}>{new Date(r.fecha_rechazo).toLocaleDateString()}</td>
                            <td style={{padding:'10px'}}>{r.nombre_solicitante}</td>
                            <td style={{padding:'10px'}}>{r.nombre_material || '(Vale completo)'}</td>
                            <td style={{padding:'10px', color:'#d32f2f'}}>{r.motivo_rechazo}</td>
                        </tr>
                    ))}
                    {rechazos.length === 0 && (
                        <tr><td colSpan="5" style={{textAlign:'center', padding:'20px'}}>No se encontraron rechazos con estos criterios.</td></tr>
                    )}
                </tbody>
            </table>
        )}
      </div>
    </div>
  );
};

export default ReporteRechazosPage;