import React, { useRef, useEffect, useState } from 'react';

const BarcodeScannerInput = ({ onScan, placeholder = "Escanea código aquí...", autoFocus = true }) => {
  const inputRef = useRef(null);
  const [val, setVal] = useState('');

  // Mantiene el foco en el input para que no tengas que dar clic a cada rato
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus, val]); // Se re-enfoca al limpiar

  const handleKeyDown = (e) => {
    // El lector Steren envía 'Enter' al final del código
    if (e.key === 'Enter') {
      e.preventDefault();
      if (val.trim()) {
        onScan(val.trim()); // Enviamos el código al padre
        setVal(''); // Limpiamos para el siguiente producto
      }
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom:'15px', background:'#e3f2fd', padding:'10px', borderRadius:'5px', border:'1px solid #90caf9' }}>
      <span style={{ fontSize: '1.5rem' }}></span>
      <div style={{flex: 1}}>
        <label style={{display:'block', fontSize:'0.8rem', color:'#1565c0', marginBottom:'4px'}}>Lector de Barras Activo</label>
        <input
            ref={inputRef}
            type="text"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={{
            padding: '10px',
            fontSize: '1rem',
            width: '100%',
            border: '2px solid #1976d2',
            borderRadius: '5px',
            outline: 'none',
            fontWeight: 'bold'
            }}
        />
      </div>
    </div>
  );
};

export default BarcodeScannerInput;