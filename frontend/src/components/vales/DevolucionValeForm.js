import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';

const DevolucionValeForm = ({ vale, onValeDevuelto }) => {
  // Filtramos solo los materiales que fueron entregados (tienen barcode asignado)
  const itemsEntregados = vale.materiales.filter(m => m.identificador_barcode);

  const [itemsADevolver, setItemsADevolver] = useState(
    itemsEntregados.map(item => ({
      ...item,
      barcode_escaneado: '', 
      condicion: 'Disponible' // Valor por defecto
    }))
  );

  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, []);

  const handleItemChange = (index, field, value) => {
    const nuevosItems = [...itemsADevolver];
    nuevosItems[index][field] = value;
    setItemsADevolver(nuevosItems);
  };

  const handleKeyDown = (e, index) => {
      // UX: Al dar Enter, pasar al siguiente input si existe
      if (e.key === 'Enter') {
          e.preventDefault();
          const form = e.target.form;
          const indexCurrent = Array.prototype.indexOf.call(form, e.target);
          if (form.elements[indexCurrent + 1]) {
              form.elements[indexCurrent + 1].focus();
          }
      }
  };

  const handleSubmitDevolucion = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // 1. Validar que lo escaneado coincida con lo prestado (Seguridad básica)
      for (const item of itemsADevolver) {
        if (item.barcode_escaneado.trim() !== item.identificador_barcode) {
          throw new Error(`Error: El código escaneado (${item.barcode_escaneado}) no coincide con el prestado (${item.identificador_barcode}).`);
        }
      }

      // 2. Preparar payload
      const items_devueltos = itemsADevolver.map(item => ({
        barcode_escaneado: item.barcode_escaneado.trim(),
        condicion: item.condicion 
      }));

      // 3. Enviar al backend
      const { data } = await api.post(`/vales/${vale.id_vale}/devolver`, { items_devueltos });
      
      // Feedback visual
      if (data.estatus_devolucion === 'Con retraso') {
          alert(` Devolución registrada CON RETRASO de ${data.retraso}.`);
      } else {
          alert(" Devolución registrada A TIEMPO.");
      }

      onValeDevuelto(data.estatus_devolucion); 

    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Error al registrar la devolución');
      setIsLoading(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: '20px', borderLeft: '5px solid #28a745' }}>
      <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'15px'}}>
        <h4 style={{margin:0, color: '#28a745'}}> Recepción de Material (Devolución)</h4>
      </div>

      <p style={{fontSize:'0.9em', color:'#666', marginBottom:'15px'}}>
        Verifique el estado físico de cada ítem antes de confirmar.
      </p>

      <form onSubmit={handleSubmitDevolucion}>
        {itemsADevolver.map((item, index) => (
          <div key={index} style={{ marginBottom: '15px', padding:'10px', background:'#f0fff4', borderRadius:'8px', border:'1px solid #c3e6cb' }}>
            
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'5px'}}>
                <strong>{item.nombre}</strong>
                <span style={{fontSize:'0.8em', background:'#fff', padding:'2px 5px', borderRadius:'4px', border:'1px solid #ddd'}}>
                    Esperado: {item.identificador_barcode}
                </span>
            </div>
            
            {/* INPUT DE ESCANEO */}
            <div style={{marginBottom:'10px'}}>
              <label style={{fontSize:'0.85em', fontWeight:'bold'}}>Confirmar Código:</label>
              <div className="input-box" style={{margin:'5px 0'}}>
                <span className="icon"></span>
                <input
                  ref={index === 0 ? firstInputRef : null}
                  type="text"
                  placeholder="Escanee código..."
                  value={item.barcode_escaneado}
                  onChange={(e) => handleItemChange(index, 'barcode_escaneado', e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  required
                  disabled={isLoading}
                  style={{fontWeight:'bold', color:'#28a745'}}
                />
              </div>
            </div>

            {/* SELECTOR DE CONDICIÓN (RQNF11.1) */}
            <div>
              <label style={{fontSize:'0.85em', fontWeight:'bold'}}>Estado Físico:</label>
              <select
                  value={item.condicion}
                  onChange={(e) => handleItemChange(index, 'condicion', e.target.value)}
                  disabled={isLoading}
                  style={{
                      width:'100%', 
                      padding:'8px', 
                      borderRadius:'5px', 
                      border: item.condicion === 'En mantenimiento' ? '2px solid red' : '1px solid #ccc',
                      background: item.condicion === 'En mantenimiento' ? '#fff5f5' : 'white',
                      color: item.condicion === 'En mantenimiento' ? 'red' : 'black',
                      marginTop:'5px'
                  }}
                >
                  <option value="Disponible"> Buen Estado (Regresa a Stock)</option>
                  <option value="En mantenimiento"> Dañado / Falla (Enviar a Mantenimiento)</option>
                </select>
            </div>
          </div>
        ))}

        {error && <div style={{ color: 'white', background:'#dc3545', padding:'10px', borderRadius:'5px', marginBottom:'10px' }}>{error}</div>}

        <button type="submit" className="btn confirm" disabled={isLoading} style={{background:'#28a745', width:'100%'}}>
          {isLoading ? 'Procesando...' : 'Confirmar Recepción'}
        </button>
      </form>
    </div>
  );
};

export default DevolucionValeForm;