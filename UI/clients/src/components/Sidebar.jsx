import React from 'react';
import ExchangeList from './ExchangeList.jsx';
import SpotsMenu from './SpotsMenu.jsx';
import './SidebarNavigation.css'; // Nueva importación

const Sidebar = ({
  allExchanges,
  activeExchanges,
  loading,
  error,
  onExchangeChange,
  navigateToDashboard, // Nueva prop
  navigateToTraining   // Nueva prop
}) => {
  return (
    <div className="sidebar">
      <button id="toggleSidebarButton" title="Toggle Menu">
        <span className="button-main-title-group">
          <span className="menu-main-icon">☰</span> SEBO
        </span>
        <span id="mainMenuStatus" className="main-menu-status-indicator">no ok</span>
      </button>
      <div className="sidebar-content">
        <nav className="sidebar-navigation">
          <button onClick={navigateToDashboard} className="sidebar-nav-button">
            Dashboard
          </button>
          <button onClick={navigateToTraining} className="sidebar-nav-button">
            Entrenamiento IA
          </button>
        </nav>

        <ExchangeList
          allExchanges={allExchanges}
          activeExchanges={activeExchanges}
          loading={loading}
          error={error}
          onExchangeChange={onExchangeChange}
        />
        <SpotsMenu />
      </div>
    </div>
  );
};

export default Sidebar;