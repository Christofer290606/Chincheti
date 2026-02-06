import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar'; // Asegúrate de que este archivo exista en la misma carpeta

const Layout = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="dashboard"> {/* Esta clase debe estar en tu CSS global */}
      
      {/* Fondo oscuro para cerrar menú en móvil */}
      <div 
        className={`sidebar-overlay ${isMobileMenuOpen ? 'show' : ''}`} 
        onClick={closeMenu}
      />

      {/* Sidebar recibe las props para abrirse/cerrarse */}
      <Sidebar isOpen={isMobileMenuOpen} onClose={closeMenu} />
      
      <main className="main-content">
        {/* Topbar recibe la función para abrir el menú hamburguesa */}
        <Topbar toggleMenu={toggleMenu} titulo="Almacén General" />
        
        {/* Aquí se renderiza el contenido de las páginas (Dashboard, Inventario, etc.) */}
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;