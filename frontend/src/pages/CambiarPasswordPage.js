import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo-ceti.jpg'; 

const CambiarPasswordPage = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      await api.post('/auth/cambiar-password', { nueva_password: password });
      setSuccess('Contraseña actualizada. Redirigiendo...');
      setTimeout(() => { navigate('/dashboard'); }, 2000);
    } catch (err) {
      setIsLoading(false);
      setError(err.response?.data?.error || 'Error al actualizar.');
      if (err.response?.status === 401) logout();
    }
  };

  return (
    // Usamos las nuevas clases de login para mantener consistencia
    <div className="login-page-container">
      <div className="login-container">
        <img src={logo} alt="Logo CETI" style={{ width: '100px', marginBottom: '15px' }} />
        <h2>Establecer Contraseña</h2>
        <p className="sub">Por seguridad, cambia tu contraseña temporal.</p>
        
        <form onSubmit={handleSubmit}>
          <div className="input-box">
            <span className="icon"></span>
            <input type="password" placeholder="Nueva (mín. 8 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={isLoading} />
          </div>

          <div className="input-box">
            <span className="icon"></span>
            <input type="password" placeholder="Confirmar contraseña" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={isLoading} />
          </div>

          {error && <p style={{ color: 'red', textAlign: 'center', marginBottom: '10px' }}>{error}</p>}
          {success && <p style={{ color: 'green', textAlign: 'center', marginBottom: '10px' }}>{success}</p>}

          <button type="submit" disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar'}</button>
        </form>
      </div>
    </div>
  );
};

export default CambiarPasswordPage;