import React from 'react';

const Topbar = ({ toggleMenu, titulo = "Dashboard" }) => {
  return (
    <header className="topbar">
      <div style={{display: 'flex', alignItems: 'center'}}>
        {/* Botón de menú (visible solo en móvil por CSS) */}
        <button className="menu-toggle" onClick={toggleMenu}>
          ☰
        </button>
        
        <h3>{titulo}</h3>
      </div>
      
      <span id="fecha" style={{fontSize: '0.9rem'}}>
        {new Date().toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
      </span>
    </header>
  );
};

export default Topbar;