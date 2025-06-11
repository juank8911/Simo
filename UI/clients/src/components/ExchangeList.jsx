import React, { useState } from 'react';

const ExchangeList = ({ allExchanges, activeExchanges, loading, error, onExchangeChange }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  if (loading) {
    return (
      <div className="menu-section">
        <h2>Exchanges</h2>
        <div className="spinner"></div>
      </div>
    );
  }
  if (error) return <div className="menu-section"><h2>Exchanges</h2><p>Error loading exchanges: {error}</p></div>;

  return (
    <div className="menu-section">
      <h2 className="menu-header" onClick={toggleCollapse}>
        Exchanges {isCollapsed ? '►' : '▼'}
      </h2>
      <ul id="allExchangesList" className={`menu-list ${isCollapsed ? 'collapsed-list' : ''}`}>
        {allExchanges.length === 0 && <li>No exchanges available.</li>}
        {allExchanges.map(exchange => {
          const isActive = activeExchanges.some(ae => ae.id === exchange.id);
          return (
            <li key={exchange.id}>
              <input
                type="checkbox"
                id={`cb-sidebar-${exchange.id}`}
                data-exchange-id={exchange.id}
                data-exchange-name={exchange.name}
                data-ccxt-supported={exchange.ccxtSupported}
                data-connection-type={exchange.connectionType}
                checked={isActive}
                onChange={onExchangeChange}
              />
              <label htmlFor={`cb-sidebar-${exchange.id}`}>{exchange.name}</label>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ExchangeList;