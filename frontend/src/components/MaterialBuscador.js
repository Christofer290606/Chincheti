import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';

const MaterialBuscador = ({ onSelect, placeholder = "🔍 Buscar material por nombre o ID..." }) => {
    const [query, setQuery] = useState('');
    const [resultados, setResultados] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const wrapperRef = useRef(null);

    // Debounce para no saturar la API
    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.length >= 3) {
                realizarBusqueda();
            } else {
                setResultados([]);
            }
        }, 500); // 500ms delay

        return () => clearTimeout(timer);
    }, [query]);

    // Cerrar lista al hacer click fuera
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShowResults(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    const realizarBusqueda = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/materiales/buscador?q=${query}`);
            setResultados(data);
            setShowResults(true);
        } catch (error) {
            console.error("Error buscando:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (item) => {
        setQuery(''); // Limpiar o mantener según preferencia
        setShowResults(false);
        if (onSelect) onSelect(item);
    };

    const getBadgeColor = (estado) => {
        if (!estado) return '#6c757d';
        const st = estado.toLowerCase();
        if (st.includes('disponible')) return '#28a745'; // Verde
        if (st.includes('mantenimiento')) return '#ffc107'; // Amarillo
        if (st.includes('baja')) return '#dc3545'; // Rojo
        if (st.includes('prestado')) return '#007bff'; // Azul
        return '#6c757d';
    };

    return (
        <div ref={wrapperRef} style={{ position: 'relative', width: '100%', maxWidth:'500px' }}>
            <input 
                type="text" 
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => query.length >=3 && setShowResults(true)}
                style={{
                    width: '100%', 
                    padding: '12px 15px', 
                    borderRadius: '25px', 
                    border: '1px solid #ccc', 
                    outline: 'none',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                    fontSize: '1rem'
                }}
            />
            {loading && <span style={{position:'absolute', right:'15px', top:'12px', color:'#999'}}>⏳</span>}

            {/* LISTA DE RESULTADOS (RQNF25.1) */}
            {showResults && resultados.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: '105%',
                    left: 0,
                    right: 0,
                    background: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                    zIndex: 1000,
                    maxHeight: '400px',
                    overflowY: 'auto'
                }}>
                    <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.9rem'}}>
                        <thead style={{background:'#f8f9fa', color:'#666', fontSize:'0.8rem', textAlign:'left'}}>
                            <tr>
                                <th style={{padding:'10px'}}>ID</th>
                                <th style={{padding:'10px'}}>Material</th>
                                <th style={{padding:'10px'}}>Estado</th>
                                <th style={{padding:'10px'}}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {resultados.map((item) => (
                                <tr key={item.id_unidad} style={{borderBottom:'1px solid #eee'}}>
                                    <td style={{padding:'10px', fontFamily:'monospace', fontWeight:'bold', color:'#333'}}>
                                        {item.identificador_barcode}
                                    </td>
                                    <td style={{padding:'10px'}}>
                                        <div style={{fontWeight:'bold', color:'#003366'}}>{item.nombre_material}</div>
                                        <div style={{fontSize:'0.8em', color:'#666'}}>{item.nombre_categoria} | {item.marca}</div>
                                    </td>
                                    <td style={{padding:'10px'}}>
                                        <span style={{
                                            padding:'3px 8px', 
                                            borderRadius:'12px', 
                                            background: getBadgeColor(item.nombre_estado), 
                                            color:'white', 
                                            fontSize:'0.75em',
                                            fontWeight:'bold'
                                        }}>
                                            {item.nombre_estado}
                                        </span>
                                    </td>
                                    <td style={{padding:'10px', textAlign:'right'}}>
                                        <button 
                                            onClick={() => handleSelect(item)}
                                            style={{
                                                background: '#007bff', 
                                                color: 'white', 
                                                border: 'none', 
                                                borderRadius: '4px', 
                                                padding: '5px 10px', 
                                                cursor: 'pointer',
                                                fontSize:'0.85em'
                                            }}
                                        >
                                            Ver Detalle
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            
            {showResults && resultados.length === 0 && query.length >= 3 && !loading && (
                <div style={{
                    position: 'absolute', top: '105%', left: 0, right: 0,
                    background: 'white', padding: '15px', textAlign: 'center',
                    border: '1px solid #ddd', borderRadius: '8px', zIndex: 1000
                }}>
                    No se encontraron materiales.
                </div>
            )}
        </div>
    );
};

export default MaterialBuscador;