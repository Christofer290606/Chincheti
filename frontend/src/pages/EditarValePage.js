import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

const EditarValePage = () => {
  const { id } = useParams(); // ID del vale
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Estado del formulario
  const [formData, setFormData] = useState({
    fecha_recoleccion: '',
    fecha_devolucion_esperada: '',
    espacio_uso: '',
    motivo_solicitud: '',
    // Nota: Para simplificar, en esta versión de edición no permitimos cambiar los materiales,
    // solo los datos logísticos. Si se requiere cambiar materiales, es mejor cancelar y crear uno nuevo.
  });

  useEffect(() => {
    const fetchVale = async () => {
      try {
        const { data } = await api.get(`/vales/${id}`);
        
        // Formatear fechas para el input datetime-local (YYYY-MM-DDTHH:MM)
        const formatFecha = (fechaStr) => {
          return new Date(fechaStr).toISOString().slice(0, 16);
        };

        setFormData({
          fecha_recoleccion: formatFecha(data.fecha_recoleccion),
          fecha_devolucion_esperada: formatFecha(data.fecha_devolucion_esperada),
          espacio_uso: data.espacio_uso,
          motivo_solicitud: data.motivo_solicitud || ''
        });
        setIsLoading(false);
      } catch (err) {
        setError('Error al cargar el vale. Puede que no exista o no tengas permiso.');
        setIsLoading(false);
      }
    };
    fetchVale();
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await api.put(`/vales/${id}`, formData);
      alert('Vale actualizado correctamente');
      navigate('/vales');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al actualizar');
      setIsLoading(false);
    }
  };

  if (isLoading) return <div className="content-section active"><p>Cargando...</p></div>;

  return (
    <div className="content-section active">
      <Link to="/vales" className="volver">{"< Cancelar y Volver"}</Link>
      
      <h2 style={{ textAlign: 'center', margin: '20px 0' }}>
        Editar Solicitud #{id}
      </h2>

      <div className="card">
        {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}
        
        <form onSubmit={handleSubmit}>
          <label>Fecha Recolección:</label>
          <input type="datetime-local" name="fecha_recoleccion" value={formData.fecha_recoleccion} onChange={handleChange} required />
          
          <label>Fecha Devolución:</label>
          <input type="datetime-local" name="fecha_devolucion_esperada" value={formData.fecha_devolucion_esperada} onChange={handleChange} required />

          <label>Espacio de Uso:</label>
          <input type="text" name="espacio_uso" value={formData.espacio_uso} onChange={handleChange} required />

          <label>Motivo:</label>
          <textarea 
            name="motivo_solicitud" 
            value={formData.motivo_solicitud} 
            onChange={handleChange}
            style={{width: '100%', minHeight: '60px', border: '1px solid #ddd', borderRadius: '8px', padding: '10px'}}
          />

          <div className="form-buttons">
            <button type="submit" className="btn confirm" disabled={isLoading}>
              {isLoading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditarValePage;