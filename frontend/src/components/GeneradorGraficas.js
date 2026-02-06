import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const GeneradorGraficas = () => {
  const [config, setConfig] = useState({
    fuente: 'incidencias', // Default para probar lo nuevo
    agrupar_por: 'tipo',
    tipo_grafica: 'barras',
    fecha_inicio: '',
    fecha_fin: '',
    id_material_base: '' // Nuevo filtro
  });

  const [datos, setDatos] = useState([]);
  const [materiales, setMateriales] = useState([]); // Lista para el dropdown
  const [isLoading, setIsLoading] = useState(false);
  const chartRef = useRef(null);

  // Cargar lista de materiales para el filtro
  useEffect(() => {
    const cargarMateriales = async () => {
      try {
        const { data } = await api.get('/materiales');
        setMateriales(data.materiales);
      } catch (e) { console.error(e); }
    };
    cargarMateriales();
  }, []);

  const opcionesAgrupacion = {
    vales: [
      { val: 'estado', label: 'Por Estado' },
      { val: 'tipo', label: 'Por Tipo' }
    ],
    incidencias: [
      { val: 'tipo', label: 'Por Tipo de Incidencia' },
      { val: 'estado', label: 'Por Estado' },
      { val: 'equipo', label: 'Por Equipo Afectado' } // Nueva opción
    ],
    mantenimiento: [
      { val: 'tipo', label: 'Por Tipo' },
      { val: 'estado', label: 'Por Estado' }
    ],
    inventario: [
      { val: 'categoria', label: 'Por Categoría' },
      { val: 'estado', label: 'Por Disponibilidad' },
      { val: 'almacen', label: 'Por Almacén' }
    ]
  };

  const handleConfigChange = (e) => {
    const { name, value } = e.target;
    setConfig(prev => {
      const newConfig = { ...prev, [name]: value };
      // Resetear agrupación si cambia fuente
      if (name === 'fuente') {
        newConfig.agrupar_por = opcionesAgrupacion[value] ? opcionesAgrupacion[value][0].val : '';
      }
      return newConfig;
    });
  };

  const generarGrafica = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // Limpiamos parámetros vacíos
      const params = new URLSearchParams();
      Object.keys(config).forEach(key => {
        if (config[key]) params.append(key, config[key]);
      });

      const { data } = await api.get(`/estadisticas/personalizada?${params.toString()}`);
      setDatos(data);
    } catch (error) {
      alert('Error al generar gráfica: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsLoading(false);
    }
  };

  // ... (función descargarPDF igual que antes) ...
  const descargarPDF = async () => {
    if (!chartRef.current) return;
    const canvas = await html2canvas(chartRef.current);
    const imgData = canvas.toDataURL('image/png');
    const doc = new jsPDF('landscape');
    doc.text(`Reporte: ${config.fuente.toUpperCase()}`, 10, 15);
    const imgProps = doc.getImageProperties(imgData);
    const pdfWidth = doc.internal.pageSize.getWidth() - 20;
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    doc.addImage(imgData, 'PNG', 10, 30, pdfWidth, pdfHeight);
    doc.save('grafica.pdf');
  };
  const COLORES = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

  // Renderizado Gráfica
  const renderGrafica = () => {
    if (datos.length === 0) return <p style={{textAlign:'center', padding:'20px'}}>No hay datos.</p>;
    const CommonAxis = <><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="etiqueta" /><YAxis /><Tooltip /><Legend /></>;

    if (config.tipo_grafica === 'barras') {
      return <ResponsiveContainer width="100%" height="100%"><BarChart data={datos}>{CommonAxis}<Bar dataKey="total" fill="#1e90ff" /></BarChart></ResponsiveContainer>;
    } else if (config.tipo_grafica === 'lineas') {
      return <ResponsiveContainer width="100%" height="100%"><LineChart data={datos}>{CommonAxis}<Line type="monotone" dataKey="total" stroke="#82ca9d" /></LineChart></ResponsiveContainer>;
    } else {
      return <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={datos} dataKey="total" nameKey="etiqueta" cx="50%" cy="50%" outerRadius={80} fill="#8884d8" label>{datos.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORES[index % COLORES.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>;
    }
  };

  return (
    <div className="card" style={{ marginTop: '30px', borderTop: '4px solid #6610f2' }}>
      <h3> Generador Avanzado</h3>
      
      <form onSubmit={generarGrafica} className="form-generador" style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'15px', marginBottom:'20px'}}>
        
        {/* Fila 1: Configuración Básica */}
        <div className="input-box">
            <label>Fuente:</label>
            <select name="fuente" value={config.fuente} onChange={handleConfigChange}>
              <option value="incidencias">Incidencias</option>
              <option value="vales">Vales</option>
              <option value="mantenimiento">Mantenimiento</option>
              <option value="inventario">Inventario</option>
            </select>
        </div>

        <div className="input-box">
            <label>Agrupar por:</label>
            <select name="agrupar_por" value={config.agrupar_por} onChange={handleConfigChange}>
              {opcionesAgrupacion[config.fuente]?.map(op => (
                <option key={op.val} value={op.val}>{op.label}</option>
              ))}
            </select>
        </div>

        <div className="input-box">
            <label>Tipo Gráfica:</label>
            <select name="tipo_grafica" value={config.tipo_grafica} onChange={handleConfigChange}>
              <option value="barras">Barras</option>
              <option value="pastel">Pastel</option>
              <option value="lineas">Líneas</option>
            </select>
        </div>

        {/* Fila 2: Filtros Específicos */}
        
        {/* NUEVO: Filtro por Equipo */}
        <div className="input-box">
            <label>Filtrar Equipo (Opcional):</label>
            <select name="id_material_base" value={config.id_material_base} onChange={handleConfigChange}>
              <option value="">-- Todos --</option>
              {materiales.map(mat => (
                <option key={mat.id_material} value={mat.id_material}>{mat.nombre}</option>
              ))}
            </select>
        </div>

        {/* ARREGLO FECHAS: Aseguramos que el input sea visible y funcional */}
        <div className="input-box">
            <label>Desde:</label>
            <input 
                type="date" 
                name="fecha_inicio" 
                value={config.fecha_inicio} 
                onChange={handleConfigChange} 
                disabled={config.fuente === 'inventario'}
                style={{background:'white'}} // Forzar fondo blanco por si acaso
            />
        </div>

        <div className="input-box">
            <label>Hasta:</label>
            <input 
                type="date" 
                name="fecha_fin" 
                value={config.fecha_fin} 
                onChange={handleConfigChange} 
                disabled={config.fuente === 'inventario'}
                style={{background:'white'}}
            />
        </div>

        <div style={{gridColumn:'1 / -1', display:'flex', justifyContent:'flex-end'}}>
          <button type="submit" className="btn confirm" disabled={isLoading}>
            {isLoading ? 'Generando...' : 'Generar Gráfica'}
          </button>
        </div>
      </form>

      {datos.length > 0 && (
        <div style={{background:'#f9f9f9', padding:'20px', borderRadius:'10px'}}>
           <div style={{textAlign:'right', marginBottom:'10px'}}>
             <button onClick={descargarPDF} className="btn" style={{background:'#6c757d', width:'auto'}}>Descargar PDF</button>
           </div>
           <div ref={chartRef} style={{height:'400px', background:'white', padding:'10px'}}>
             {renderGrafica()}
           </div>
        </div>
      )}
    </div>
  );
};

export default GeneradorGraficas;