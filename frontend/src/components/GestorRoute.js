import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate, Outlet } from 'react-router-dom';

/**
 * Este componente protege rutas que SOLO deben ser vistas por
 * Administradores, Coordinadores o Almacenistas.
 */
const GestorRoute = () => {
  const { usuario, isLoading } = useAuth();

  const esGestor = () => {
    if (!usuario || !usuario.rol) return false;
    return ['administrador', 'coordinador', 'almacenista'].includes(usuario.rol);
  };

  if (isLoading) {
    return <div>Cargando...</div>;
  }

  // Si está autenticado Y es un gestor, le damos acceso
  if (esGestor()) {
    return <Outlet />;
  }

  // Si no es un gestor (ej. es Alumno), lo sacamos a su dashboard
  return <Navigate to="/dashboard" replace />;
};

export default GestorRoute;