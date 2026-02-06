import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    if(window.confirm("¿Desea cerrar sesión?")) {
        logout(); // [RQNF1.11] Elimina token
        navigate('/login');
    }
  };

  // Verificamos permisos para mostrar pestañas
  const esAdminOCoord = ['administrador', 'coordinador'].includes(usuario?.rol);

  return (
    <nav style={{
        background: '#003366', padding: '10px 20px', color: 'white', 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <div style={{fontWeight: 'bold', fontSize: '1.2rem'}}>
        CETI Inventario
      </div>
      
      <div style={{display: 'flex', gap: '15px'}}>
        <Link to="/dashboard" style={{color: 'white', textDecoration: 'none'}}>Inicio</Link>
        <Link to="/inventario" style={{color: 'white', textDecoration: 'none'}}>Inventario</Link>
        
        {/* Solo Admin y Coordinador ven la pestaña Usuarios */}
        {esAdminOCoord && (
            <Link to="/usuarios" style={{color: '#ffc107', textDecoration: 'none'}}>Usuarios</Link>
        )}
      </div>

      <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
        <span style={{fontSize: '0.9rem'}}>{usuario?.nombre} ({usuario?.rol})</span>
        <button 
            onClick={handleLogout} 
            style={{
                background: '#dc3545', border: 'none', color: 'white', 
                padding: '5px 10px', borderRadius: '4px', cursor: 'pointer'
            }}
        >
            Salir
        </button>
      </div>
    </nav>
  );
};

export default Navbar;