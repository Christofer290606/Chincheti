import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Modal from '../components/Modal/Modal';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';

const GestionUsuariosPage = () => {
  const { usuario } = useAuth();
  
  const [usuarios, setUsuarios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [catalogos, setCatalogos] = useState({ roles: [], carreras: [], almacenes: [] });
  const [busqueda, setBusqueda] = useState('');

  // Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Datos Excel
  const [datosExcel, setDatosExcel] = useState([]);
  const fileInputRef = useRef(null);

  const [registroEscolar, setRegistroEscolar] = useState('');
  const [formData, setFormData] = useState({
    id_usuario: null, nombre_completo: '', correo: '', id_rol: '', password: '', 
    id_carrera: '', semestre: '', id_almacen: ''
  });

  // --- PERMISOS ---
  const soyAdmin = usuario.rol === 'administrador';
  const soyCoord = usuario.rol === 'coordinador';
  const puedeGestionar = soyAdmin || soyCoord;
  const puedeEliminar = soyAdmin;

  // --- CARGA DE DATOS ---
  const fetchUsuarios = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/usuarios');
      setUsuarios(Array.isArray(data) ? data : (data.usuarios || []));
      setError(null);
    } catch (err) { console.error(err); setError('Error al cargar usuarios'); } 
    finally { setIsLoading(false); }
  }, []);

  const fetchCatalogos = useCallback(async () => {
    try {
        const { data } = await api.get('/usuarios/datos-registro');
        setCatalogos(data);
    } catch (error) { console.error("Error cargando catálogos", error); }
  }, []);

  useEffect(() => { fetchUsuarios(); fetchCatalogos(); }, [fetchUsuarios, fetchCatalogos]);

  // --- HELPERS DE FILTRADO ---
  const getRolesPermitidos = () => {
    if (soyAdmin) return catalogos.roles;
    if (soyCoord) return catalogos.roles.filter(r => ['maestro', 'almacenista', 'alumno'].includes(r.nombre_rol.toLowerCase()));
    return [];
  };

  const getAlmacenesPermitidos = () => {
    if (soyAdmin) return catalogos.almacenes; 
    if (soyCoord) {
        return catalogos.almacenes.filter(a => parseInt(a.id_carrera) === parseInt(usuario.id_carrera));
    }
    return [];
  };

  const getNombreCarreraCoord = () => {
      if (usuario.nombre_carrera) return usuario.nombre_carrera;
      const carrera = catalogos.carreras.find(c => c.id_carrera == usuario.id_carrera);
      return carrera ? carrera.nombre_carrera : 'Tu Carrera Asignada';
  };

  const mostrarSelectorCarrera = () => soyAdmin;

  // --- LÓGICA EXCEL ---
  const handleImportarClick = () => fileInputRef.current.click(); 

  const mapRolToId = (rolTexto) => {
    if (!rolTexto) return 5; 
    const rol = rolTexto.toString().toLowerCase();
    if (rol.includes('maestro')) return 4;
    if (rol.includes('almacen')) return 3;
    if (rol.includes('coord')) return 2;
    return 5; 
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      
      const procesados = data.map((row, index) => {
        let idCarreraInicial = '';
        if (soyCoord) idCarreraInicial = usuario.id_carrera;
        else if (row.Carrera) {
            const c = catalogos.carreras.find(cat => cat.nombre_carrera === row.Carrera);
            if (c) idCarreraInicial = c.id_carrera;
        }

        return {
            id_temp: index, 
            nombre: row.Nombre || '',
            correo: row.Correo || '',
            id_rol: mapRolToId(row.Rol),
            semestre: row.Semestre || '',
            registro: row.Registro || '',
            id_carrera: idCarreraInicial,
            id_almacen: '' 
        };
      });
      setDatosExcel(procesados);
      setIsPreviewOpen(true); 
      e.target.value = null;
    };
    reader.readAsBinaryString(file);
  };

  const handlePreviewChange = (index, field, value) => {
      const nuevosDatos = [...datosExcel];
      nuevosDatos[index][field] = value;
      setDatosExcel(nuevosDatos);
  };

  // --- NUEVA FUNCIÓN: ELIMINAR FILA DE PREVISUALIZACIÓN ---
  const handleRemoveRow = (index) => {
    if (!window.confirm("¿Quitar este usuario de la lista de carga?")) return;
    const nuevosDatos = datosExcel.filter((_, idx) => idx !== index);
    setDatosExcel(nuevosDatos);
    // Si borramos todos, cerramos el modal
    if (nuevosDatos.length === 0) setIsPreviewOpen(false);
  };

  const confirmarCargaMasiva = async () => {
    if (datosExcel.length === 0) return;
    try {
      setIsLoading(true);
      const payload = datosExcel.map(usr => ({
          ...usr,
          password: 'Ceti' + Math.floor(1000 + Math.random() * 9000)
      }));
      await api.post('/usuarios/masivo', { usuarios: payload });
      alert("Carga masiva completada exitosamente.");
      setIsPreviewOpen(false);
      fetchUsuarios();
    } catch (err) {
      alert('Error en carga masiva: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsLoading(false);
    }
  };

  // --- CRUD INDIVIDUAL ---
  const handleRegistroChange = (e) => {
    const valor = e.target.value.replace(/\D/g, '').slice(0, 8);
    setRegistroEscolar(valor);
    setFormData(prev => ({ ...prev, correo: valor.length > 0 ? `a${valor}@ceti.mx` : '' }));
  };

  const handleOpenCrear = () => {
      setIsEditing(false); setRegistroEscolar('');
      setFormData({ 
          id_usuario: null, nombre_completo: '', correo: '', id_rol: '', password: '', 
          id_carrera: soyCoord ? usuario.id_carrera : '', semestre: '', id_almacen: '' 
      });
      setIsModalOpen(true);
  };

  const handleEdit = (user) => {
      setIsEditing(true); setRegistroEscolar(''); 
      let carreraId = user.id_carrera_trabajador || (catalogos.carreras.find(c => c.nombre_carrera === (user.carrera_alumno || user.carrera_trabajador))?.id_carrera) || '';
      setFormData({
          id_usuario: user.id_usuario, nombre_completo: user.nombre_completo, correo: user.correo,
          id_rol: catalogos.roles.find(r => r.nombre_rol === user.rol)?.id_rol || '', password: '',
          id_carrera: carreraId, semestre: user.semestre || '', id_almacen: user.id_almacen || ''
      });
      setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
      if (window.confirm("¿Eliminar usuario?")) {
          try { await api.delete(`/usuarios/${id}`); alert("Eliminado."); fetchUsuarios(); } 
          catch (e) { alert("No se pudo eliminar."); }
      }
  };

  const handleFormChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const rolObj = catalogos.roles.find(r => String(r.id_rol) === String(formData.id_rol));
    const nombreRolSubmit = rolObj ? rolObj.nombre_rol.toLowerCase() : '';
    if (nombreRolSubmit === 'alumno' && !isEditing && registroEscolar.length !== 8) return alert("Registro debe tener 8 dígitos.");
    
    setIsLoading(true);
    try {
      if (isEditing) {
          const payload = { ...formData };
          if (!payload.password || payload.password.length < 8) delete payload.password;
          await api.put(`/usuarios/${formData.id_usuario}`, payload);
          alert("Usuario actualizado.");
      } else {
          const payload = {
              nombre: formData.nombre_completo, correo: formData.correo,
              password: 'Ceti' + Math.floor(1000 + Math.random() * 9000),
              id_rol: formData.id_rol, id_carrera: formData.id_carrera || null,
              semestre: formData.semestre || null, id_almacen: formData.id_almacen || null,
              registro: (nombreRolSubmit === 'alumno') ? registroEscolar : null
          };
          await api.post('/usuarios', payload);
          alert(`Usuario creado.`);
      }
      setIsModalOpen(false); fetchUsuarios(); 
    } catch (err) { alert(err.response?.data?.error || 'Error'); } finally { setIsLoading(false); }
  };

  // --- PDF ---
  const generarConstancia = (usuario) => {
    if (usuario.estatus === 'Bloqueado') return alert(`Usuario bloqueado.`);
    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString();
    const registroExtraido = usuario.registro || (usuario.correo.startsWith('a') ? usuario.correo.split('@')[0].replace('a', '') : 'S/R');

    doc.setFontSize(18); doc.text("CENTRO DE ENSEÑANZA TÉCNICA INDUSTRIAL", 105, 20, null, null, "center");
    doc.setFontSize(14); doc.text("Plantel Colomos - Almacén General", 105, 30, null, null, "center");
    doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.text("CONSTANCIA DE NO ADEUDO", 105, 50, null, null, "center");
    doc.setFontSize(12); doc.setFont(undefined, 'normal');
    doc.text(`Por medio de la presente se hace constar que el alumno:\n\nNombre: ${usuario.nombre_completo.toUpperCase()}\nRegistro: ${registroExtraido}\nCarrera: ${usuario.carrera_alumno || 'N/A'}\n\nNO PRESENTA ADEUDOS de material en el sistema de almacén al día ${fecha}.`, 20, 70);
    doc.save(`Constancia_${registroExtraido}.pdf`);
  };

  const usuariosFiltrados = usuarios.filter(u => {
      const termino = busqueda.toLowerCase();
      const n = (u.nombre_completo || '').toLowerCase();
      const c = (u.correo || '').toLowerCase();
      const r = (u.registro || '').toString();
      return n.includes(termino) || c.includes(termino) || r.includes(termino);
  });

  const nombreRolForm = catalogos.roles.find(r => String(r.id_rol) === String(formData.id_rol))?.nombre_rol.toLowerCase() || '';

  // ESTILOS COMUNES PARA INPUTS DE TABLA (Mejora visual)
  const inputStyle = { 
    width: '100%', 
    padding: '6px', 
    boxSizing: 'border-box', 
    border: '1px solid #ccc', 
    borderRadius: '4px' 
  };

  return (
    <div className="content-section active">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
        <h2>Gestión de Usuarios</h2>
        {puedeGestionar && (
            <div className="actions" style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleOpenCrear} className="add">Nuevo</button>
                <button onClick={handleImportarClick} style={{backgroundColor: '#28a745'}}>Cargar Excel</button>
                <input type="file" accept=".xlsx, .xls" ref={fileInputRef} style={{display: 'none'}} onChange={handleFileUpload}/>
            </div>
        )}
      </div>

      <div style={{marginBottom: '15px'}}>
          <input type="text" placeholder="Buscar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc' }} />
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div className="table-responsive">
        <table className="data-table">
            <thead><tr><th>Registro</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Detalles</th><th>Estatus</th><th>Acciones</th></tr></thead>
            <tbody>
            {usuariosFiltrados.map((user) => (
                <tr key={user.id_usuario}>
                <td style={{fontWeight:'bold'}}>{user.registro || user.id_usuario}</td>
                <td>{user.nombre_completo}</td>
                <td>{user.correo}</td>
                <td><span className="badge" style={{background:'#eee', color:'#333'}}>{user.rol}</span></td>
                <td style={{fontSize:'0.85rem'}}>{user.carrera_alumno || user.carrera_trabajador} {user.nombre_almacen ? `| ${user.nombre_almacen}` : ''}</td>
                <td><span className={`badge ${user.estatus === 'Activo' ? 'disponible' : 'baja'}`}>{user.estatus}</span></td>
                <td>
                    <div style={{display:'flex', gap:'5px'}}>
                        {puedeGestionar && <button onClick={() => handleEdit(user)} className="btn-item" style={{background:'#ffc107', color:'black'}}>Editar</button>}
                        {puedeEliminar && <button onClick={() => handleDelete(user.id_usuario)} className="btn-item" style={{background:'#dc3545', color:'white'}}>Eliminar</button>}
                        {['administrador', 'coordinador', 'almacenista'].includes(usuario?.rol) && (
                            <Link to={`/usuarios/${user.id_usuario}/historial`} className="btn-item" style={{ background: '#6f42c1', color: 'white', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Historial</Link>
                        )}
                        {(user.rol || '').toLowerCase() === 'alumno' && <button onClick={() => generarConstancia(user)} className="btn-item" style={{background:'#17a2b8', color:'white'}}>Constancia</button>}
                    </div>
                </td>
                </tr>
            ))}
            </tbody>
        </table>
      </div>

      {/* --- MODAL CREAR / EDITAR --- */}
      {isModalOpen && (
        <Modal onClose={() => setIsModalOpen(false)}>
          <div className="modal-panel" style={{minWidth:'400px'}}>
            <h3>{isEditing ? 'Editar' : 'Nuevo Usuario'}</h3>
            <form onSubmit={handleFormSubmit} className="modal-grid" style={{display:'flex', flexDirection:'column', gap:'15px'}}>
              {!isEditing ? (
                  <>
                    <div><label>Nombre:</label><input name="nombre_completo" value={formData.nombre_completo} onChange={handleFormChange} required /></div>
                    <div>
                        <label>Rol:</label>
                        <select name="id_rol" value={formData.id_rol} onChange={handleFormChange} required>
                        <option value="">-- Seleccione Rol --</option>
                        {getRolesPermitidos().map(r => <option key={r.id_rol} value={r.id_rol}>{r.nombre_rol}</option>)}
                        </select>
                    </div>
                    {nombreRolForm === 'alumno' ? (
                        <div style={{background: '#e3f2fd', padding:'10px', borderRadius:'5px'}}>
                            <label>Registro:</label><input type="text" value={registroEscolar} onChange={handleRegistroChange} maxLength="8" required />
                            <small>Correo: {formData.correo}</small>
                        </div>
                    ) : (
                        <div><label>Correo:</label><input name="correo" type="email" value={formData.correo} onChange={handleFormChange} required /></div>
                    )}
                    {(nombreRolForm === 'alumno' || nombreRolForm === 'coordinador' || nombreRolForm === 'maestro' || nombreRolForm === 'almacenista') && (
                        <div style={{background:'#f9f9f9', padding:'10px', borderRadius:'5px'}}>
                            {nombreRolForm === 'almacenista' && (
                                <>
                                    <label>Almacén:</label>
                                    <select name="id_almacen" value={formData.id_almacen} onChange={handleFormChange} required>
                                        <option value="">-- Seleccione --</option>
                                        {getAlmacenesPermitidos().map(a => <option key={a.id_almacen} value={a.id_almacen}>{a.nombre_almacen}</option>)}
                                    </select>
                                </>
                            )}
                            <label>Carrera:</label>
                            {mostrarSelectorCarrera() ? (
                                <select name="id_carrera" value={formData.id_carrera} onChange={handleFormChange} required={nombreRolForm !== 'maestro'}>
                                    <option value="">-- Seleccione --</option>
                                    {catalogos.carreras.map(c => <option key={c.id_carrera} value={c.id_carrera}>{c.nombre_carrera}</option>)}
                                </select>
                            ) : (
                                <div style={{background:'#e9ecef', padding:'10px', borderRadius:'5px', color:'#495057', fontWeight:'500'}}>
                                    {getNombreCarreraCoord()}
                                </div>
                            )}
                            {nombreRolForm === 'alumno' && (
                                <><label>Semestre:</label><select name="semestre" value={formData.semestre} onChange={handleFormChange} required>{[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>{s}º</option>)}</select></>
                            )}
                        </div>
                    )}
                  </>
              ) : (
                  <div><label>Nueva Pass:</label><input type="password" name="password" onChange={handleFormChange} minLength="8" /></div>
              )}
              <div className="modal-buttons"><button type="button" className="btn cancel" onClick={() => setIsModalOpen(false)}>Cancelar</button><button type="submit" className="btn confirm">Guardar</button></div>
            </form>
          </div>
        </Modal>
      )}

      {/* --- MODAL PREVIEW EDITABLE --- */}
      {isPreviewOpen && (
        <Modal onClose={() => setIsPreviewOpen(false)}>
          <div className="modal-panel" style={{width: '95%', maxWidth:'1300px'}}>
            <h3>Previsualización y Corrección</h3>
            <p style={{fontSize:'0.9rem', color:'#666'}}>Revise, corrija o elimine registros antes de confirmar.</p>
            <div className="historial" style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table className="data-table" style={{fontSize:'0.85rem', width:'100%'}}>
                <thead>
                    <tr>
                        <th style={{width:'20%'}}>Nombre</th>
                        <th style={{width:'15%'}}>Correo / Registro</th>
                        <th style={{width:'12%'}}>Rol</th>
                        <th style={{width:'15%'}}>Carrera</th>
                        <th style={{width:'15%'}}>Almacén</th>
                        <th style={{width:'8%'}}>Sem.</th>
                        <th style={{width:'5%'}}>X</th>
                    </tr>
                </thead>
                <tbody>
                  {datosExcel.map((row, idx) => {
                      const rolObj = catalogos.roles.find(r => r.id_rol === row.id_rol);
                      const esAlmacenista = rolObj?.nombre_rol.toLowerCase() === 'almacenista';
                      const esAlumno = rolObj?.nombre_rol.toLowerCase() === 'alumno';

                      // Validamos visualmente si falta algo crítico
                      const rowError = !row.nombre || !row.correo || (esAlmacenista && !row.id_almacen);

                      return (
                        <tr key={idx} style={{background: rowError ? '#fff0f0' : 'white'}}>
                            <td>
                                <input 
                                    value={row.nombre} 
                                    onChange={(e) => handlePreviewChange(idx, 'nombre', e.target.value)} 
                                    style={{...inputStyle, minWidth:'180px'}} 
                                />
                            </td>
                            <td>
                                {esAlumno ? (
                                    <input 
                                        placeholder="Registro" 
                                        value={row.registro} 
                                        onChange={(e) => handlePreviewChange(idx, 'registro', e.target.value)} 
                                        style={{...inputStyle, minWidth:'100px'}} 
                                    />
                                ) : (
                                    <input 
                                        value={row.correo} 
                                        onChange={(e) => handlePreviewChange(idx, 'correo', e.target.value)} 
                                        style={{...inputStyle, minWidth:'180px'}} 
                                    />
                                )}
                            </td>
                            <td>
                                <select 
                                    value={row.id_rol} 
                                    onChange={(e) => handlePreviewChange(idx, 'id_rol', parseInt(e.target.value))} 
                                    style={{...inputStyle, minWidth:'120px'}}
                                >
                                    {getRolesPermitidos().map(r => <option key={r.id_rol} value={r.id_rol}>{r.nombre_rol}</option>)}
                                </select>
                            </td>
                            <td>
                                {soyAdmin ? (
                                    <select 
                                        value={row.id_carrera} 
                                        onChange={(e) => handlePreviewChange(idx, 'id_carrera', e.target.value)} 
                                        style={{...inputStyle, minWidth:'150px'}}
                                    >
                                        <option value="">-- General --</option>
                                        {catalogos.carreras.map(c => <option key={c.id_carrera} value={c.id_carrera}>{c.nombre_carrera}</option>)}
                                    </select>
                                ) : (
                                    <span style={{color:'#666', fontSize:'0.9em', display:'block', padding:'5px'}}>
                                        {getNombreCarreraCoord()}
                                    </span>
                                )}
                            </td>
                            <td>
                                {esAlmacenista ? (
                                    <select 
                                        value={row.id_almacen} 
                                        onChange={(e) => handlePreviewChange(idx, 'id_almacen', e.target.value)} 
                                        style={{...inputStyle, minWidth:'150px', border: !row.id_almacen ? '2px solid red' : '1px solid #ccc'}}
                                    >
                                        <option value="">-- Asignar --</option>
                                        {getAlmacenesPermitidos().map(a => <option key={a.id_almacen} value={a.id_almacen}>{a.nombre_almacen}</option>)}
                                    </select>
                                ) : '-'}
                            </td>
                            <td>
                                {esAlumno ? (
                                    <input 
                                        type="number" 
                                        value={row.semestre} 
                                        onChange={(e) => handlePreviewChange(idx, 'semestre', e.target.value)} 
                                        style={{...inputStyle, width:'60px'}} 
                                    />
                                ) : '-'}
                            </td>
                            <td style={{textAlign:'center'}}>
                                <button 
                                    type="button" 
                                    onClick={() => handleRemoveRow(idx)} 
                                    style={{background:'#dc3545', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', padding:'5px 10px', fontWeight:'bold'}}
                                >
                                    X
                                </button>
                            </td>
                        </tr>
                      );
                  })}
                </tbody>
              </table>
            </div>
            <div className="modal-buttons">
              <button type="button" className="btn cancel" onClick={() => setIsPreviewOpen(false)}>Cancelar</button>
              <button type="button" className="btn confirm" onClick={confirmarCargaMasiva} disabled={isLoading}>
                {isLoading ? 'Procesando...' : `Confirmar (${datosExcel.length})`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default GestionUsuariosPage;