import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import GestionValeForm from '../components/vales/GestionValeForm'; 
import EntregaValeForm from '../components/vales/EntregaValeForm'; 
import DevolucionValeForm from '../components/vales/DevolucionValeForm';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; 

const DetalleValePage = () => {
  const { id } = useParams(); 
  const { usuario } = useAuth(); 
  const navigate = useNavigate();
  const location = useLocation();

  const [vale, setVale] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchVale = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get(`/vales/${id}`);
      setVale(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar el vale');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVale();
  }, [fetchVale]);

  // --- HANDLERS ---
  const handleVolver = (e) => {
      e.preventDefault();
      if (location.state?.from) {
          navigate(location.state.from);
      } else {
          navigate('/vales');
      }
  };

  const handleValeGestionado = (nuevoEstado) => { alert(`Vale ${nuevoEstado} exitosamente.`); fetchVale(); };
  const handleValeEntregado = () => { alert('Entrega registrada exitosamente'); fetchVale(); };
  const handleValeDevuelto = (estatusDevolucion) => { alert(`Devolución registrada.`); fetchVale(); };

  // --- PDF ---
  const generarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text("CENTRO DE ENSEÑANZA TÉCNICA INDUSTRIAL", 105, 20, null, null, "center");
    doc.setFontSize(12);
    doc.text("Comprobante de Vale de Material", 105, 30, null, null, "center");
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Folio: ${vale.id_vale}`, 14, 45);
    doc.text(`Estado: ${vale.nombre_estado}`, 14, 50);
    doc.text(`Tipo: ${vale.tipo_vale}`, 14, 55);
    doc.text(`Solicitante: ${vale.solicitante_nombre}`, 120, 45);
    doc.text(`Correo: ${vale.solicitante_correo}`, 120, 50);
    const fechaEntrega = vale.fecha_hora_entrega_real ? new Date(vale.fecha_hora_entrega_real).toLocaleString() : "Pendiente";
    doc.text(`Entregado: ${fechaEntrega}`, 14, 65);
    doc.text(`Devolución Esperada: ${new Date(vale.fecha_devolucion_esperada).toLocaleString()}`, 120, 65);
    doc.text(`Lugar Uso: ${vale.espacio_uso}`, 14, 70);
    
    const tableColumn = ["Material", "Cant.", "Código", "Estado Físico"];
    const tableRows = [];
    vale.materiales.forEach(mat => {
      const row = [ 
          mat.nombre, 
          mat.cantidad_solicitada, 
          mat.identificador_barcode || 'N/A', 
          mat.identificador_barcode ? 'Entregado' : 'Pendiente' 
      ];
      tableRows.push(row);
    });
    autoTable(doc, { head: [tableColumn], body: tableRows, startY: 80, theme: 'grid' });
    doc.save(`Vale_${vale.id_vale}.pdf`);
  };

  const mostrarFormularioGestion = () => {
    if (!vale || !usuario) return false;
    const esMaestroAsignado = usuario.rol === 'maestro' && vale.id_maestro_responsable === usuario.id_usuario;
    const esGestor = ['almacenista', 'coordinador'].includes(usuario.rol);
    // Mostrar gestión si está Pendiente (1 o 2)
    return (vale.id_estado_vale === 1 || vale.id_estado_vale === 2) && (esMaestroAsignado || esGestor);
  };

  if (isLoading) return <div className="content-section active"><p>Cargando detalle...</p></div>;
  if (error) return <div className="content-section active"><p style={{ color: 'red' }}>Error: {error}</p></div>;
  if (!vale) return <div className="content-section active"><p>Vale no encontrado.</p></div>;

  return (
    <div className="content-section active">
      {/* HEADER */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
        <button onClick={handleVolver} className="btn cancel" style={{ padding: '8px 20px', fontSize: '0.9rem' }}> Volver </button>
        {['Aprobado', 'Entregado', 'Devuelto', 'Cerrado'].includes(vale.nombre_estado) && (
          <button onClick={generarPDF} style={{background: '#6c757d', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '5px', cursor: 'pointer'}}>Descargar PDF</button>
        )}
      </div>
      
      <h2 style={{ textAlign: 'center', margin: '10px 0', color:'#003366' }}>Detalle del Vale #{vale.id_vale}</h2>
      <p style={{ textAlign: 'center' }}>Estado: <strong style={{fontSize:'1.2rem'}}>{vale.nombre_estado}</strong></p>

      {/* INFO GENERAL */}
      <div className="card">
        <h4>Información General</h4>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
          <div>
            <p><strong>Solicitante:</strong> {vale.solicitante_nombre}</p>
            {['almacenista', 'coordinador', 'administrador'].includes(usuario.rol) && (
                <Link to={`/usuarios/${vale.id_usuario_solicitante}/historial`} state={{ from: location.pathname }} style={{display: 'inline-block', marginTop: '5px', fontSize: '0.85em', color: 'white', background: '#6f42c1', padding: '4px 8px', borderRadius: '4px', textDecoration: 'none'}}>Historial Usuario</Link>
            )}
            <p style={{marginTop:'10px'}}><strong>Correo:</strong> {vale.solicitante_correo}</p>
            <p><strong>Tipo:</strong> {vale.tipo_vale}</p>
          </div>
          <div>
            <p><strong>Recolección:</strong> {new Date(vale.fecha_recoleccion).toLocaleString()}</p>
            <p><strong>Devolución:</strong> {new Date(vale.fecha_devolucion_esperada).toLocaleString()}</p>
            <p><strong>Lugar:</strong> {vale.espacio_uso}</p>
          </div>
        </div>
        {vale.motivo_rechazo && <div style={{marginTop: '10px', padding: '10px', background: '#ffebee', borderRadius: '5px', color: '#c62828'}}><strong>Motivo Rechazo:</strong> {vale.motivo_rechazo}</div>}
      </div>

      {/* LISTA DE MATERIALES */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h4>Materiales Solicitados</h4>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {vale.materiales.map((mat) => (
             <li key={mat.id_vale_detalle || mat.id_material_base} style={{ borderBottom: '1px solid #eee', padding: '10px 0' }}>
                <strong>{mat.nombre}</strong> (x{mat.cantidad_solicitada})
                {mat.identificador_barcode ? (
                    <span style={{ display: 'block', fontSize: '0.9em', color: 'green' }}>
                    Asignado: <strong>{mat.identificador_barcode}</strong>
                    </span>
                ) : (
                    <span style={{ display: 'block', fontSize: '0.9em', color: '#666' }}>Pendiente de entrega</span>
                )}
             </li>
          ))}
        </ul>
      </div>
      
      {/* SECCIÓN DE FORMULARIOS DE GESTIÓN 
          (Aquí el usuario puede usar el lector dentro de los inputs de estos componentes)
      */}

      {/* 1. Aprobar/Rechazar */}
      {mostrarFormularioGestion() && (
          <GestionValeForm vale={vale} onValeGestionado={handleValeGestionado} />
      )}

      {/* 2. Entregar Material (Solo si está Aprobado) */}
      {(vale.nombre_estado === 'Aprobado' && ['almacenista','coordinador'].includes(usuario.rol)) && (
        <EntregaValeForm vale={vale} onValeEntregado={handleValeEntregado} />
      )}

      {/* 3. Recibir Devolución (Solo si está Entregado) */}
      {(vale.nombre_estado === 'Entregado' && ['almacenista','coordinador'].includes(usuario.rol)) && (
        <DevolucionValeForm vale={vale} onValeDevuelto={handleValeDevuelto} />
      )}
    </div>
  );
};

export default DetalleValePage;