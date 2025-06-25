import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout.jsx';
import ConnectionPage from './pages/ConnectionPage/ConnectionPage.jsx';
import Top20DetailedPage from './pages/Top20DetailedPage/Top20DetailedPage.jsx';

// Un componente simple para la página de inicio.
const HomePage = () => (
  <div>
    <h2>Bienvenido a SEBO</h2>
    <p>Selecciona una opción del menú lateral para comenzar.</p>
  </div>
);

function App() {
  const [allExchanges, setAllExchanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchConfiguredExchanges = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/configured-exchanges');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const exchangesData = await response.json();
        setAllExchanges(exchangesData);
      } catch (err) {
        console.error('Failed to fetch available exchanges:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchConfiguredExchanges();
  }, []);

  const handleExchangeChange = useCallback(async (event) => {
    const checkbox = event.target;
    const exchangeId = checkbox.dataset.exchangeId;
    const exchangeName = checkbox.dataset.exchangeName;
    const isChecked = checkbox.checked;

    // Actualización optimista de la UI
    setAllExchanges(prev =>
      prev.map(ex =>
        ex.id === exchangeId ? { ...ex, isActive: isChecked } : ex
      )
    );

    // Actualizar el estado en el servidor
    try {
      await fetch('/api/update-exchange-active-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exchangeId, isActive: isChecked, exchangeName })
      });
    } catch (serverError) {
      console.error('Failed to update exchange active status on server:', serverError);
      // Revertir el cambio en la UI si falla la llamada al servidor
      setAllExchanges(prev =>
        prev.map(ex =>
          ex.id === exchangeId ? { ...ex, isActive: !isChecked } : ex
        )
      );
    }
  }, []);

  return (
    <Layout
      allExchanges={allExchanges}
      onExchangeChange={handleExchangeChange}
      loading={loading}
      error={error}
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/conexion" element={<ConnectionPage allExchanges={allExchanges} />} />
        <Route path="/top20-detailed" element={<Top20DetailedPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
