import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const IdleTimer = () => {
    const { logout, usuario } = useAuth();
    const navigate = useNavigate();
    
    // Configuración: 15 minutos
    const INACTIVITY_LIMIT = 15 * 60 * 1000; 
    const timerRef = useRef(null);

    const handleLogout = useCallback(() => {
        if (usuario) {
            console.warn("Sesión cerrada por inactividad (15 min).");
            // Guardamos la marca en localStorage para que LoginPage la detecte
            localStorage.setItem('session_expired', 'true');
            logout();
            navigate('/login');
        }
    }, [logout, navigate, usuario]);

    const resetTimer = useCallback(() => {
        // Limpiar el contador anterior
        if (timerRef.current) clearTimeout(timerRef.current);
        
        // Solo programar el nuevo cierre de sesión si hay un usuario logueado
        if (usuario) {
            timerRef.current = setTimeout(handleLogout, INACTIVITY_LIMIT);
        }
    }, [handleLogout, INACTIVITY_LIMIT, usuario]);

    useEffect(() => {
        // Eventos que reinician el reloj de inactividad
        const events = [
            'mousemove', 'keydown', 'click', 
            'scroll', 'touchstart', 'wheel'
        ];

        if (usuario) {
            // Iniciar el temporizador nada más entrar
            resetTimer();

            // Escuchar interacciones del usuario
            events.forEach(event => window.addEventListener(event, resetTimer));
        } else {
            // Si el usuario cierra sesión manualmente, matamos cualquier timer pendiente
            if (timerRef.current) clearTimeout(timerRef.current);
        }

        return () => {
            // Limpieza al desmontar el componente o cambiar de usuario
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(event => window.removeEventListener(event, resetTimer));
        };
    }, [usuario, resetTimer]);

    return null; // Componente invisible
};

export default IdleTimer;