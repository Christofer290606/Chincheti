import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

const FormularioIncidenciaPage = () => {
  const navigate = useNavigate();

  // Estados de Catálogos
  const [tiposIncidencia, setTiposIncidencia] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [unidades, setUnidades] = useState([]);

  // Estado del Formulario
  const [formData, setFormData] = useState({
    id_tipo_incidencia: '',
    id_usuario_afectado: '',
    id_unidad_afectada: '',
    descripcion: ''
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Cargar datos iniciales
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resTipos, resUsers, resUnits] = await Promise.all([
            api.get('/incidencias/tipos'),
            api.get('/usuarios'),
            api.get('/incidencias/unidades-select')
        ]);

        setTiposIncidencia(resTipos.data.tipos_incidencia || []);
        // Filtramos solo usuarios activos (RQNF28.1)
        const activeUsers = (resUsers.data.usuarios || []).filter(u => u.estatus === 'Activo');
        setUsuarios(activeUsers);
        setUnidades(resUnits.data || []);

      } catch (err) {
        console.error(err);
        setError('Error: No se pudieron cargar los listados necesarios (tipos, usuarios o materiales).');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // VALIDACIONES FRONTEND (RQNF28.1)
    if (!formData.id_tipo_incidencia) return setError("Seleccione un Tipo de Incidencia.");
    if (!formData.id_unidad_afectada) return setError("Seleccione el Material afectado.");
    if (!formData.id_usuario_afectado) return setError("Seleccione al Usuario responsable.");
    
    if (formData.descripcion.length < 20) {
        return setError(`La descripción es muy corta (${formData.descripcion.length}/20 caracteres). Mínimo 20.`);
    }
    if (formData.descripcion.length > 500) {
        return setError("La descripción excede los 500 caracteres.");
    }

    setIsLoading(true);

    try {
      await api.post('/incidencias', formData);
      setSuccess('Incidencia registrada correctamente.');
      setTimeout(() => navigate('/incidencias'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar.');
      setIsLoading(false);
    }
  };

  if (isLoading && tiposIncidencia.length === 0) return <div className="content-section active"><p>Cargando formulario...</p></div>;

  return (
    <div className="content-section active">
      <Link to="/incidencias" className="volver">{"< Volver"}</Link>
      <h2 style={{ textAlign: 'center', margin: '20px 0', color:'#003366' }}>Registrar Incidencia</h2>
      
      <div className="card">
        <form onSubmit={handleSubmit}>
          
          {/* CAMPO: TIPO DE INCIDENCIA (Obligatorio) */}
          <label>Tipo de Incidencia <span style={{color:'red'}}>*</span>:</label>
          <div className="input-box">
            <select name="id_tipo_incidencia" value={formData.id_tipo_incidencia} onChange={handleChange} required>
              <option value="">-- Seleccione Tipo --</option>
              {tiposIncidencia.map(tipo => (
                <option key={tipo.id_tipo_incidencia} value={tipo.id_tipo_incidencia}>
                  {tipo.nombre_tipo}
                </option>
              ))}
            </select>
          </div>

          {/* CAMPO: MATERIAL AFECTADO (Obligatorio) */}
          <label>Material / Unidad Afectada <span style={{color:'red'}}>*</span>:</label>
          <div className="input-box">
            <select name="id_unidad_afectada" value={formData.id_unidad_afectada} onChange={handleChange} required>
              <option value="">-- Seleccione Material (ID / Nombre) --</option>
              {unidades.map(u => (
                <option key={u.id_unidad} value={u.id_unidad}>
                  [{u.identificador_barcode}] {u.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* CAMPO: USUARIO RESPONSABLE (Obligatorio) */}
          <label>Usuario Responsable <span style={{color:'red'}}>*</span>:</label>
          <div className="input-box">
            <select name="id_usuario_afectado" value={formData.id_usuario_afectado} onChange={handleChange} required>
              <option value="">-- Seleccione Usuario --</option>
              {usuarios.map(user => (
                <option key={user.id_usuario} value={user.id_usuario}>
                  {user.nombre_completo} ({user.rol})
                </option>
              ))}
            </select>
          </div>
          
          {/* CAMPO: DESCRIPCIÓN (20-500 caracteres) */}
          <label>Descripción Detallada <span style={{color:'red'}}>*</span>:</label>
          <textarea 
            name="descripcion" 
            value={formData.descripcion} 
            onChange={handleChange} 
            required 
            placeholder="Describa el incidente (Mínimo 20 caracteres)..."
            style={{ width: '100%', minHeight: '100px', border: '1px solid #ccc', borderRadius: '4px', padding: '8px' }}
          />
          <div style={{textAlign:'right', fontSize:'0.8rem', color: formData.descripcion.length > 0 && (formData.descripcion.length < 20 || formData.descripcion.length > 500) ? 'red' : '#666'}}>
             Caracteres: {formData.descripcion.length} / 500
          </div>

          {/* CAMPO: FECHA (Solo lectura, generado por sistema) */}
          <label style={{marginTop:'15px', display:'block', color:'#666'}}>Fecha de Registro:</label>
          <div className="input-box" style={{background:'#f0f0f0'}}>
            <input type="text" value={new Date().toLocaleString()} disabled style={{background:'transparent', border:'none', color:'#555'}} />
            <small style={{display:'block', marginTop:'5px', color:'#777'}}>* Fecha generada automáticamente por el sistema.</small>
          </div>

          {error && <p style={{ color: 'red', textAlign: 'center', marginTop: '10px', background:'#ffe6e6', padding:'10px', borderRadius:'5px' }}>{error}</p>}
          {success && <p style={{ color: 'green', textAlign: 'center', marginTop: '10px', background:'#e6fffa', padding:'10px', borderRadius:'5px' }}>{success}</p>}
          
          <div className="form-buttons" style={{marginTop:'25px'}}>
            <button type="button" onClick={() => navigate('/incidencias')} className="btn cancel">Cancelar</button>
            <button type="submit" className="btn confirm" disabled={isLoading}>Registrar Incidencia</button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default FormularioIncidenciaPage;