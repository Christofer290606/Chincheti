import React, { useState } from 'react';
import api from '../../services/api';

/**
 * Este componente muestra los botones para que un Maestro o Almacenista
 * apruebe o rechace una solicitud de vale.
 */
const GestionValeForm = ({ vale, onValeGestionado }) => {
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGestion = async (accion) => {
    // El motivo es obligatorio si se rechaza
    if (accion === 'Rechazar' && !motivoRechazo) {
      setError('Debe escribir un motivo para rechazar el vale.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data } = await api.put(`/vales/${vale.id_vale}/gestionar`, {
        accion: accion,
        motivo_rechazo: motivoRechazo
      });
      
      onValeGestionado(data.nuevo_estado); 

    } catch (err) {
      setError(err.response?.data?.error || `Error al ${accion.toLowerCase()} el vale`);
      setIsLoading(false);
    }
  };

  // Usamos la clase .card del index.css
  return (
    <div className="card" style={{ marginTop: '20px' }}>
      <h4>Acciones de Gestión</h4>
      <p>Este vale está pendiente de aprobación.</p>
      
      <div>
        <label>Motivo de Rechazo (si aplica):</label>
        <textarea
          value={motivoRechazo}
          onChange={(e) => setMotivoRechazo(e.target.value)}
          style={{ width: '100%', minHeight: '60px', border: '1px solid #ddd', borderRadius: '8px', padding: '10px' }}
          disabled={isLoading}
        />
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* Usamos las clases .form-buttons, .btn.aprobar, .btn.rechazar */}
      <div className="form-buttons">
        <button 
          type="button"
          onClick={() => handleGestion('Rechazar')}
          className="btn rechazar" // <-- ESTILO ACTUALIZADO
          disabled={isLoading}
        >
          Rechazar Vale
        </button>
        <button
          type="button"
          onClick={() => handleGestion('Aprobar')}
          className="btn aprobar" // <-- ESTILO ACTUALIZADO
          disabled={isLoading}
        >
          Aprobar Vale
        </button>
      </div>
    </div>
  );
};

export default GestionValeForm;