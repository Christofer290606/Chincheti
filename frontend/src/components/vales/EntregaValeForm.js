import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';

const EntregaValeForm = ({ vale, onValeEntregado }) => {
  // 1. Desglosamos los materiales solicitados en filas individuales para escaneo unitario
  const generarItemsParaEscanear = () => {
    let itemsDesglosados = [];
    
    vale.materiales.forEach(mat => {
        // Creamos tantas filas como cantidad solicitada (para obligar escaneo 1 a 1)
        // Opcional: Podrías poner una lógica aquí: si es "consumible", solo 1 fila con cantidad editable.
        // Asumimos por RQF10 que se validan códigos de barras únicos.
        for (let i = 0; i < mat.cantidad_solicitada; i++) {
            itemsDesglosados.push({
                id_material_base: mat.id_material_base,
                nombre: mat.nombre,
                // Índice visual (ej. Multímetro 1/3)
                indice: `${i + 1}/${mat.cantidad_solicitada}`,
                barcode_escaneado: '',
                cantidad_entregada: 1 // Fijo en 1 para trazabilidad
            });
        }
    });
    return itemsDesglosados;
  };

  const [itemsPorEntregar, setItemsPorEntregar] = useState(generarItemsParaEscanear());
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Referencias para auto-foco secuencial
  const inputRefs = useRef([]);

  // Auto-foco al primer input al cargar
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleBarcodeChange = (index, valor) => {
    const nuevosItems = [...itemsPorEntregar];
    nuevosItems[index].barcode_escaneado = valor;
    setItemsPorEntregar(nuevosItems);

    // UX: Si el código parece completo (ej. longitud estándar o Enter), pasar al siguiente input
    // Aquí simulamos un salto simple si el usuario da Enter (manejado en onKeyDown)
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Si hay siguiente input, enfocarlo
      if (inputRefs.current[index + 1]) {
        inputRefs.current[index + 1].focus();
      }
    }
  };

  const handleSubmitEntrega = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validación: No códigos vacíos
    if (itemsPorEntregar.some(item => !item.barcode_escaneado.trim())) {
      setError(' Faltan códigos por escanear. Todos los ítems son obligatorios.');
      setIsLoading(false);
      return;
    }

    // Validación: No códigos duplicados en la misma entrega
    const codigos = itemsPorEntregar.map(i => i.barcode_escaneado.trim());
    const unicos = new Set(codigos);
    if (codigos.length !== unicos.size) {
        setError(' Error: Has escaneado el mismo código de barras dos veces.');
        setIsLoading(false);
        return;
    }

    // Preparamos payload (agrupamos por si el backend espera formato específico, 
    // pero tu backend actual procesa array de objetos {barcode, cantidad})
    const items_entregados = itemsPorEntregar.map(item => ({
       barcode_escaneado: item.barcode_escaneado.trim(),
       cantidad_entregada: 1 
    }));

    try {
      await api.post(`/vales/${vale.id_vale}/entregar`, { items_entregados });
      onValeEntregado();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Error al registrar la entrega');
      setIsLoading(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: '20px', borderLeft: '5px solid #007bff' }}>
      <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'15px'}}>
        <h4 style={{margin:0, color:'#007bff'}}>  Escaneo para Entrega</h4>
      </div>
      
      <p style={{fontSize:'0.9em', color:'#666', marginBottom:'15px'}}>
        Escanee el código de barras único de cada unidad física.
      </p>
      
      <form onSubmit={handleSubmitEntrega}>
        {itemsPorEntregar.map((item, index) => (
          <div key={index} style={{ marginBottom: '10px', padding:'10px', background: index % 2 === 0 ? '#f8f9fa' : '#fff', borderRadius:'5px', border:'1px solid #eee', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap' }}>
            
            <div style={{flex: 1, minWidth:'200px'}}>
                <strong>{item.nombre}</strong> 
                <span style={{fontSize:'0.8em', color:'#666', marginLeft:'10px', background:'#e9ecef', padding:'2px 6px', borderRadius:'4px'}}>
                    Unidad {item.indice}
                </span>
            </div>
            
            <div style={{flex: 1, minWidth:'250px'}}>
              <div className="input-box" style={{margin:0}}>
                <span className="icon"></span>
                <input
                  ref={el => inputRefs.current[index] = el}
                  type="text"
                  placeholder="Escanee código..."
                  value={item.barcode_escaneado}
                  onChange={(e) => handleBarcodeChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  required
                  disabled={isLoading}
                  autoComplete="off"
                  style={{fontWeight:'bold', color:'#0056b3'}}
                />
              </div>
            </div>

          </div>
        ))}

        {error && <div style={{ color: '#721c24', background:'#f8d7da', padding:'10px', borderRadius:'5px', marginBottom:'15px', fontWeight:'bold' }}>{error}</div>}

        <button type="submit" className="btn confirm" disabled={isLoading} style={{width:'100%', marginTop:'10px'}}>
          {isLoading ? 'Procesando...' : ' Confirmar Entrega'}
        </button>
      </form>
    </div>
  );
};

export default EntregaValeForm;