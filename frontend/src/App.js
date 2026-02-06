import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute'; 
import Layout from './components/Layout/Layout.jsx'; 

// --- PÁGINAS PRINCIPALES ---
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InventarioPage from './pages/InventarioPage';
import GestionUsuariosPage from './pages/GestionUsuariosPage';
import HistorialMantenimientoPage from './pages/HistorialMantenimientoPage';

// --- MÓDULOS ESPECÍFICOS ---
import MisValesPage from './pages/MisValesPage'; 
import IncidenciasPage from './pages/IncidenciasPage'; 
import EstadisticasPage from './pages/EstadisticasPage'; 
import ReporteRechazosPage from './pages/ReporteRechazosPage'; 
import HistorialUsuarioPage from './pages/HistorialUsuarioPage'; 
import ReportePrestamosPage from './pages/ReportePrestamosPage';
import ConfiguracionMtoPage from './pages/ConfiguracionMtoPage';
import ReporteMantenimientoPage from './pages/ReporteMantenimientoPage';

// Páginas de Detalle/Formularios
import SolicitarValePage from './pages/SolicitarValePage';
import DetalleValePage from './pages/DetalleValePage';
import FormularioIncidenciaPage from './pages/FormularioIncidenciaPage';
import DetalleIncidenciaPage from './pages/DetalleIncidenciaPage';
import IdleTimer from './components/IdleTimer';

function App() {
  return (
    <AuthProvider>
      <Router>
        <IdleTimer />
        <div className="app-container">
        <Routes>
          {/* Login */}
          <Route path="/login" element={<LoginPage />} />

          {/* Rutas Protegidas Globales */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}> 
              
              {/* --- RUTAS COMUNES (Todos los roles activos) --- */}
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/inventario" element={<InventarioPage />} />
              
              {/* Historial Mantenimiento (Accesible desde Inventario) */}
              <Route path="/gestion/mantenimiento/:id" element={<HistorialMantenimientoPage />} />
              
              {/* Módulo Vales */}
              <Route path="/vales" element={<MisValesPage />} />
              <Route path="/vales/solicitar" element={<SolicitarValePage />} />
              <Route path="/vales/solicitar/:id_material" element={<SolicitarValePage />} />
              <Route path="/vales/editar/:id" element={<SolicitarValePage />} />
              <Route path="/vales/:id" element={<DetalleValePage />} />

              {/* --- MÓDULO INCIDENCIAS (CORREGIDO) --- */}
              {/* 1. Ruta principal (Lista) */}
              <Route path="/incidencias" element={<IncidenciasPage />} />
              
              {/* 2. Crear Nueva (Debe coincidir con el Link 'nuevo') */}
              <Route path="/incidencias/nuevo" element={<FormularioIncidenciaPage />} />
              
              {/* 3. Ver Detalle (Debe coincidir con el Link '/incidencias/:id') */}
              {/* ANTES DECÍA: /incidencias/detalle/:id (Por eso fallaba) */}
              <Route path="/incidencias/:id" element={<DetalleIncidenciaPage />} />

              {/* Estadísticas (Visible para operativos y admin) */}
              <Route path="/estadisticas" element={<EstadisticasPage />} />

              {/* --- ZONA ADMINISTRATIVA (Solo Admin y Coord) --- */}
              <Route element={<ProtectedRoute allowedRoles={['administrador', 'coordinador']} />}>
                 <Route path="/reportes/rechazos" element={<ReporteRechazosPage />} />
                 <Route path="/usuarios" element={<GestionUsuariosPage />} />
              </Route>

              {/* --- ZONA OPERATIVA ALMACÉN (Admin, Coord y ALMACENISTA) --- */}
              <Route element={<ProtectedRoute allowedRoles={['administrador', 'coordinador', 'almacenista']} />}>
                 
                 {/* Reportes Operativos */}
                 <Route path="/reportes/prestamos" element={<ReportePrestamosPage />} />
                 <Route path="/reportes/mantenimiento-activo" element={<ReporteMantenimientoPage />} />
                 
                 {/* Historiales y Configuración */}
                 <Route path="/usuarios/:id_usuario/historial" element={<HistorialUsuarioPage />} />
                 <Route path="/configuracion/mantenimiento" element={<ConfiguracionMtoPage />} />
              </Route>
              
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;