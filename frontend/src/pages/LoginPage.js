import React, { useState, useEffect } from 'react'; // <--- AQUÍ FALTABA useEffect
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
// import './LoginPage.css'; // SE ELIMINA PORQUE USAMOS CSS GENERAL

// Importamos el logo correcto
import logo from '../assets/cettcenlog.png'; 

const LoginPage = () => {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Estado para el modal de cambio de contraseña [RQF1.1]
  const [showChangePass, setShowChangePass] = useState(false);
  const [tempUserId, setTempUserId] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passError, setPassError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  // [NUEVO] EFECTO PARA DETECTAR SESIÓN EXPIRADA
  useEffect(() => {
    const isExpired = localStorage.getItem('session_expired');
    if (isExpired === 'true') {
      setError(' Tu sesión ha expirado por inactividad. Por favor inicia sesión nuevamente.');
      // Importante: Borramos la marca para que no salga siempre que recargues
      localStorage.removeItem('session_expired');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!correo.endsWith('@ceti.mx')) {
        setError(' El correo debe ser institucional (@ceti.mx)');
        setIsLoading(false);
        return;
    }

    try {
      const { data } = await api.post('/auth/login', { correo, contrasena });

      if (data.requirePasswordChange) {
          setTempUserId(data.id_usuario);
          setShowChangePass(true);
          setIsLoading(false);
          return;
      }

      login(data.usuario, data.token);
      const rolUsuario = data.usuario.rol.toLowerCase();
      if (['administrador', 'coordinador', 'almacenista'].includes(rolUsuario)) {
          navigate('/dashboard');
      } else {
          // Alumnos y Maestros van directo a sus solicitudes
          navigate('/vales');
      }

    } catch (err) {
      setError(err.response?.data?.error || 'Credenciales inválidas');
      setIsLoading(false);
    }
  };

  const handleChangePassSubmit = async (e) => {
      e.preventDefault();
      setPassError('');

      if (newPass.length < 8) {
          setPassError(' La contraseña debe tener al menos 8 caracteres.');
          return;
      }
      if (newPass !== confirmPass) {
          setPassError(' Las contraseñas no coinciden.');
          return;
      }

      try {
          await api.post('/auth/cambiar-password', { 
              id_usuario: tempUserId, 
              nuevaContrasena: newPass 
          });
          alert(' Contraseña actualizada exitosamente. Por favor inicie sesión.');
          setShowChangePass(false);
          setContrasena('');
          setNewPass('');
          setConfirmPass('');
          setTempUserId(null);
      } catch (err) {
          setPassError(err.response?.data?.error || 'Error al cambiar contraseña');
      }
  };

  return (
    <div className="login-page-container">
      {/* FONDO */}
      <div className="login-background"></div>

      <div className="login-card">
        {/* ENCABEZADO CON LOGO */}
        <div className="login-header">
          <img src={logo} alt="Logo CETI" className="login-logo" />
          <h2>Sistema de Inventario</h2>
          <p>Almacén General</p>
        </div>

        {!showChangePass ? (
          /* FORMULARIO LOGIN */
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Correo Institucional</label>
              <input 
                type="email" 
                value={correo} 
                onChange={(e) => setCorreo(e.target.value)} 
                required 
                placeholder="usuario@ceti.mx"
                className="form-input"
              />
            </div>
            
            <div className="input-group">
              <label>Contraseña</label>
              <input 
                type="password" 
                value={contrasena} 
                onChange={(e) => setContrasena(e.target.value)} 
                required 
                placeholder="••••••••"
                className="form-input"
              />
            </div>

            {error && <div className="alert-error">{error}</div>}

            <button type="submit" className="btn-login" disabled={isLoading}>
              {isLoading ? 'Verificando...' : 'Iniciar Sesión'}
            </button>
          </form>
        ) : (
          /* MODAL CAMBIO DE CONTRASEÑA */
          <div className="change-pass-container">
             <div className="alert-warning">
               <strong> Primer Ingreso</strong>
               <p>Por seguridad, cambia tu contraseña para continuar.</p>
             </div>
             
             <form onSubmit={handleChangePassSubmit} className="login-form">
                <div className="input-group">
                    <label>Nueva Contraseña</label>
                    <input 
                        type="password" 
                        value={newPass} 
                        onChange={(e)=>setNewPass(e.target.value)} 
                        required 
                        minLength="8"
                        className="form-input"
                    />
                    <small>Mínimo 8 caracteres</small>
                </div>
                <div className="input-group">
                    <label>Confirmar Contraseña</label>
                    <input 
                        type="password" 
                        value={confirmPass} 
                        onChange={(e)=>setConfirmPass(e.target.value)} 
                        required 
                        className="form-input"
                    />
                </div>
                
                {passError && <div className="alert-error">{passError}</div>}
                
                <button type="submit" className="btn-success">Guardar y Continuar</button>
             </form>
          </div>
        )}

        <div className="login-footer">
          <p>© {new Date().getFullYear()} Centro de Enseñanza Técnica Industrial</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;