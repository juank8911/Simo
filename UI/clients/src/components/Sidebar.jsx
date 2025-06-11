import React from 'react';
import ExchangeList from './ExchangeList.jsx';
import SpotsMenu from './SpotsMenu.jsx';

const Sidebar = ({ allExchanges, activeExchanges, loading, error, onExchangeChange }) => {
  return (
    <div className="sidebar">
      <button id="toggleSidebarButton" title="Toggle Menu">
        <span className="button-main-title-group">
          <span className="menu-main-icon">☰</span> SEBO
        </span>
        <span id="mainMenuStatus" className="main-menu-status-indicator">no ok</span>
      </button>
      <div className="sidebar-content">
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