import React from 'react';
import styles from './ActiveExchangesTable.module.css';

const ActiveExchangesTable = ({ activeExchanges = [] }) => {

  return (
    <div>
      <h2>Conexión de Exchanges Seleccionados</h2>
      <table id="activeExchangesTable" className={styles.activeExchangesTable}>
        <thead>
          <tr>
            <th id="exchangeNameHeader">Exchange Name</th>
            <th>Status</th>
            <th>
              <span id="apiAccessHeaderIcons" className={styles.apiAccessHeaderIcons}>
                <span className="api-header-icon" title="API Pública">👤</span>
                <span className="api-header-icon" title="API Privada">🔒</span>
              </span>
            </th>
            <th>Error Message</th>
          </tr>
        </thead>
        <tbody>
          {activeExchanges.length === 0 ? (
            <tr id="noActiveExchangesMessage">
              <td colSpan={4}>No hay exchanges seleccionados.</td>
            </tr>
          ) : (
            activeExchanges.map(ex => {
              const isOnline = ex.status === 'Online';
              return (
                <tr key={ex.id}>
                  <td>{ex.name}</td>
                  <td>
                    {ex.status === 'Connecting...' && <span className={styles.statusConnecting}>Conectando...</span>}
                    {isOnline && <span className={styles.statusOnline}>Online</span>}
                    {ex.status === 'Offline' && <span className={styles.statusError}>Desconectado</span>}
                    {ex.status === 'Error' && <span className={styles.statusError}>Error</span>}
                  </td>
                  <td>
                    <span
                      className={`api-icon ${isOnline ? styles.green : styles.red}`}
                      title="API Pública"
                    ></span>
                    <span
                      // TODO: La lógica para la API privada no está implementada.
                      // Se asume 'rojo' por ahora.
                      className={`api-icon private-api-icon ${styles.red}`}
                      title="API Privada"
                    ></span>
                  </td>
                  <td className={styles.errorMessageCell}>
                    {ex.error || '-'}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ActiveExchangesTable;