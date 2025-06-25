import React, { useState } from 'react';
import styles from '../Sidebar/Sidebar.module.css';

const ExchangeList = ({ allExchanges = [], onExchangeChange, loading, error }) => {
  const [isOpen, setIsOpen] = useState(true); // Estado para desplegar/ocultar

  const toggleList = () => setIsOpen(open => !open);

  // Función para renderizar el contenido de la lista según el estado
  const renderContent = () => {
    if (loading) {
      // Muestra un spinner centrado mientras carga.
      // Asegúrate de tener una clase CSS '.spinner' definida.
      return <div className="spinner" style={{ margin: '1rem auto' }}></div>;
    }

    if (error) {
      return <p style={{ color: 'red', padding: '0 1rem' }}>Error: {error}</p>;
    }

    if (allExchanges.length === 0) {
      return (
        <ul className="menu-list">
          <li>No exchanges available.</li>
        </ul>
      );
    }

    return (
      <ul id="allExchangesList" className="menu-list">
        {allExchanges.map(exchange => (
          <li key={exchange.id}>
            <input
              type="checkbox"
              id={`cb-sidebar-${exchange.id}`}
              data-exchange-id={exchange.id}
              data-exchange-name={exchange.name}
              data-connection-type={exchange.connectionType}
              data-ccxt-supported={exchange.ccxtSupported}
              checked={exchange.isActive}
              onChange={onExchangeChange}
            />
            <label htmlFor={`cb-sidebar-${exchange.id}`}>{exchange.name}</label>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="menu-section">
      <button className={styles.menuHeader} onClick={toggleList}>
        <span className={styles.menuTitleText}>Exchanges</span>
        <span className={styles.arrowIndicator}>{isOpen ? '▼' : '►'}</span>
      </button>
      {isOpen && renderContent()}
    </div>
  );
};

export default ExchangeList;