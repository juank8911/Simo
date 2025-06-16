import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import ActiveExchangesTable from './components/ActiveExchangesTable/ActiveExchangesTable.jsx';
import SpotsMenu from './components/SpotsMenu/SpotsMenu.jsx';
import styles from './App.module.css';

function App() {
  return (
    <Router>
      <div className={styles.layout}>
        <Sidebar />
        <main className={styles.main}>
          <Routes>
            <Route path="/conexion" element={<ActiveExchangesTable />} />
            <Route path="/spots" element={<SpotsMenu />} />
            <Route path="/" element={<div>Bienvenido al Dashboard</div>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
