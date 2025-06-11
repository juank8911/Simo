import React from 'react';

const ActiveExchangesTable = ({ activeExchanges }) => {
  return (
    <div className="main-content">
      <h1>Active Exchange Status</h1>
      <table id="activeExchangesTable">
        <thead>
          <tr>
            <th id="exchangeNameHeader">Exchange Name</th>
            <th>Status</th>
            <th id="apiAccessHeaderIcons">
              <span className="api-header-icon" title="Acceso API Pública">👤</span>
              <span className="api-header-icon" title="Acceso API Privada">🔒</span>
            </th>
            <th>Error Message</th>
          </tr>
        </thead>
        <tbody>
          {activeExchanges.length === 0 ? (
            <tr id="noActiveExchangesMessage"><td colSpan="4">No exchanges selected. Check an exchange in the sidebar.</td></tr>
          ) : (
            activeExchanges.map(exchange => (
              <tr key={exchange.id} data-exchange-id={exchange.id}>
                <td>{exchange.name}</td>
                <td>{exchange.status}</td>
                <td>
                  <span className={`api-icon public-api-icon ${exchange.status === 'Online' ? 'green' : 'red'}`} title={`Public API: ${exchange.status}`}></span>
                  <span className="api-icon private-api-icon red" title="Private API: Not Configured"></span>
                </td>
                <td>{exchange.error || ''}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ActiveExchangesTable;