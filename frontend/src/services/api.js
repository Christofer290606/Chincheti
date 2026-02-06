import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:4000/api', 
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      
      // Borramos credenciales
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      
      // [NUEVO] Guardamos la bandera de inactividad
      localStorage.setItem('session_expired', 'true'); 

      if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;