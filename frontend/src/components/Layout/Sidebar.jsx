import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import logo from '../../assets/cettcenlog.png'; 

const Sidebar = ({ isOpen, onClose }) => {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    if (window.confirm("¿Estás seguro de que deseas cerrar sesión?")) {
        logout();
        navigate('/login');
    }
  };

  const handleLinkClick = () => {
    if (window.innerWidth <= 900) {
      onClose();
    }
  };

  const rol = usuario?.rol; 
  const estaActivo = usuario?.estatus === 'Activo';

  // --- LÓGICA DE VISIBILIDAD ---

  // 1. Inicio
  const verBotonInicio = ['administrador', 'coordinador', 'almacenista'].includes(rol);
  
  // 2. Inventario
  const esOperativoAlmacen = ['coordinador', 'almacenista'].includes(rol);
  const verProcesosAlmacen = esOperativoAlmacen || (['alumno', 'maestro'].includes(rol) && estaActivo);

  // 3. Vales e Incidencias
  const verMisVales = ['alumno', 'maestro', 'coordinador', 'almacenista'].includes(rol);
  const verIncidencias = ['alumno', 'maestro', 'coordinador', 'almacenista'].includes(rol);
  
  // 4. Mantenimiento (NUEVO BLOQUE RQF26 y RQF27)
  const verMantenimiento = ['coordinador', 'almacenista'].includes(rol);

  // 5. Estadísticas y Reportes
  // CORRECCIÓN AQUÍ: Se eliminó 'administrador' de esta lista.
  const verEstadisticas = ['coordinador', 'almacenista'].includes(rol); 

  const verReporteRechazos = rol === 'coordinador';
  const verReportePrestamos = ['coordinador', 'almacenista'].includes(rol);
  
  // 6. Gestión Usuarios (SOLO ADMIN Y COORD)
  const verGestionUsuarios = ['administrador', 'coordinador'].includes(rol);

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="logo">
        <img src={logo} alt="Logo CETI" style={{width: '120px', marginBottom: '1rem'}} />
        <h2>CETTCEN</h2>
        <p style={{fontSize:'0.9rem', marginBottom:'5px'}}>
            {usuario ? usuario.nombre : 'Cargando...'}
        </p>
        <div style={{fontSize: '0.8rem'}}>
          <span style={{opacity: 0.7, textTransform: 'capitalize'}}>{rol}</span>
          {!estaActivo && <span style={{color: '#ef4444', fontWeight: 'bold', display: 'block'}}>⛔ BLOQUEADO</span>}
        </div>
      </div>

      <ul className="sidebar-menu-scroll">
        
        {/* El Admin podría ver inicio o se le podría redirigir directo a usuarios, 
            pero generalmente se deja el dashboard si existe una vista general. 
            Si quieres ocultarlo también, quita 'administrador' de verBotonInicio */}
        {verBotonInicio && (
          <li onClick={handleLinkClick}>
            <Link to="/dashboard" style={{textDecoration: 'none', color: 'white', display: 'flex', gap: '.8rem'}}>
               Inicio
            </Link>
          </li>
        )}

        {verProcesosAlmacen && (
          <li onClick={handleLinkClick}>
            <Link to="/inventario" style={{textDecoration: 'none', color: 'white', display: 'flex', gap: '.8rem'}}>
               Inventario
            </Link>
          </li>
        )}

        {verMisVales && (
          <li onClick={handleLinkClick}>
            <Link to="/vales" style={{textDecoration: 'none', color: 'white', display: 'flex', gap: '.8rem'}}>
               Mis Vales
            </Link>
          </li>
        )}

        {verIncidencias && (
          <li onClick={handleLinkClick}>
            <Link to="/incidencias" style={{textDecoration: 'none', color: 'white', display: 'flex', gap: '.8rem'}}>
               Incidencias
            </Link>
          </li>
        )}

        {/* BLOQUE MANTENIMIENTO */}
        {verMantenimiento && (
          <>
            <li className="section-title" style={{color:'#aaa', fontSize:'0.75rem', margin:'15px 0 5px 10px', fontWeight:'bold'}}>MANTENIMIENTO</li>
            
            <li onClick={handleLinkClick}>
              <Link to="/reportes/mantenimiento-activo" style={{textDecoration: 'none', color: 'white', display: 'flex', gap: '.8rem'}}>
                 Reporte Activos
              </Link>
            </li>
            
            <li onClick={handleLinkClick}>
              <Link to="/configuracion/mantenimiento" style={{textDecoration: 'none', color: 'white', display: 'flex', gap: '.8rem'}}>
                 Configuración
              </Link>
            </li>
          </>
        )}

        {/* BLOQUE REPORTES */}
        {(verReportePrestamos || verReporteRechazos || verEstadisticas) && (
            <li className="section-title" style={{color:'#aaa', fontSize:'0.75rem', margin:'15px 0 5px 10px', fontWeight:'bold'}}>REPORTES</li>
        )}

        {verReportePrestamos && (
          <li onClick={handleLinkClick}>
            <Link to="/reportes/prestamos" style={{textDecoration: 'none', color: 'white', display: 'flex', gap: '.8rem'}}>
               Préstamos Activos
            </Link>
          </li>
        )}

        {verReporteRechazos && (
          <li onClick={handleLinkClick}>
            <Link to="/reportes/rechazos" style={{textDecoration: 'none', color: 'white', display: 'flex', gap: '.8rem'}}>
               Reporte Rechazos
            </Link>
          </li>
        )}

        {verEstadisticas && (
          <li onClick={handleLinkClick}>
            <Link to="/estadisticas" style={{textDecoration: 'none', color: 'white', display: 'flex', gap: '.8rem'}}>
               Estadísticas
            </Link>
          </li>
        )}

        {/* BLOQUE ADMIN */}
        {verGestionUsuarios && (
          <>
            <li className="section-title" style={{color:'#aaa', fontSize:'0.75rem', margin:'15px 0 5px 10px', fontWeight:'bold'}}>ADMINISTRACIÓN</li>
            <li onClick={handleLinkClick}>
                <Link to="/usuarios" style={{textDecoration: 'none', color: 'white', display: 'flex', gap: '.8rem'}}>
                 Usuarios
                </Link>
            </li>
          </>
        )}
        
        <li onClick={handleLogout} style={{marginTop: '2rem', cursor: 'pointer', color:'#ff6b6b'}}>
           Cerrar Sesión
        </li>
      </ul>
    </aside>
  );
};

export default Sidebar;