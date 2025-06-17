import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout/Layout.jsx';
import ActiveExchangesTable from './components/ActiveExchangesTable/ActiveExchangesTable.jsx';
import SpotsMenu from './components/SpotsMenu/SpotsMenu.jsx';

function App() {
  const [allExchanges, setAllExchanges] = useState([]);
  const [selectedExchanges, setSelectedExchanges] = useState([]);

  useEffect(() => {
    fetch('/api/configured-exchanges')
      .then(res => res.json())
      .then(data => setAllExchanges(data));
  }, []);

  useEffect(() => {
    setSelectedExchanges(allExchanges.filter(ex => ex.isActive));
  }, [allExchanges]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={
          <Layout
            allExchanges={allExchanges}
            setAllExchanges={setAllExchanges}
          />
        }>
          <Route path="conexion" element={<ActiveExchangesTable selectedExchanges={selectedExchanges} />} />
          <Route path="spots" element={<SpotsMenu />} />
          <Route index element={<div>Bienvenido al Dashboard</div>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
