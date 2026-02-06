import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Link } from 'react-router-dom';

const AlertasPanel = () => {
    const [alertas, setAlertas] = useState([]);

    const cargarAlertas = async () => {
        try {
            const { data } = await api.get('/mantenimientos/alertas');
            setAlertas(data);
        } catch (error) { console.error("Error cargando alertas", error); }
    };

    useEffect(() => {
        cargarAlertas();
        // Opcional: Polling cada 60seg
        const interval = setInterval(cargarAlertas, 60000);
        return () => clearInterval(interval);
    }, []);

    const handleDescartar = async (id_alerta) => {
        if(!window.confirm("¿Descartar esta alerta?")) return;
        try {
            await api.put(`/mantenimientos/alertas/${id_alerta}/descartar`);
            cargarAlertas();
        } catch (error) { alert("Error al descartar"); }
    };

    if (alertas.length === 0) return null; // No mostrar nada si no hay alertas

    return (
        <div className="card" style={{borderLeft:'5px solid #ffc107', marginBottom:'20px'}}>
            <h3 style={{marginTop:0, color:'#856404'}}> Alertas de Mantenimiento Pendientes</h3>
            <div style={{maxHeight:'200px', overflowY:'auto'}}>
                <table style={{width:'100%', fontSize:'0.9rem'}}>
                    <tbody>
                        {alertas.map(a => (
                            <tr key={a.id_alerta} style={{borderBottom:'1px solid #eee'}}>
                                <td style={{padding:'8px'}}>
                                    <strong>{a.tipo_alerta === 'LimiteLigeros' ? ' Límite Ligeros' : ' Antigüedad'}</strong>
                                </td>
                                <td style={{padding:'8px'}}>
                                    Unidad: <strong>{a.identificador_barcode}</strong> ({a.nombre_material})
                                </td>
                                <td style={{padding:'8px', color:'#666'}}>
                                    {a.tipo_alerta === 'LimiteLigeros' 
                                        ? `${a.contador_mto_ligeros} / ${a.limite_mto_ligero} mantenimientos`
                                        : 'Revisión por tiempo vencida'
                                    }
                                </td>
                                <td style={{padding:'8px', textAlign:'right'}}>
                                    <Link to="/inventario" className="btn-item" style={{marginRight:'5px', padding:'2px 8px', fontSize:'0.8em'}}>Ver</Link>
                                    <button 
                                        onClick={() => handleDescartar(a.id_alerta)}
                                        style={{background:'none', border:'none', cursor:'pointer', color:'#dc3545', fontSize:'1.2rem'}}
                                        title="Descartar"
                                    >
                                        &times;
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AlertasPanel;