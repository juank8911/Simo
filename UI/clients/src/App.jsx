import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout.jsx';
import Sidebar from './components/Sidebar.jsx';
import ActiveExchangesTable from './components/ActiveExchangesTable.jsx';
import TrainingPage from './components/TrainingPage.jsx'; // Importar TrainingPage

function App() {
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' o 'training'
  const [allExchanges, setAllExchanges] = useState([]);
  const [activeExchanges, setActiveExchanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchExchangeStatus = useCallback(async (exchangeId, exchangeName, connectionType, ccxtSupported) => {
    if (connectionType === "ccxt" && !ccxtSupported) {
      return { 
        id: exchangeId, 
        name: exchangeName, 
        status: 'Error', 
        error: `Exchange '${exchangeName}' (CCXT type) not supported or misconfigured.` 
      };
    }
    try {
      const response = await fetch(`/api/exchange-status/${exchangeId}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Failed to connect. Status: ${response.status}`);
      }
      return { 
        id: exchangeId, 
        name: exchangeName, 
        status: data.connected ? 'Online' : 'Offline', 
        error: data.connected ? null : (data.error || 'Failed to connect.') 
      };
    } catch (err) {
      return { id: exchangeId, name: exchangeName, status: 'Error', error: err.message };
    }
  }, []);

  const updateServerActiveStatus = async (exchangeId, isActive, exchangeName) => {
    try {
      await fetch('/api/update-exchange-active-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exchangeId, isActive, exchangeName })
      });
    } catch (serverError) {
      console.error('Failed to update exchange active status on server:', serverError);
    }
  };

  useEffect(() => {
    const fetchAndInitialize = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/configured-exchanges');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const exchangesData = await response.json();
        setAllExchanges(exchangesData);

        const initialActiveSetup = [];
        const statusPromises = [];

        exchangesData
          .filter(ex => ex.isActive)
          .forEach(ex => {
            const isSupported = ex.ccxtSupported === true || ex.ccxtSupported === 'true';
            const isCore = ex.isCoreExchange === true || ex.isCoreExchange === 'true';

            if (isCore || isSupported) {
              initialActiveSetup.push({ id: ex.id, name: ex.name, status: 'Connecting...', error: null });
              statusPromises.push(fetchExchangeStatus(ex.id, ex.name, ex.connectionType, isSupported));
            } else {
              initialActiveSetup.push({
                id: ex.id,
                name: ex.name,
                status: 'Error',
                error: `Exchange '${ex.name}' is active but not supported for connection.`
              });
            }
          });

        setActiveExchanges(initialActiveSetup);

        if (statusPromises.length > 0) {
          const resolvedStatuses = await Promise.all(statusPromises);
          setActiveExchanges(prevList => {
            const updatedList = [...prevList];
            resolvedStatuses.forEach(status => {
              const indexToUpdate = updatedList.findIndex(item => item.id === status.id);
              if (indexToUpdate !== -1) {
                const originalName = exchangesData.find(e => e.id === status.id)?.name || status.name;
                updatedList[indexToUpdate] = { ...status, name: originalName };
              }
            });
            return updatedList;
          });
        }
      } catch (err) {
        console.error('Failed to fetch available exchanges:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAndInitialize();
  }, [fetchExchangeStatus]);

  const navigateToDashboard = () => setCurrentView('dashboard');
  const navigateToTraining = () => setCurrentView('training');

  const handleExchangeChange = useCallback(async (event) => {
    const checkbox = event.target;
    const exchangeId = checkbox.dataset.exchangeId;
    const exchangeName = checkbox.dataset.exchangeName;
    const ccxtSupported = checkbox.dataset.ccxtSupported === 'true';
    const connectionType = checkbox.dataset.connectionType;
    const isChecked = checkbox.checked;

    await updateServerActiveStatus(exchangeId, isChecked, exchangeName);

    if (isChecked) {
      const placeholder = { id: exchangeId, name: exchangeName, status: 'Connecting...', error: null };
      setActiveExchanges(prev => [...prev.filter(ex => ex.id !== exchangeId), placeholder]);

      const statusData = await fetchExchangeStatus(exchangeId, exchangeName, connectionType, ccxtSupported);
      
      setActiveExchanges(prev => {
        const list = prev.filter(ex => ex.id !== exchangeId);
        return [...list, { ...statusData, name: exchangeName }];
      });

    } else {
      setActiveExchanges(prev => prev.filter(ex => ex.id !== exchangeId));
    }
  }, [fetchExchangeStatus]);

  return (
    <Layout>
      <Sidebar
        allExchanges={allExchanges}
        activeExchanges={activeExchanges}
        loading={loading}
        error={error}
        onExchangeChange={handleExchangeChange}
        navigateToDashboard={navigateToDashboard}
        navigateToTraining={navigateToTraining}
      />
      {currentView === 'dashboard' && <ActiveExchangesTable activeExchanges={activeExchanges} />}
      {currentView === 'training' && <TrainingPage />}
    </Layout>
  );
}

export default App;
