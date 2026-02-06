import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ReportePrestamosPage = () => {
    const [prestamos, setPrestamos] = useState([]);
    const [loading, setLoading] = useState(true);

    const [busqueda, setBusqueda] = useState('');
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');

    const fetchReporte = async () => {
        setLoading(true);
        try {
            const params = {
                busqueda: busqueda || undefined,
                fecha_inicio: fechaInicio || undefined,
                fecha_fin: fechaFin || undefined
            };
            const { data } = await api.get('/vales/reporte-prestamos', { params });
            setPrestamos(data);
        } catch (error) {
            console.error("Error cargando reporte:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchReporte();
        }, 500); 
        return () => clearTimeout(timer);
    }, [busqueda, fechaInicio, fechaFin]);

    const getEstadoTiempo = (fechaDev) => {
        const hoy = new Date();
        const limite = new Date(fechaDev);
        const diffHoras = (limite - hoy) / 1000 / 60 / 60;

        if (diffHoras < 0) return { texto: 'VENCIDO', color: '#dc3545', bg: '#fff5f5' };
        if (diffHoras < 24 && diffHoras >= 0) return { texto: 'Por vencer (<24h)', color: '#ffc107', bg: '#fff3cd' };
        return { texto: 'A tiempo', color: '#28a745', bg: '#e6fffa' };
    };

    const exportarPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("Reporte de Materiales Prestados (Activos)", 14, 20);
        doc.setFontSize(10);
        doc.text(`Fecha de emisión: ${new Date().toLocaleString()}`, 14, 28);
        if (fechaInicio || fechaFin) {
            doc.text(`Filtro de Fechas: ${fechaInicio || 'Inicio'} al ${fechaFin || 'Hoy'}`, 14, 33);
        }

        const tableColumn = ["Folio", "Material / Código", "Solicitante", "F. Préstamo", "F. Límite", "Estatus"];
        const tableRows = prestamos.map(item => {
            const estado = getEstadoTiempo(item.fecha_devolucion_esperada);
            return [
                item.id_vale,
                `${item.nombre_material}\n(${item.identificador_barcode})`,
                item.nombre_solicitante,
                new Date(item.fecha_recoleccion).toLocaleDateString(),
                new Date(item.fecha_devolucion_esperada).toLocaleString(),
                estado.texto
            ];
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [0, 51, 102] },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: { 0: { cellWidth: 15 }, 5: { fontStyle: 'bold' } },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 5 && data.cell.raw === 'VENCIDO') {
                    data.cell.styles.textColor = [220, 53, 69];
                }
            }
        });
        doc.save(`Prestamos_Activos_${new Date().toISOString().slice(0,10)}.pdf`);
    };

    return (
        <div className="content-section active">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap'}}>
                <div>
                    <h2 style={{color: '#003366', margin:0}}>Materiales Prestados (Activos)</h2>
                    <p style={{color:'#666', marginBottom:'20px'}}>Monitoreo de materiales fuera del almacén.</p>
                </div>
                <button 
                    onClick={exportarPDF}
                    disabled={prestamos.length === 0}
                    style={{
                        background: '#d32f2f', color: 'white', border: 'none', padding: '10px 15px', 
                        borderRadius: '5px', cursor: prestamos.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: prestamos.length === 0 ? 0.6 : 1, fontWeight: 'bold'
                    }}
                >
                     Exportar PDF
                </button>
            </div>

            <div className="card">
                <div style={{display:'flex', gap:'15px', padding:'15px', background:'#f8f9fa', borderRadius:'8px', marginBottom:'20px', flexWrap:'wrap', alignItems:'flex-end'}}>
                    <div style={{flex: 2, minWidth:'250px'}}>
                        <label style={{fontWeight:'bold', fontSize:'0.9rem'}}>Buscar:</label>
                        <input type="text" placeholder="Material, Código o Solicitante..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}} />
                    </div>
                    <div style={{flex: 1, minWidth:'150px'}}>
                        <label style={{fontWeight:'bold', fontSize:'0.9rem'}}>Desde:</label>
                        <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}} />
                    </div>
                    <div style={{flex: 1, minWidth:'150px'}}>
                        <label style={{fontWeight:'bold', fontSize:'0.9rem'}}>Hasta:</label>
                        <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} style={{width:'100%', padding:'8px', borderRadius:'4px', border:'1px solid #ccc'}} />
                    </div>
                    <button onClick={() => {setBusqueda(''); setFechaInicio(''); setFechaFin('');}} style={{padding:'8px 15px', background:'#6c757d', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', height:'38px'}}>Limpiar</button>
                </div>

                {loading ? <p style={{textAlign:'center'}}>Cargando...</p> : (
                    <div style={{overflowX: 'auto'}}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Folio</th>
                                    <th>Material / Código</th>
                                    <th>Solicitante</th>
                                    <th>Fecha Préstamo</th>
                                    <th>Límite Devolución</th>
                                    <th>Estatus Tiempo</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {prestamos.map((item, idx) => {
                                    const estado = getEstadoTiempo(item.fecha_devolucion_esperada);
                                    return (
                                        <tr key={`${item.id_vale}-${idx}`}>
                                            <td><strong>#{item.id_vale}</strong></td>
                                            <td>
                                                <div style={{fontWeight:'bold'}}>{item.nombre_material}</div>
                                                <small style={{color:'#666', fontFamily:'monospace'}}>{item.identificador_barcode}</small>
                                            </td>
                                            <td>
                                                <div>{item.nombre_solicitante}</div>
                                                <small style={{color:'#666'}}>{item.correo}</small>
                                            </td>
                                            <td>{new Date(item.fecha_recoleccion).toLocaleDateString()}</td>
                                            <td>
                                                {new Date(item.fecha_devolucion_esperada).toLocaleDateString()} {' '}
                                                {new Date(item.fecha_devolucion_esperada).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                            </td>
                                            <td>
                                                <span style={{background: estado.bg, color: estado.color, padding:'4px 8px', borderRadius:'4px', fontWeight:'bold', fontSize:'0.85em'}}>
                                                    {estado.texto}
                                                </span>
                                            </td>
                                            <td>
                                                {/* AQUÍ ESTÁ EL CAMBIO CLAVE: state={{ from: ... }} */}
                                                <Link 
                                                    to={`/vales/${item.id_vale}`} 
                                                    state={{ from: '/reportes/prestamos' }}
                                                    className="btn-ver" 
                                                    style={{fontSize:'0.85em', textDecoration:'none', color:'white', background:'#007bff', padding:'5px 10px', borderRadius:'4px'}}
                                                >
                                                    Ver Vale
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {prestamos.length === 0 && <tr><td colSpan="7" style={{textAlign:'center', padding:'20px'}}>No hay préstamos activos con estos filtros.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReportePrestamosPage;