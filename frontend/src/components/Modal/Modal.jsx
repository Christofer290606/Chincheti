import React from 'react';

/**
 * Componente Modal reutilizable.
 * * @param {Object} props
 * @param {function} props.onClose - La función que se llama cuando se hace clic fuera del modal.
 * @param {React.ReactNode} props.children - El contenido que se mostrará dentro del modal (ej. el formulario).
 */
const Modal = ({ children, onClose }) => {

  // Esta función previene que el clic *dentro* del panel cierre el modal.
  const handlePanelClick = (e) => {
    e.stopPropagation();
  };

  // Las clases CSS ".modal" y ".modal-panel" ya están en tu 'index.css' global.
  return (
    <div className="modal" onClick={onClose} style={{ display: 'flex' }}> {/* */}
      {/* El 'modal-panel' es el contenedor blanco del contenido */}
      <div className="modal-panel" onClick={handlePanelClick}> {/* */}
        
        {/* Aquí se renderiza lo que pongas dentro, ej: el <form> de inventario */}
        {children}

      </div>
    </div>
  );
};

export default Modal;