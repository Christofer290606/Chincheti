import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const SolicitarValePage = () => {
  const { id_material } = useParams(); 
  const { usuario } = useAuth(); 
  const navigate = useNavigate();
  const location = useLocation(); // 1. Hook para leer el estado de navegación

  // 2. Detectar si venimos del botón "Unirse a Fila"
  const isWaitlistMode = location.state?.forceWaitlist || false;

  const [catalogo, setCatalogo] = useState([]); 
  const [maestros, setMaestros] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Estados de Error / Bloqueo
  const [error, setError] = useState(null); 
  const [bloqueoIncidencia, setBloqueoIncidencia] = useState(false); 
  const [bloqueoDuplicidad, setBloqueoDuplicidad] = useState(false); 
  const [mensajeDuplicidad, setMensajeDuplicidad] = useState('');

  const [itemsSeleccionados, setItemsSeleccionados] = useState([]);
  const [nuevoItem, setNuevoItem] = useState({
    id_material_base: '',
    cantidad: 1
  });

  const [formData, setFormData] = useState({
    tipo_vale: 'Clase',
    fecha_recoleccion: '',
    fecha_devolucion_esperada: '',
    espacio_uso: '',
    id_maestro_responsable: '',
    motivo_solicitud: ''
  });

  // --- COLORES DINÁMICOS ---
  // Si es Waitlist, usamos un tono naranja/ámbar para diferenciar, si no, el azul/morado estándar
  const colorTema = isWaitlistMode ? '#d97706' : (formData.tipo_vale === 'Clase' ? '#003366' : '#6f42c1');
  const bgTema = isWaitlistMode ? '#fff7ed' : (formData.tipo_vale === 'Clase' ? '#e3f2fd' : '#f3e5f5');

  const almacenActivo = itemsSeleccionados.length > 0 ? itemsSeleccionados[0].id_almacen : null;
  const carreraDelAlmacen = itemsSeleccionados.length > 0 ? itemsSeleccionados[0].id_carrera_almacen : null;
  const esSolicitudExterna = usuario.rol === 'alumno' && carreraDelAlmacen && usuario.id_carrera && carreraDelAlmacen !== usuario.id_carrera;

  // Fecha Mínima
  const getMinDate = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1); 
      tomorrow.setHours(7, 0, 0, 0); 
      const tzOffset = tomorrow.getTimezoneOffset() * 60000; 
      return new Date(tomorrow - tzOffset).toISOString().slice(0, 16);
  };
  const fechaMinima = getMinDate();

  const esGestor = ['coordinador', 'almacenista', 'administrador'].includes((usuario.rol || '').toLowerCase());

  // --- FILTRO CATÁLOGO ---
  const catalogoVisible = catalogo.filter(m => {
      const stockTotal = Number(m.stock_total || 0);
      // Si es modo espera, permitimos ver cosas sin stock (porque justamente vamos a pedir eso)
      if (stockTotal <= 0 && !esGestor && !isWaitlistMode) return false;
      
      if (almacenActivo !== null && Number(m.id_almacen) !== Number(almacenActivo)) return false;
      if (itemsSeleccionados.some(i => i.id === m.id_material)) return false;
      if ((usuario.rol || '').toLowerCase() === 'alumno') {
          const esSoloMaestros = Number(m.solo_maestros || 0) === 1;
          const semMinimoMat = Number(m.semestre_minimo || 1);
          const semUsuario = Number(usuario.semestre || 0);
          if (esSoloMaestros) return false;
          if (semUsuario < semMinimoMat) return false;
      }
      return true;
  });

  const getEtiquetaMaterial = (m) => {
      const disponibles = Number(m.conteo_disponible || 0);
      const stockTotal = Number(m.stock_total || 0);
      if (disponibles > 0) return { texto: 'Disponible', color: '#28a745' };
      if (stockTotal > 0) return esGestor ? { texto: 'Prestado', color: '#007bff' } : { texto: 'Lista de espera', color: '#fd7e14' };
      return { texto: 'Baja / Mantenimiento', color: '#6c757d' };
  };

  // --- CARGA INICIAL ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const resCatalogo = await api.get('/materiales');
        setCatalogo(resCatalogo.data.materiales);

        if (id_material) {
          const resMaterial = await api.get(`/materiales/${id_material}`);
          const matInicial = resMaterial.data.detalle_material;
          setItemsSeleccionados([{
            id: matInicial.id_material,
            nombre: matInicial.nombre,
            marca: matInicial.marca,
            cantidad: 1,
            id_almacen: matInicial.id_almacen,
            id_carrera_almacen: matInicial.id_carrera_almacen || matInicial.id_carrera_exclusiva 
          }]);
        }

        if (usuario.rol === 'alumno') {
          const resMaestros = await api.get('/vales/asesores');
          setMaestros(resMaestros.data);
        }

        // Validación de Incidencias
        try {
            const resIncidencias = await api.get('/incidencias/mis-incidencias'); 
            const hayPendientes = resIncidencias.data.some(i => i.estado_incidencia === 'Pendiente' || i.estado_incidencia === 'Abierta');
            if (hayPendientes) {
                setBloqueoIncidencia(true);
            }
        } catch (e) { console.log("Info incidencias no disp."); }

      } catch (err) {
        console.error(err);
        setError('Error al cargar datos.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [id_material, usuario.rol]);

  // --- VALIDACIÓN DE DUPLICIDAD ---
  useEffect(() => {
    const validarDuplicidad = async () => {
        if (formData.fecha_recoleccion && formData.fecha_devolucion_esperada && itemsSeleccionados.length > 0) {
            try {
                const payload = {
                    id_usuario: usuario.id_usuario,
                    fecha_recoleccion: formData.fecha_recoleccion,
                    fecha_devolucion_esperada: formData.fecha_devolucion_esperada,
                    materiales: itemsSeleccionados.map(i => ({ id_material_base: i.id }))
                };

                const { data } = await api.post('/vales/validar-duplicidad', payload);
                
                if (data.existe) {
                    setBloqueoDuplicidad(true);
                    setMensajeDuplicidad(data.mensaje);
                } else {
                    setBloqueoDuplicidad(false);
                    setMensajeDuplicidad('');
                }
            } catch (error) {
                console.error("Error validando duplicidad", error);
            }
        } else {
            setBloqueoDuplicidad(false);
            setMensajeDuplicidad('');
        }
    };

    const timeoutId = setTimeout(() => {
        validarDuplicidad();
    }, 500);

    return () => clearTimeout(timeoutId);

  }, [formData.fecha_recoleccion, formData.fecha_devolucion_esperada, itemsSeleccionados, usuario.id_usuario]);


  const handleChange = (e) => {
    const { name, value } = e.target;
    const valor = (name === 'id_maestro_responsable' && value !== '') ? parseInt(value, 10) : value;
    setFormData(prev => ({ ...prev, [name]: valor }));
  };

  const agregarMaterialALista = (e) => {
    e.preventDefault();
    if (bloqueoIncidencia) return; 
    if (!nuevoItem.id_material_base) return;

    const materialInfo = catalogo.find(m => m.id_material === parseInt(nuevoItem.id_material_base));
    
    if (materialInfo) {
      if (almacenActivo !== null && materialInfo.id_almacen != almacenActivo) {
          alert("No puedes mezclar materiales de distintos almacenes.");
          setNuevoItem({ id_material_base: '', cantidad: 1 });
          return;
      }
      const totalFisico = materialInfo.stock_total || 0;
      const disponibles = materialInfo.conteo_disponible || 0;

      if (totalFisico === 0 && !esGestor && !isWaitlistMode) { alert("Error: Material no disponible."); return; }
      if (parseInt(nuevoItem.cantidad) > totalFisico && totalFisico > 0) { alert(`Error: Solo existen ${totalFisico} unidades físicas.`); return; }
      
      // Si NO estamos en modo lista de espera forzada, avisamos si se va a llenar
      if (!isWaitlistMode && parseInt(nuevoItem.cantidad) > disponibles && totalFisico > 0) {
          const confirmacion = window.confirm(`AVISO: Solo hay ${disponibles} disponibles. Tu solicitud entrará en LISTA DE ESPERA. ¿Continuar?`);
          if (!confirmacion) return;
      }

      setItemsSeleccionados(prev => [
        ...prev, 
        {
          id: materialInfo.id_material,
          nombre: materialInfo.nombre,
          marca: materialInfo.marca || '', 
          cantidad: parseInt(nuevoItem.cantidad),
          id_almacen: materialInfo.id_almacen, 
          id_carrera_almacen: materialInfo.id_carrera_almacen || materialInfo.id_carrera_exclusiva
        }
      ]);
      setNuevoItem({ id_material_base: '', cantidad: 1 });
    }
  };

  const quitarMaterial = (id) => {
    setItemsSeleccionados(prev => prev.filter(i => i.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return; 
    if (bloqueoIncidencia) { alert("Incidencias pendientes."); return; }
    if (bloqueoDuplicidad) { alert("Horario duplicado. Revisa la advertencia."); return; }

    setError(null);
    if (itemsSeleccionados.length === 0) { alert('Agrega materiales a la lista.'); return; }

    if (esSolicitudExterna) {
        if (!formData.motivo_solicitud || formData.motivo_solicitud.trim().length < 5) {
            alert("MODO EXTERNO: El motivo es obligatorio."); return;
        }
    } else {
        if (usuario.rol === 'alumno') {
            if (formData.tipo_vale === 'Clase' && !formData.id_maestro_responsable) { alert("Selecciona un Maestro Responsable."); return; }
            if (!formData.espacio_uso || formData.espacio_uso.trim() === '') { alert("El espacio de uso es obligatorio."); return; }
        }
    }

    // Validaciones de Fecha
    const inicio = new Date(formData.fecha_recoleccion);
    const fin = new Date(formData.fecha_devolucion_esperada);
    
    if (inicio.getDay() === 0 || inicio.getDay() === 6) { alert("Fin de semana cerrado."); return; }
    if (inicio.toDateString() !== fin.toDateString()) { alert("La devolución debe ser el mismo día."); return; }
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const diaRec = new Date(inicio); diaRec.setHours(0,0,0,0);
    if (diaRec <= hoy) { alert("La solicitud debe hacerse con al menos 1 día de anticipación."); return; }
    const minInicio = inicio.getHours() * 60 + inicio.getMinutes();
    const minFin = fin.getHours() * 60 + fin.getMinutes();
    if (minInicio < 420) { alert("Horario de inicio: 07:00 AM."); return; }
    if (minInicio > 820) { alert("Límite de recolección: 01:40 PM."); return; }
    if (minFin > 870) { alert("Límite de devolución: 02:30 PM."); return; }
    if ((fin - inicio) / (60000) < 50) { alert("La duración mínima es de 50 minutos."); return; }

    setIsLoading(true);

    try {
      const datosDelVale = {
        ...formData,
        id_maestro_responsable: esSolicitudExterna ? null : formData.id_maestro_responsable,
        espacio_uso: esSolicitudExterna ? null : formData.espacio_uso,
        materiales: itemsSeleccionados.map(item => ({
          id_material_base: item.id,
          cantidad_solicitada: item.cantidad
        })),
        forzar_lista_espera: isWaitlistMode // <--- 3. ENVIAMOS LA BANDERA AL BACKEND
      };

      const response = await api.post('/vales', datosDelVale);
      const nuevoFolio = response.data.id_vale;
      const estadoMsg = response.data.estado === 'espera' ? 'EN LISTA DE ESPERA' : 'CONFIRMADO';
      
      alert(`${estadoMsg}\n\n${response.data.mensaje}\nFolio: ${nuevoFolio}`);
      navigate('/vales');

    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Error al enviar la solicitud');
      setIsLoading(false);
      window.scrollTo(0, 0);
    }
  };

  if (isLoading && itemsSeleccionados.length === 0 && !error) return <div className="content-section active"><p>Cargando...</p></div>;
  
  return (
    <div className="content-section active">
      <Link to="/inventario" className="volver">{"< Cancelar"}</Link>
      
      <h2 style={{ textAlign: 'center', margin: '20px 0', color: colorTema }}>
          {isWaitlistMode ? 'Unirse a Lista de Espera' : 'Solicitud de Préstamo'}
      </h2>

      <div className="card">
        {/* Banner de Lista de Espera */}
        {isWaitlistMode && (
            <div style={{background: '#fff3cd', color: '#856404', padding: '15px', borderRadius: '8px', border: '1px solid #ffeeba', marginBottom: '20px', textAlign: 'center'}}>
                <strong> MODO LISTA DE ESPERA ACTIVADO</strong>
                <p style={{margin: '5px 0 0 0', fontSize: '0.9rem'}}>Estás solicitando material que no está disponible actualmente. Si se libera una unidad en tu horario, se te asignará automáticamente.</p>
            </div>
        )}

        <div style={{background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px', border:'1px solid #e9ecef'}}>
            <h4 style={{margin: '0 0 10px 0', color: '#495057', fontSize: '1rem'}}>Solicitante</h4>
            <div style={{display: 'flex', gap: '20px', flexWrap:'wrap', fontSize: '0.9rem'}}>
                <div><strong>Nombre:</strong> {usuario.nombre_completo}</div>
                <div><strong>Rol:</strong> <span style={{textTransform:'capitalize'}}>{usuario.rol}</span></div>
                <div><strong>Fecha:</strong> {new Date().toLocaleDateString()}</div>
            </div>
        </div>

        {/* --- ALERTAS DE BLOQUEO (RQNF7.3) --- */}
        {bloqueoIncidencia && (
            <div style={{background: '#f8d7da', color: '#721c24', padding:'15px', borderRadius:'5px', marginBottom:'15px', border: '1px solid #f5c6cb', textAlign:'center', fontWeight:'bold'}}>
                🛑 ACCESO DENEGADO: Tienes incidencias o adeudos pendientes.
            </div>
        )}

        {bloqueoDuplicidad && (
            <div style={{background: '#fff3cd', color: '#856404', padding:'15px', borderRadius:'5px', marginBottom:'15px', border: '1px solid #ffeeba', textAlign:'center', fontWeight:'bold'}}>
                ⚠️ HORARIO DUPLICADO: {mensajeDuplicidad}
            </div>
        )}

        {error && !bloqueoIncidencia && !bloqueoDuplicidad && (
            <div style={{background: '#e2e3e5', color: '#383d41', padding:'15px', borderRadius:'5px', marginBottom:'15px', border: '1px solid #d6d8db', textAlign:'center'}}>
                {error}
            </div>
        )}

        <form onSubmit={handleSubmit}>
          <fieldset disabled={bloqueoIncidencia} style={{border:'none', padding:0, margin:0}}>
              
              <h4 style={{borderBottom: `2px solid ${colorTema}`, paddingBottom: '5px', color: colorTema, marginBottom:'15px'}}>1. Selección de Materiales</h4>
              
              <div style={{background: bgTema, padding: '15px', borderRadius: '8px', marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap:'wrap', border:`1px solid ${colorTema}40`}}>
                 <div style={{flex: 4, minWidth:'250px'}}>
                   <label style={{fontSize: '0.9em', fontWeight:'bold', display:'block', marginBottom:'5px'}}>Agregar material:</label>
                   <select 
                       value={nuevoItem.id_material_base} 
                       onChange={(e) => setNuevoItem({...nuevoItem, id_material_base: e.target.value})}
                       style={{width:'100%', padding:'10px', borderRadius:'4px', border:'1px solid #ccc', fontFamily: 'monospace'}}
                   >
                       <option value="">{almacenActivo ? '-- Seleccione material del mismo almacén --' : '-- Buscar en catálogo --'}</option>
                       {catalogoVisible.map(m => {
                         const etiqueta = getEtiquetaMaterial(m);
                         // Permitimos seleccionar si es gestor O si es modo lista espera (incluso si stock es 0)
                         const isDisabled = m.stock_total <= 0 && !esGestor && !isWaitlistMode;
                         return (
                           <option 
                             key={m.id_material} 
                             value={m.id_material}
                             disabled={isDisabled}
                             style={{color: etiqueta.color, fontWeight: 'bold'}}
                           >
                             {m.nombre} — [{etiqueta.texto}]
                           </option>
                         );
                       })}
                   </select>
                 </div>
                 <div style={{flex: 1, minWidth:'80px'}}>
                   <label style={{fontSize: '0.9em', fontWeight:'bold', display:'block', marginBottom:'5px'}}>Cant:</label>
                   <input type="number" min="1" value={nuevoItem.cantidad} onChange={(e) => setNuevoItem({...nuevoItem, cantidad: e.target.value})} style={{marginBottom: 0, padding:'9px'}} />
                 </div>
                 <button type="button" className="btn confirm" onClick={agregarMaterialALista} disabled={!nuevoItem.id_material_base} style={{height:'38px', marginBottom:'1px', background: colorTema, borderColor: colorTema}}>Agregar</button>
              </div>

              <table className="data-table" style={{marginBottom: '20px'}}>
                <thead><tr><th>Material</th><th>Marca</th><th>Cant</th><th>Acción</th></tr></thead>
                <tbody>
                  {itemsSeleccionados.map((item) => (
                    <tr key={item.id}>
                      <td>{item.nombre}</td><td>{item.marca}</td><td>{item.cantidad}</td>
                      <td><button type="button" onClick={() => quitarMaterial(item.id)} style={{color: '#dc3545', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4 style={{borderBottom: `2px solid ${colorTema}`, paddingBottom: '5px', color: colorTema, marginTop:'30px', marginBottom:'15px'}}>2. Detalles de la Solicitud</h4>
              
              <div style={{background: bgTema, padding:'15px', borderRadius:'8px', border:`1px solid ${colorTema}40`}}>
                 <div style={{background:'white', padding:'15px', borderRadius:'8px', marginBottom:'15px', border:'1px solid #ddd'}}>
                    <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color: colorTema}}>Tipo de Préstamo:</label>
                    <select name="tipo_vale" value={formData.tipo_vale} onChange={handleChange} style={{width:'100%', padding:'10px', marginBottom:'15px', borderRadius:'4px', border:`2px solid ${colorTema}`, fontWeight:'bold', color:colorTema}}>
                        <option value="Clase">Uso en Clase</option>
                        <option value="Extra-clase">Extra-clase / Proyecto</option>
                        <option value="Practica">Práctica Libre</option>
                    </select>
                    
                    {!esSolicitudExterna && (
                        <>
                            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold'}}>Espacio de Uso:</label>
                            <input name="espacio_uso" value={formData.espacio_uso} onChange={handleChange} required placeholder="Ej. Laboratorio de Redes" style={{width:'100%', padding:'10px', borderRadius:'4px', border:'1px solid #ccc'}} />
                        </>
                    )}
                 </div>

                 <div style={{background:'white', padding:'15px', borderRadius:'8px', border:'1px solid #ddd', marginBottom:'15px'}}>
                    <div style={{marginBottom:'10px', fontSize:'0.85rem', color:'#666', fontStyle:'italic'}}>Horario: 07:00 AM - 02:30 PM. (Límite 01:40 PM). Mismo día.</div>
                    <label style={{display:'block', marginBottom:'5px', fontWeight:'bold'}}>Fecha Recolección:</label>
                    <input type="datetime-local" name="fecha_recoleccion" value={formData.fecha_recoleccion} onChange={handleChange} required min={fechaMinima} style={{width:'100%', padding:'10px', marginBottom:'15px', borderRadius:'4px', border:'1px solid #ccc'}} />
                    <label style={{display:'block', marginBottom:'5px', fontWeight:'bold'}}>Fecha Devolución:</label>
                    <input type="datetime-local" name="fecha_devolucion_esperada" value={formData.fecha_devolucion_esperada} onChange={handleChange} required min={formData.fecha_recoleccion} style={{width:'100%', padding:'10px', borderRadius:'4px', border:'1px solid #ccc'}} />
                 </div>

                 <div style={{background:'white', padding:'15px', borderRadius:'8px', border:'1px solid #ddd'}}>
                      {!esSolicitudExterna && usuario.rol === 'alumno' && (
                        <div style={{marginBottom:'15px'}}>
                          <label style={{display:'block', marginBottom:'5px', fontWeight:'bold'}}>Maestro Responsable:</label>
                          <select name="id_maestro_responsable" value={formData.id_maestro_responsable || ''} onChange={handleChange} required={formData.tipo_vale === 'Clase'} style={{width:'100%', padding:'10px', borderRadius:'4px', border:'1px solid #ccc'}}>
                              <option value="">-- Seleccione un Maestro --</option>
                              {maestros.map(m => <option key={m.id_usuario} value={m.id_usuario}>{m.nombre}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label style={{display:'block', marginBottom:'5px', fontWeight:'bold'}}>Motivo {esSolicitudExterna ? <span style={{color:'red'}}>(OBLIGATORIO)</span> : '(Opcional)'}:</label>
                        <textarea name="motivo_solicitud" value={formData.motivo_solicitud} onChange={handleChange} required={esSolicitudExterna} placeholder={esSolicitudExterna ? "Explique detalladamente..." : "Opcional"} rows="2" style={{width:'100%', padding:'10px', borderRadius:'5px', border: esSolicitudExterna && !formData.motivo_solicitud ? '1px solid #dc3545' : '1px solid #ccc'}} />
                      </div>
                 </div>
              </div>

              {/* BOTÓN CONFIRMAR */}
              <div className="form-buttons" style={{marginTop:'30px', paddingTop:'20px', borderTop:'1px solid #eee', display:'flex', gap:'15px', justifyContent:'flex-end'}}>
                <Link to="/inventario" className="btn cancel" style={{padding:'12px 25px', textDecoration:'none', display:'flex', alignItems:'center'}}>Cancelar</Link>
                
                <button 
                    type="submit" 
                    className="btn confirm" 
                    disabled={isLoading || itemsSeleccionados.length === 0 || bloqueoIncidencia || bloqueoDuplicidad} 
                    style={{
                        opacity: (bloqueoIncidencia || bloqueoDuplicidad) ? 0.5 : 1, 
                        cursor: (bloqueoIncidencia || bloqueoDuplicidad) ? 'not-allowed' : 'pointer', 
                        background: colorTema,
                        borderColor: colorTema
                    }}
                >
                  {(bloqueoIncidencia || bloqueoDuplicidad) 
                    ? 'Solicitud Bloqueada' 
                    : (isLoading 
                        ? 'Enviando...' 
                        : (isWaitlistMode ? 'Unirse a Lista de Espera' : 'Confirmar Solicitud')
                      )
                  }
                </button>
              </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
};

export default SolicitarValePage;