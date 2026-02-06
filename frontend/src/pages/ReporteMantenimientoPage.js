import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ReporteMantenimientoPage = () => {
    const [reporte, setReporte] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Filtros
    const [filtros, setFiltros] = useState({
        fecha_inicio: '',
        fecha_fin: '',
        id_tipo_mantenimiento: '',
        estado_tiempo: '', 
        mostrar_todos: 'false' 
    });

    const fetchReporte = useCallback(async () => {
        setLoading(true);
        try {
            const params = { ...filtros };
            // Limpiamos vacíos
            Object.keys(params).forEach(key => !params[key] && delete params[key]);
            
            const { data } = await api.get('/mantenimientos/reporte-activos', { params });
            setReporte(data);
        } catch (error) {
            console.error("Error cargando reporte:", error);
        } finally {
            setLoading(false);
        }
    }, [filtros]);

    useEffect(() => {
        fetchReporte();
    }, [fetchReporte]);

    const handleFiltroChange = (e) => {
        setFiltros({ ...filtros, [e.target.name]: e.target.value });
    };

    // --- PDF ---
    const exportarPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.setTextColor(0, 51, 102);
        doc.text("Reporte de Mantenimientos", 14, 20);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 28);
        
        let estadoTexto = 'SOLO ACTIVOS';
        if(filtros.mostrar_todos === 'true') estadoTexto = 'HISTORIAL COMPLETO';
        if(filtros.mostrar_todos === 'finalizados') estadoTexto = 'SOLO FINALIZADOS';
        doc.text(`Vista: ${estadoTexto}`, 14, 34);

        const tableColumn = ["ID", "Material", "Tipo", "Inicio", "Fin Real/Est", "Estado"];
        const tableRows = reporte.map(item => [
            item.identificador_barcode,
            item.nombre_material,
            item.tipo_mantenimiento,
            new Date(item.fecha_inicio).toLocaleDateString(),
            item.fecha_fin_real 
                ? new Date(item.fecha_fin_real).toLocaleDateString() 
                : (item.fecha_fin_estimada ? new Date(item.fecha_fin_estimada).toLocaleDateString() : '---'),
            item.estado_actual.toUpperCase()
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            styles: { fontSize: 9 },
            headStyles: { fillColor: [0, 51, 102] },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 5) {
                    if (data.cell.raw === 'ATRASADO') {
                        data.cell.styles.textColor = [220, 53, 69]; 
                        data.cell.styles.fontStyle = 'bold';
                    } else if (data.cell.raw === 'FINALIZADO') {
                        data.cell.styles.textColor = [40, 167, 69]; 
                    }
                }
            }
        });
        doc.save("Reporte_Mantenimiento.pdf");
    };

    // Estilo para los items del filtro (Sin flex-shrink para que no se aplasten)
    const filterItemStyle = {
        width: '160px', // Ancho fijo y cómodo
        display: 'flex',
        flexDirection: 'column',
        gap: '5px'
    };

    const inputStyle = {
        width: '100%', 
        height: '38px', 
        padding: '5px', 
        borderRadius: '4px', 
        border: '1px solid #ccc',
        boxSizing: 'border-box' // Importante para que el padding no rompa el ancho
    };

    return (
        <div className="content-section active">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                <h2 style={{color:'#003366', margin:0}}>Reporte de Mantenimiento</h2>
                <button onClick={exportarPDF} className="btn confirm" disabled={reporte.length === 0}>
                    Descargar PDF
                </button>
            </div>

            {/* BARRA DE FILTROS LIMPIA (Sin scroll) */}
            <div className="card" style={{padding:'15px', marginBottom:'20px', background:'#f8f9fa'}}>
                <div style={{
                    display:'flex', 
                    gap:'15px', 
                    alignItems:'flex-end', 
                    flexWrap: 'wrap' // Esto permite que bajen de línea si no caben, evitando el scroll
                }}>
                    
                    <div style={filterItemStyle}>
                        <label style={{fontWeight:'bold', fontSize:'0.9em'}}>Mostrar:</label>
                        <select name="mostrar_todos" value={filtros.mostrar_todos} onChange={handleFiltroChange} style={inputStyle}>
                            <option value="false">Solo Activos</option>
                            <option value="finalizados">Solo Finalizados</option>
                            <option value="true">Historial Completo</option>
                        </select>
                    </div>

                    <div style={filterItemStyle}>
                        <label style={{fontWeight:'bold', fontSize:'0.9em'}}>Desde:</label>
                        <input type="date" name="fecha_inicio" value={filtros.fecha_inicio} onChange={handleFiltroChange} style={inputStyle} />
                    </div>
                    
                    <div style={filterItemStyle}>
                        <label style={{fontWeight:'bold', fontSize:'0.9em'}}>Hasta:</label>
                        <input type="date" name="fecha_fin" value={filtros.fecha_fin} onChange={handleFiltroChange} style={inputStyle} />
                    </div>

                    <div style={filterItemStyle}>
                        <label style={{fontWeight:'bold', fontSize:'0.9em'}}>Tipo:</label>
                        <select name="id_tipo_mantenimiento" value={filtros.id_tipo_mantenimiento} onChange={handleFiltroChange} style={inputStyle}>
                            <option value="">Todos</option>
                            <option value="1">Preventivo Ligero</option>
                            <option value="2">Preventivo Exhaustivo</option>
                            <option value="3">Correctivo</option>
                        </select>
                    </div>

                    <div style={filterItemStyle}>
                        <label style={{fontWeight:'bold', fontSize:'0.9em'}}>Tiempo:</label>
                        <select name="estado_tiempo" value={filtros.estado_tiempo} onChange={handleFiltroChange} style={inputStyle}>
                            <option value="">Todos</option>
                            <option value="atiempo">A tiempo</option>
                            <option value="atrasado">Atrasados</option>
                        </select>
                    </div>

                    <div style={{width: '100px', paddingBottom: '1px'}}>
                        <button 
                            onClick={() => setFiltros({fecha_inicio:'', fecha_fin:'', id_tipo_mantenimiento:'', estado_tiempo:'', mostrar_todos:'false'})}
                            style={{
                                width:'100%', 
                                height:'38px', 
                                background:'#6c757d', 
                                color:'white', 
                                border:'none', 
                                borderRadius:'4px', 
                                cursor:'pointer', 
                                fontWeight: 'bold'
                            }}
                        >
                            Limpiar
                        </button>
                    </div>
                </div>
            </div>

            {/* TABLA */}
            <div className="card">
                {loading ? <p style={{textAlign:'center'}}>Cargando reporte...</p> : (
                    <table className="data-table" style={{width:'100%', borderCollapse:'collapse'}}>
                        <thead>
                            <tr style={{background:'#003366', color:'white'}}>
                                <th style={{padding:'10px'}}>ID</th>
                                <th style={{padding:'10px'}}>Material</th>
                                <th style={{padding:'10px'}}>Tipo Mantenimiento</th>
                                <th style={{padding:'10px'}}>Inicio</th>
                                <th style={{padding:'10px'}}>Fin Real / Est.</th>
                                <th style={{padding:'10px'}}>Estado Actual</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reporte.map(item => (
                                <tr key={item.id_mantenimiento} style={{borderBottom:'1px solid #eee'}}>
                                    <td style={{padding:'10px', fontFamily:'monospace'}}>{item.identificador_barcode}</td>
                                    <td style={{padding:'10px', fontWeight:'bold'}}>{item.nombre_material}</td>
                                    <td style={{padding:'10px'}}>{item.tipo_mantenimiento}</td>
                                    <td style={{padding:'10px'}}>{new Date(item.fecha_inicio).toLocaleDateString()}</td>
                                    <td style={{padding:'10px'}}>
                                        {item.fecha_fin_real 
                                            ? <span style={{color:'#155724', fontWeight:'bold'}}>{new Date(item.fecha_fin_real).toLocaleDateString()}</span>
                                            : <span style={{color:'#666'}}>{item.fecha_fin_estimada ? new Date(item.fecha_fin_estimada).toLocaleDateString() : '---'}</span>
                                        }
                                    </td>
                                    <td style={{padding:'10px'}}>
                                        <span style={{
                                            padding:'4px 8px', borderRadius:'12px', fontSize:'0.85em', fontWeight:'bold',
                                            background: item.clase_estado === 'retraso' ? '#f8d7da' : (item.clase_estado === 'finalizado' ? '#d4edda' : '#cce5ff'),
                                            color: item.clase_estado === 'retraso' ? '#842029' : (item.clase_estado === 'finalizado' ? '#155724' : '#004085')
                                        }}>
                                            {item.estado_actual}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {reporte.length === 0 && (
                                <tr><td colSpan="6" style={{textAlign:'center', padding:'20px'}}>No se encontraron mantenimientos con estos filtros.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default ReporteMantenimientoPage;