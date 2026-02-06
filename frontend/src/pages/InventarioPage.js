import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api'; 
import { useAuth } from '../context/AuthContext'; 
import Modal from '../components/Modal/Modal'; 
import MaterialBuscador from '../components/MaterialBuscador'; 

const InventarioPage = () => {
  const { usuario } = useAuth(); 
  const navigate = useNavigate();

  // --- ESTADOS DE DATOS ---
  const [materiales, setMateriales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // eslint-disable-next-line no-unused-vars
  const [error, setError] = useState(null);

  // --- ESTADOS UI ---
  const [modalContent, setModalContent] = useState(null); 
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [detalleUnidades, setDetalleUnidades] = useState([]);
  const [selectedUnidadMto, setSelectedUnidadMto] = useState(null); 

  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});

  // --- FILTROS ---
  const [filtroCategoria, setFiltroCategoria] = useState(''); 

  // --- FORMULARIOS ---
  const [catalogos, setCatalogos] = useState({ categorias: [], almacenes: [], carreras: [] });
  const [mtoTiempoEnabled, setMtoTiempoEnabled] = useState(false);
  const [mtoUsoEnabled, setMtoUsoEnabled] = useState(false);
  
  const [formData, setFormData] = useState({ 
      nombre: '', marca: '', modelo: '', 
      ano_modelo: new Date().getFullYear(), 
      id_categoria: '', id_almacen: '', 
      cantidad: 1, descripcion: '', 
      id_carrera_exclusiva: null, 
      plan_mto_dias: '', plan_mto_usos: '', 
      mto_ligeros_max: 0, mto_es_interno: true 
  });

  const [mtoFormData, setMtoFormData] = useState({
      id_tipo_mantenimiento: '1',
      descripcion: '',
      fecha_inicio: '',
      fecha_fin_estimada: '',
      es_externo: false
  });

  const esGestor = ['coordinador', 'almacenista'].includes(usuario?.rol);

  // --- CARGA DE DATOS ---
  const fetchMateriales = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/materiales');
      setMateriales(data.materiales);
      setError(null);
    } catch (err) { 
        console.error(err);
        setError('Error al cargar inventario'); 
    } finally { 
        setIsLoading(false); 
    }
  }, []);

  const fetchCatalogos = useCallback(async () => {
    if (catalogos.categorias.length > 0) return; 
    try {
      const { data } = await api.get('/materiales/catalogos'); 
      setCatalogos({ categorias: data.categorias, almacenes: data.almacenes, carreras: data.carreras });
    } catch (err) { console.error(err); }
  }, [catalogos.categorias.length]);

  useEffect(() => { 
      if (usuario.rol !== 'administrador') {
          fetchMateriales(); 
          fetchCatalogos(); 
      }
  }, [usuario.rol, fetchMateriales, fetchCatalogos]); 

  // --- LÓGICA DE FILTRADO ---
  const clasificarMateriales = () => {
    const porAlmacen = {}; 
    
    let filtrados = materiales.filter(m => {
        if (usuario.rol === 'almacenista') return m.id_almacen == usuario.id_almacen;
        if (usuario.rol === 'coordinador') return m.id_carrera_almacen == usuario.id_carrera;
        if (usuario.rol === 'alumno' || usuario.rol === 'maestro') {
            if (parseInt(m.solo_maestros || 0) === 1 && usuario.rol === 'alumno') return false;
            const miCarreraID = parseInt(usuario.id_carrera || 0);
            const carreraAlmacenID = parseInt(m.id_carrera_almacen || 0);
            if (carreraAlmacenID === miCarreraID) return true; 
            else return m.id_carrera_exclusiva === null;
        }
        return false;
    });

    if (filtroCategoria) {
        filtrados = filtrados.filter(m => m.id_categoria == filtroCategoria);
    }
    
    filtrados.forEach(mat => {
      const total = mat.stock_total !== undefined ? mat.stock_total : (mat.total_unidades || 0);
      if (total === 0 && !esGestor) return;
      const n = mat.nombre_almacen || 'Almacén General';
      if (!porAlmacen[n]) porAlmacen[n] = [];
      porAlmacen[n].push(mat);
    });

    return porAlmacen;
  };

  const agrupadosPorAlmacen = clasificarMateriales();
  const nombresAlmacenes = Object.keys(agrupadosPorAlmacen).sort();

  // --- HANDLERS ---
  const fetchDetalleUnidades = async (id_material) => {
    try {
      const { data } = await api.get(`/materiales/${id_material}`);
      setSelectedMaterial(data.detalle_material || {}); 
      setDetalleUnidades(data.unidades || []); 
      setEditFormData({ 
          ...(data.detalle_material || {}), 
          plan_mto_dias: data.detalle_material?.plan_mto_dias || '', 
          plan_mto_usos: data.detalle_material?.plan_mto_usos || '' 
      });
      setIsEditing(false);
      setModalContent('detalle');
    } catch (err) { console.error(err); alert('Error al cargar detalle.'); }
  };

  const handleSearchResult = async (item) => {
      await fetchDetalleUnidades(item.id_material);
  };

  const handleBajaUnidad = async (id_unidad, codigo) => {
    if (!window.confirm(`¿Confirmar BAJA de unidad ${codigo}?`)) return;
    try {
        await api.patch(`/materiales/unidades/${id_unidad}/baja`);
        alert(`Unidad ${codigo} dada de baja.`);
        fetchDetalleUnidades(selectedMaterial.id_material);
    } catch (err) { alert(err.response?.data?.error || 'Error al dar de baja'); }
  };

  const handleCopyBarcode = async (barcode) => {
    try {
        const imageUrl = `http://localhost:4000/barcodes/${barcode}.png`;
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        alert('Código copiado');
    } catch (err) { console.error(err); alert("Error al copiar imagen."); }
  };

  const handleOpenMantenimiento = (unidad) => {
      setSelectedUnidadMto(unidad);
      const hoy = new Date();
      const hoyLocal = new Date(hoy.getTime() - (hoy.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      
      setMtoFormData({ 
          id_tipo_mantenimiento: '1', 
          descripcion: '', 
          fecha_inicio: hoyLocal, 
          fecha_fin_estimada: '', 
          es_externo: false 
      });
      setModalContent('mantenimiento');
  };

  const handleSubmitMantenimiento = async (e) => {
      e.preventDefault();
      if(!mtoFormData.descripcion || !mtoFormData.fecha_inicio) { alert("Descripción y Fecha de Inicio son obligatorias."); return; }
      try {
          await api.post('/mantenimientos', { ...mtoFormData, id_unidad: selectedUnidadMto.id_unidad });
          alert("Mantenimiento registrado correctamente.");
          setModalContent('detalle');
          fetchDetalleUnidades(selectedMaterial.id_material);
          fetchMateriales(); 
      } catch (error) { console.error(error); alert(error.response?.data?.error || "Error al registrar mantenimiento"); }
  };

  const handleOpenCrearModal = () => {
      setFormData({ 
          nombre: '', marca: '', modelo: '', 
          ano_modelo: new Date().getFullYear(), 
          id_categoria: '', id_almacen: usuario?.id_almacen || '', 
          cantidad: 1, descripcion: '', 
          id_carrera_exclusiva: null, 
          plan_mto_dias: '', plan_mto_usos: '', 
          mto_ligeros_max: 0, mto_es_interno: true 
      }); 
      setMtoTiempoEnabled(false); 
      setMtoUsoEnabled(false); 
      setModalContent('crear'); 
  };

  const handleFormChange = (e) => {
      const { name, value, type, checked } = e.target;
      let v = value;
      if (type === 'checkbox') v = checked;
      else if (['id_categoria', 'id_almacen', 'id_carrera_exclusiva', 'ano_modelo', 'cantidad', 'mto_ligeros_max'].includes(name)) v = value === '' ? '' : parseInt(value, 10);
      else if (name === 'mto_es_interno') v = value === 'true';
      setFormData(p => ({ ...p, [name]: v }));
  };

  const validarFormulario = (datos, checkTiempo, checkUso) => {
      const currentYear = new Date().getFullYear();
      if (datos.ano_modelo < 2000 || datos.ano_modelo > currentYear + 1) { alert(`Año inválido.`); return false; }
      const catSeleccionada = catalogos.categorias.find(c => c.id_categoria == datos.id_categoria);
      const esConsumible = catSeleccionada && catSeleccionada.nombre_categoria === 'Consumible';
      if (!esConsumible) {
          if (!checkTiempo && !checkUso) { alert("Equipos/Herramientas requieren plan de mantenimiento."); return false; }
          if (checkTiempo && (!datos.plan_mto_dias || datos.plan_mto_dias <= 0)) { alert("Faltan días de mantenimiento."); return false; }
          if (checkUso && (!datos.plan_mto_usos || datos.plan_mto_usos <= 0)) { alert("Faltan usos de mantenimiento."); return false; }
      }
      return true;
  };

  const handleFormSubmit = async (e) => {
      e.preventDefault();
      if (!formData.id_categoria || !formData.id_almacen) { alert("Faltan datos."); return; }
      if (!validarFormulario(formData, mtoTiempoEnabled, mtoUsoEnabled)) return;
      const d = { ...formData };
      if (!mtoTiempoEnabled) d.plan_mto_dias = null;
      if (!mtoUsoEnabled) d.plan_mto_usos = null;
      setIsLoading(true);
      try {
          await api.post('/materiales', d);
          setModalContent(null);
          fetchMateriales();
          alert('Material registrado.');
      } catch (err) { alert(err.response?.data?.error || 'Error al crear'); } finally { setIsLoading(false); }
  };

  const handleEditChange = (e) => {
      const { name, value } = e.target;
      let v = value;
      if (name === 'mto_es_interno') v = value === 'true';
      if (['ano_modelo', 'plan_mto_dias', 'plan_mto_usos', 'mto_ligeros_max', 'id_carrera_exclusiva', 'id_categoria'].includes(name)) v = value === '' ? null : parseInt(value, 10);
      setEditFormData(p => ({ ...p, [name]: v }));
  };

  const handleUpdateMaterial = async (e) => {
      e.preventDefault();
      if (!validarFormulario(editFormData, mtoTiempoEnabled, mtoUsoEnabled)) return;
      if (!window.confirm("¿Confirmar cambios?")) return;
      const d = { ...editFormData };
      if (!mtoTiempoEnabled) d.plan_mto_dias = null;
      if (!mtoUsoEnabled) d.plan_mto_usos = null;
      try {
          await api.put(`/materiales/${selectedMaterial.id_material}`, d);
          alert("Actualizado.");
          setIsEditing(false);
          fetchDetalleUnidades(selectedMaterial.id_material);
          fetchMateriales();
      } catch (err) { alert(err.response?.data?.error); }
  };

  const getBadgeClass = (estado) => {
      if (!estado) return '';
      const st = estado.toLowerCase();
      if (st.includes('disponible')) return 'disponible';
      if (st.includes('prestado') || st.includes('uso')) return 'enuso';
      if (st.includes('mantenimiento')) return 'mantenimiento';
      if (st.includes('baja')) return 'baja';
      return '';
  };
  
  const { almacenesDisp, carrerasDisp } = (() => {
      let almacenesDisp = [...catalogos.almacenes];
      let carrerasDisp = [...catalogos.carreras];
      if (usuario.rol === 'almacenista') {
          if (usuario.id_almacen) almacenesDisp = almacenesDisp.filter(a => a.id_almacen == usuario.id_almacen);
          if (usuario.id_carrera) carrerasDisp = carrerasDisp.filter(c => c.id_carrera == usuario.id_carrera);
          else carrerasDisp = [];
      } else if (usuario.rol === 'coordinador') {
          if (usuario.id_carrera) {
              almacenesDisp = almacenesDisp.filter(a => a.id_carrera == usuario.id_carrera);
              carrerasDisp = carrerasDisp.filter(c => c.id_carrera == usuario.id_carrera);
          }
      }
      return { almacenesDisp, carrerasDisp };
  })();

  // --- RENDERIZADO DE TARJETA ---
  const renderMaterialCard = (mat, slider) => {
    const disp = mat.conteo_disponible !== undefined ? mat.conteo_disponible : (mat.unidades_disponibles || 0);
    const prest = mat.conteo_prestado || 0;
    const mtto = mat.conteo_mantenimiento || 0;
    const baja = mat.conteo_baja || 0;
    const total = mat.stock_total !== undefined ? mat.stock_total : (mat.total_unidades || 0);
    const esModoEspera = !esGestor && prest > 0 && disp === 0

    let etiqueta = { text: "Disponible", class: "disponible", btnText: "Solicitar", disabled: false };
    
    // Si no hay disponibles ni prestados, y no soy gestor, no mostrar.
    if (!esGestor && disp === 0 && prest === 0) return null;

    if (usuario?.estatus === 'Bloqueado' && !esGestor) { 
        etiqueta = { text: "Bloqueado", class: "agotado", btnText: "Bloqueado", disabled: true }; 
    }
    else if (disp > 0) { 
        etiqueta = { text: "Disponible", class: "disponible", btnText: "Solicitar", disabled: false }; 
    }
    else {
        // STOCK 0, PERO...
        if (prest > 0) {
            // Hay unidades prestadas, así que se puede entrar a LISTA DE ESPERA
            if (esGestor) etiqueta = { text: "Prestado", class: "prestado", btnText: "Ver Préstamos", disabled: false };
            else etiqueta = { text: "Lista de Espera", class: "espera", btnText: "Unirse a Fila", disabled: false };
        }
        else if (mtto > 0) etiqueta = { text: "En Mantenimiento", class: "mantenimiento", btnText: "Mantenimiento", disabled: true };
        else etiqueta = { text: "Agotado / Baja", class: "baja", btnText: "No Disponible", disabled: true };
    }
    
    if (usuario.rol === 'administrador') return null;

    return (
      <div key={mat.id_material} className={slider ? "slider-card" : "card"} style={slider ? {minWidth: '280px', marginRight: '15px'} : {}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'10px'}}>
          <h4 style={{margin:0,fontSize:'1.1rem'}}>{mat.nombre}</h4>
          <span className={`badge ${etiqueta.class}`}>{etiqueta.text}</span>
        </div>
        <div style={{fontSize:'0.9rem',color:'#666',marginBottom:'10px'}}>
          <p><strong>Marca:</strong> {mat.marca} - {mat.modelo}</p>
          
          {esGestor ? (
              <div style={{fontSize:'0.8rem', marginTop:'5px'}}>
                  <span style={{color:'green'}} title="Disponibles">✓{disp}</span> | 
                  <span style={{color:'blue'}} title="Prestados"> ↻{prest}</span> | 
                  <span style={{color:'#d39e00'}} title="Mantenimiento"> 🛠{mtto}</span> |
                  <span style={{color:'gray'}} title="Baja"> ✖{baja}</span>
              </div>
          ) : (
              // Vista para Alumno: Si hay disponibles o lista de espera
              <p><strong>Disp:</strong> <span style={{color:disp>0?'green':(prest>0?'orange':'red'), fontWeight:'bold'}}>{disp}</span> / {total}</p>
          )}
        </div>
        <div style={{marginTop:'auto'}}>
           {esGestor ? (
             <button onClick={() => fetchDetalleUnidades(mat.id_material)} className="btn-item" style={{width:'100%',background:'#6c757d'}}>Administrar</button>
           ) : (
             // [MODIFICADO] Ahora el botón SIEMPRE navega a la solicitud, incluso si es Lista de Espera.
             // El backend determinará el estado final.
             <button type="button" onClick={() => navigate(`/vales/solicitar/${mat.id_material}`,{ state: { forceWaitlist: esModoEspera }})} disabled={etiqueta.disabled} className={`btn-item ${etiqueta.class === 'espera' ? 'btn-warning' : ''}`} style={{width:'100%'}}>
                 {etiqueta.btnText}
             </button>
           )}
        </div>
      </div>
    );
  };

  if (usuario.rol === 'administrador') {
      return ( <div className="content-section active" style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100%'}}><div style={{textAlign:'center',color:'#666'}}><h2>🚫 Área Restringida</h2><p>La gestión de inventario es exclusiva para Coordinadores y Almacenistas.</p></div></div> );
  }

  return (
    <div className="content-section active">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px',flexWrap:'wrap',gap:'15px'}}>
        <h2 style={{margin:0}}>Inventario</h2>
        <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap',flex:1,justifyContent:'flex-end'}}>
            
            <div style={{flex: 1, maxWidth:'400px'}}>
                <MaterialBuscador onSelect={handleSearchResult} placeholder="🔍 Nombre o ID (3 caracteres)..." />
            </div>

            <select value={filtroCategoria} onChange={(e)=>setFiltroCategoria(e.target.value)} style={{padding:'8px',borderRadius:'6px',border:'1px solid #ccc'}}>
                <option value="">Todas Categorías</option>
                {catalogos.categorias.map(c=><option key={c.id_categoria} value={c.id_categoria}>{c.nombre_categoria}</option>)}
            </select>
            {esGestor && <button className="add" onClick={handleOpenCrearModal}>+ Agregar</button>}
        </div>
      </div>

      {isLoading && <p>Cargando...</p>}
      
      {nombresAlmacenes.length > 0 ? (
          nombresAlmacenes.map(nombreAlmacen => (
            <div key={nombreAlmacen} style={{marginBottom:'35px'}}>
              <h3 style={{color:'#003366', borderBottom:'2px solid #1e90ff', paddingBottom:'5px', marginBottom:'15px'}}>
                  {nombreAlmacen} <span style={{fontSize:'0.8rem', color:'#666', fontWeight:'normal'}}>({agrupadosPorAlmacen[nombreAlmacen].length} items)</span>
              </h3>
              <div className="grid-principal" style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:'20px'}}>
                  {agrupadosPorAlmacen[nombreAlmacen].map(m => renderMaterialCard(m, false))}
              </div>
            </div>
          ))
      ) : ( <div style={{textAlign:'center', padding:'40px', color:'#666'}}><p>No se encontraron materiales para su perfil.</p></div> )}

      {/* --- MODALES --- */}
      {modalContent && (
        <Modal onClose={()=>{setModalContent(null);setIsEditing(false);}}>
          
          {/* Modal CREAR MATERIAL */}
          {modalContent==='crear' && esGestor && (
              <>
               <h3 style={{marginBottom:'20px',color:'#003366'}}>Registrar Nuevo Material</h3>
               <form onSubmit={handleFormSubmit}>
                 <div className="modal-grid">
                   <div><label>Nombre:</label><div className="input-box"><input name="nombre" value={formData.nombre} onChange={handleFormChange} required /></div></div>
                   <div><label>Marca:</label><div className="input-box"><input name="marca" value={formData.marca} onChange={handleFormChange} required /></div></div>
                   <div><label>Modelo:</label><div className="input-box"><input name="modelo" value={formData.modelo} onChange={handleFormChange} required /></div></div>
                   <div><label>Año:</label><div className="input-box"><input name="ano_modelo" type="number" min="2000" max={new Date().getFullYear()+1} value={formData.ano_modelo} onChange={handleFormChange} required /></div></div>
                 </div>
                 <div className="modal-grid">
                   <div><label>Categoría:</label><div className="input-box"><select name="id_categoria" value={formData.id_categoria} onChange={handleFormChange} required><option value="">-- Seleccione --</option>{catalogos.categorias.map(c=><option key={c.id_categoria} value={c.id_categoria}>{c.nombre_categoria}</option>)}</select></div></div>
                   <div><label>Almacén:</label><div className="input-box"><select name="id_almacen" value={formData.id_almacen} onChange={handleFormChange} required><option value="">-- Seleccione --</option>{almacenesDisp.map(a=><option key={a.id_almacen} value={a.id_almacen}>{a.nombre_almacen}</option>)}</select></div></div>
                   <div><label>Cantidad:</label><div className="input-box"><input name="cantidad" type="number" min="1" value={formData.cantidad} onChange={handleFormChange} required /></div></div>
                   <div><label>Exclusividad:</label><div className="input-box"><select name="id_carrera_exclusiva" value={formData.id_carrera_exclusiva||''} onChange={handleFormChange}><option value="">General</option>{carrerasDisp.map(c=><option key={c.id_carrera} value={c.id_carrera}>{c.nombre_carrera}</option>)}</select></div></div>
                 </div>
                 <label>Descripción:</label><div className="input-box"><textarea name="descripcion" value={formData.descripcion} onChange={handleFormChange} style={{minHeight:'40px'}} /></div>
                 <fieldset style={{marginTop:'15px',padding:'15px',border:'1px solid #ddd',borderRadius:'8px'}}>
                    <legend>Mantenimiento (Obligatorio Equipos/Herramientas)</legend>
                    <div className="modal-grid" style={{gap:'10px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'10px'}}><input type="checkbox" checked={mtoTiempoEnabled} onChange={e=>setMtoTiempoEnabled(e.target.checked)} /> <span>Tiempo (Días):</span><input name="plan_mto_dias" type="number" value={formData.plan_mto_dias} onChange={handleFormChange} disabled={!mtoTiempoEnabled} required={mtoTiempoEnabled} style={{width:'60px'}} /></div>
                      <div style={{display:'flex',alignItems:'center',gap:'10px'}}><input type="checkbox" checked={mtoUsoEnabled} onChange={e=>setMtoUsoEnabled(e.target.checked)} /> <span>Uso (Cant):</span><input name="plan_mto_usos" type="number" value={formData.plan_mto_usos} onChange={handleFormChange} disabled={!mtoUsoEnabled} required={mtoUsoEnabled} style={{width:'60px'}} /></div>
                    </div>
                    <div style={{display:'flex',gap:'15px',marginTop:'10px'}}>
                        <label><input type="radio" name="mto_es_interno" value="true" checked={formData.mto_es_interno} onChange={handleFormChange} /> Interno</label>
                        <label><input type="radio" name="mto_es_interno" value="false" checked={!formData.mto_es_interno} onChange={handleFormChange} /> Externo</label>
                    </div>
                 </fieldset>
                 <div className="modal-buttons"><button type="button" className="btn cancel" onClick={()=>setModalContent(null)}>Cancelar</button><button type="submit" className="btn confirm" disabled={isLoading}>Guardar</button></div>
               </form>
              </>
          )}

          {/* Modal DETALLE */}
          {modalContent==='detalle' && esGestor && selectedMaterial && (
             <>
               <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #eee',paddingBottom:'10px',marginBottom:'15px'}}>
                   <h3 style={{margin:0}}>{isEditing?'Editar Material':selectedMaterial.nombre}</h3>
                   {!isEditing && <button onClick={()=>setIsEditing(true)} style={{background:'none',border:'none',cursor:'pointer',fontSize:'1.2rem'}} title="Editar">✏️</button>}
               </div>
               {isEditing ? (
                   <form onSubmit={handleUpdateMaterial}>
                       <div className="modal-grid">
                           <div><label>Nombre:</label><div className="input-box"><input value={editFormData.nombre} disabled style={{background:'#eee'}} /></div></div>
                           <div><label>Marca:</label><div className="input-box"><input name="marca" value={editFormData.marca} onChange={handleEditChange} required /></div></div>
                           <div><label>Modelo:</label><div className="input-box"><input name="modelo" value={editFormData.modelo} onChange={handleEditChange} required /></div></div>
                           <div><label>Año:</label><div className="input-box"><input name="ano_modelo" type="number" value={editFormData.ano_modelo} onChange={handleEditChange} required /></div></div>
                       </div>
                       <label>Descripción:</label><div className="input-box"><textarea name="descripcion" value={editFormData.descripcion||''} onChange={handleEditChange} /></div>
                       <div className="modal-grid">
                           <div><label>Categoría:</label><div className="input-box"><select name="id_categoria" value={editFormData.id_categoria} onChange={handleEditChange}>{catalogos.categorias.map(c=><option key={c.id_categoria} value={c.id_categoria}>{c.nombre_categoria}</option>)}</select></div></div>
                           <div><label>Exclusividad:</label><div className="input-box"><select name="id_carrera_exclusiva" value={editFormData.id_carrera_exclusiva||''} onChange={handleEditChange}><option value="">General</option>{catalogos.carreras.map(c=><option key={c.id_carrera} value={c.id_carrera}>{c.nombre_carrera}</option>)}</select></div></div>
                       </div>
                       <fieldset style={{marginTop:'10px',padding:'10px',border:'1px solid #ddd',borderRadius:'8px'}}>
                           <legend>Mantenimiento</legend>
                           <div className="modal-grid">
                               <div style={{display:'flex', alignItems:'center', gap:'5px'}}><input type="checkbox" checked={mtoTiempoEnabled} onChange={e=>setMtoTiempoEnabled(e.target.checked)}/><label>Días:</label><input name="plan_mto_dias" type="number" value={editFormData.plan_mto_dias||''} onChange={handleEditChange} disabled={!mtoTiempoEnabled} required={mtoTiempoEnabled} /></div>
                               <div style={{display:'flex', alignItems:'center', gap:'5px'}}><input type="checkbox" checked={mtoUsoEnabled} onChange={e=>setMtoUsoEnabled(e.target.checked)}/><label>Usos:</label><input name="plan_mto_usos" type="number" value={editFormData.plan_mto_usos||''} onChange={handleEditChange} disabled={!mtoUsoEnabled} required={mtoUsoEnabled} /></div>
                           </div>
                           <div style={{marginTop:'5px'}}>
                               <label><input type="radio" name="mto_es_interno" value="true" checked={editFormData.mto_es_interno} onChange={handleEditChange} /> Interno</label>
                               <label style={{marginLeft:'10px'}}><input type="radio" name="mto_es_interno" value="false" checked={!editFormData.mto_es_interno} onChange={handleEditChange} /> Externo</label>
                           </div>
                       </fieldset>
                       <div className="modal-buttons" style={{marginTop:'20px'}}>
                           <button type="button" className="btn cancel" onClick={()=>setIsEditing(false)}>Cancelar</button>
                           <button type="submit" className="btn confirm">Guardar Cambios</button>
                       </div>
                   </form>
               ) : (
                   <>
                       <details open style={{marginBottom:'10px',border:'1px solid #eee',borderRadius:'8px',padding:'10px'}}>
                         <summary style={{fontWeight:'bold',color:'#003366'}}> Información</summary>
                         <div className="modal-grid" style={{marginTop:'10px'}}>
                           <div><p><strong>Marca:</strong> {selectedMaterial.marca}</p></div>
                           <div><p><strong>Modelo:</strong> {selectedMaterial.modelo}</p></div>
                           <div><p><strong>Año:</strong> {selectedMaterial.ano_modelo}</p></div>
                         </div>
                         <p><strong>Descripción:</strong> {selectedMaterial.descripcion||'N/A'}</p>
                       </details>
                       
                       <details open style={{marginBottom:'10px',border:'1px solid #eee',borderRadius:'8px',padding:'10px'}}>
                         <summary style={{fontWeight:'bold',color:'#003366'}}>
                             Unidades ({(detalleUnidades || []).length})
                         </summary>
                         <div className="historial" style={{maxHeight:'200px',overflowY:'auto',marginTop:'10px'}}>
                           <table className="id-table" style={{width:'100%',fontSize:'0.85rem'}}>
                             <thead><tr><th>Código</th><th>Estado</th><th>Acciones</th></tr></thead>
                             <tbody>
                               {detalleUnidades.map(u => (
                                 <tr key={u.id_unidad} style={{borderBottom:'1px solid #f0f0f0'}}>
                                   <td style={{padding:'5px'}}>
                                     <div style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
                                       <img 
                                         src={`http://localhost:4000/barcodes/${u.identificador_barcode}.png`} 
                                         alt={u.identificador_barcode} 
                                         style={{height:'50px', width:'auto', border:'1px solid #ddd', padding:'2px'}} 
                                         onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }} 
                                       />
                                       <span style={{fontSize:'0.75rem', color:'#666'}}>{u.identificador_barcode}</span>
                                     </div>
                                   </td>
                                   <td style={{padding:'5px'}}><span className={`badge ${getBadgeClass(u.nombre_estado)}`}>{u.nombre_estado}</span></td>
                                   <td style={{padding:'5px'}}>
                                       <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
                                            <Link to={`/gestion/mantenimiento/${u.id_unidad}`} onClick={()=>setModalContent(null)} style={{textDecoration:'underline', color:'#007bff'}}>Historial</Link>
                                            <button onClick={() => handleCopyBarcode(u.identificador_barcode)} style={{background:'none', border:'none', cursor:'pointer', fontSize:'1.2rem'}} title="Copiar Código">📋</button>
                                            {u.nombre_estado !== 'Baja' && u.nombre_estado !== 'En mantenimiento' && (
                                                 <button onClick={() => handleOpenMantenimiento(u)} style={{background:'none', border:'none', cursor:'pointer', fontSize:'1.2rem'}} title="Registrar Mantenimiento">🔧</button>
                                            )}
                                            {u.nombre_estado !== 'Baja' && (
                                                 <button onClick={()=>handleBajaUnidad(u.id_unidad, u.identificador_barcode)} style={{background:'none',border:'none',color:'red',cursor:'pointer',fontSize:'0.8rem'}}> BAJA</button>
                                            )}
                                       </div>
                                   </td>
                                 </tr>
                               ))}
                             </tbody>
                           </table>
                         </div>
                       </details>
                       <div className="modal-buttons"><button className="btn confirm" onClick={()=>setModalContent(null)}>Cerrar</button></div>
                   </>
               )}
            </>
         )}

         {/* --- MODAL MANTENIMIENTO --- */}
         {modalContent === 'mantenimiento' && esGestor && selectedUnidadMto && (
             <>
               <h3 style={{marginBottom:'20px', color:'#d39e00'}}>🔧 Registrar Mantenimiento</h3>
               <p style={{fontSize:'0.9rem', marginBottom:'15px'}}>Unidad: <strong>{selectedUnidadMto.identificador_barcode}</strong></p>
               <form onSubmit={handleSubmitMantenimiento}>
                   <div className="modal-grid">
                       <div>
                           <label>Tipo Mantenimiento:</label>
                           <div className="input-box">
                               <select value={mtoFormData.id_tipo_mantenimiento} onChange={(e) => setMtoFormData({...mtoFormData, id_tipo_mantenimiento: e.target.value})} required>
                                   <option value="1">Preventivo Ligero</option>
                                   <option value="2">Preventivo Exhaustivo</option>
                                   <option value="3">Correctivo</option>
                               </select>
                           </div>
                       </div>
                       
                       <div>
                           <label>Ubicación:</label>
                           <div style={{display:'flex', alignItems:'center', gap:'20px', padding:'10px 0'}}>
                               <label style={{cursor:'pointer', display:'flex', alignItems:'center', gap:'8px'}}>
                                   <input type="radio" name="es_externo" checked={!mtoFormData.es_externo} onChange={()=>setMtoFormData({...mtoFormData, es_externo: false})} /> 
                                   <span>Interno</span>
                               </label>
                               <label style={{cursor:'pointer', display:'flex', alignItems:'center', gap:'8px'}}>
                                   <input type="radio" name="es_externo" checked={mtoFormData.es_externo} onChange={()=>setMtoFormData({...mtoFormData, es_externo: true})} /> 
                                   <span>Externo</span>
                               </label>
                           </div>
                       </div>
                   </div>

                   <div className="modal-grid">
                       <div>
                           <label>Fecha Inicio:</label>
                           <div className="input-box">
                               <input type="datetime-local" value={mtoFormData.fecha_inicio} onChange={(e) => setMtoFormData({...mtoFormData, fecha_inicio: e.target.value})} required style={{width:'100%', boxSizing:'border-box'}} />
                           </div>
                       </div>
                       <div>
                           <label>Fecha Fin (Estimada):</label>
                           <div className="input-box">
                               <input type="datetime-local" value={mtoFormData.fecha_fin_estimada} onChange={(e) => setMtoFormData({...mtoFormData, fecha_fin_estimada: e.target.value})} style={{width:'100%', boxSizing:'border-box'}} />
                           </div>
                       </div>
                   </div>

                   <label>Descripción de Falla / Trabajo:</label>
                   <div className="input-box">
                       <textarea value={mtoFormData.descripcion} onChange={(e) => setMtoFormData({...mtoFormData, descripcion: e.target.value})} style={{minHeight:'80px', width:'100%', boxSizing:'border-box'}} placeholder="Describa el motivo del mantenimiento..." required />
                   </div>
                   
                   <div className="modal-buttons" style={{marginTop:'20px'}}>
                       <button type="button" className="btn cancel" onClick={() => setModalContent('detalle')}>Volver</button>
                       <button type="submit" className="btn confirm">Registrar y Bloquear</button>
                   </div>
               </form>
             </>
         )}

        </Modal>
      )}
    </div>
  );
};

export default InventarioPage;