import React from 'react';
import ExchangeList from '../ExchangeList/ExchangeList.jsx';
import SpotsMenu from '../SpotsMenu/SpotsMenu.jsx';
import styles from './Sidebar.module.css';

const Sidebar = ({ allExchanges, activeExchanges, loading, error, onExchangeChange, onShowConexion }) => {
  return (
    <div className="sidebar">
      {/* debe permanecer en el menu principal */}
      <button id="toggleSidebarButton" title="Toggle Menu">
        <span className="button-main-title-group">
          <span className="menu-main-icon">☰</span> SEBO
        </span>
        <span id="mainMenuStatus" className="main-menu-status-indicator">no ok</span>
      </button>
      {/* <ExchangeList /> no se debe quitar del menu principal */}
      <div className="sidebar-content">
        <ExchangeList
          allExchanges={allExchanges}
          activeExchanges={activeExchanges}
          loading={loading}
          error={error}
          onExchangeChange={onExchangeChange}
        />
        <button
          className={styles.menuHeader}
          style={{ fontWeight: 'bold', textAlign: 'left', width: '100%' }}
          onClick={onShowConexion}
        >
          Conexión
        </button>
        <SpotsMenu />
      </div>
    </div>
  );
};

export default Sidebar;