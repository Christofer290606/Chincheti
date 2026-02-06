import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ allowedRoles }) => {
  const { usuario, token } = useAuth();

  // 1. Si no hay token o usuario, ir a Login
  if (!token || !usuario) {
    return <Navigate to="/login" replace />;
  }

  // 2. Si la ruta exige roles específicos y el usuario no lo tiene [RQNF1.7]
  if (allowedRoles && !allowedRoles.includes(usuario.rol)) {
    alert("Acceso denegado: No tienes permisos para esta sección.");
    return <Navigate to="/dashboard" replace />;
  }

  // 3. Si todo bien, renderizar el contenido
  return <Outlet />;
};

export default ProtectedRoute;