// UI/clients/src/components/Top20DetailedPage/Top20DetailedPage.jsx
import React, { useState, useEffect } from 'react';
import io from 'socket.io-client'; // Necesitarás instalar socket.io-client si aún no está: npm install socket.io-client

const SEBO_WEBSOCKET_URL = 'ws://localhost:3000'; // URL base del servidor Sebo
const NAMESPACE = '/api/spot/arb'; // Namespace definido en spotSocketController.js

const Top20DetailedPage = () => {
  const [opportunities, setOpportunities] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Conectar al namespace específico
    const socket = io(`${SEBO_WEBSOCKET_URL}${NAMESPACE}`, {
      transports: ['websocket'] // Forzar WebSocket para evitar long-polling si es posible
    });

    socket.on('connect', () => {
      console.log('Connected to Sebo WebSocket (Top 20 Detailed) on namespace:', NAMESPACE);
      setError(null);
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from Sebo WebSocket (Top 20 Detailed):', reason);
      // setError('Disconnected. Attempting to reconnect...'); // Podrías manejar la reconexión o mostrar un error
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error with Sebo WebSocket (Top 20 Detailed):', err);
      setError(`Connection Error: ${err.message}. Is Sebo server running on port 3000?`);
    });

    // Escuchar el evento 'spot-arb' que emite cada oportunidad
    socket.on('spot-arb', (opportunity) => {
      // console.log('Received opportunity:', opportunity);
      setOpportunities(prevOpportunities => {
        // Mantener una lista de, por ejemplo, las últimas 20 oportunidades únicas por analysis_id
        // o simplemente reemplazar si el backend envía el array completo cada vez.
        // Dado que el backend emite una por una, las acumularemos y mantendremos las 20 más recientes
        // Asumimos que cada 'opportunity' tiene un 'analysis_id' único o 'symbol' + timestamps para diferenciar

        const newOpportunities = [opportunity, ...prevOpportunities];
        // Filtrar para evitar duplicados basados en analysis_id si se emiten repetidamente
        const uniqueOpportunities = newOpportunities.filter(
            (op, index, self) => index === self.findIndex((o) => o.analysis_id === op.analysis_id)
        );
        return uniqueOpportunities.slice(0, 20); // Mantener solo las últimas 20
      });
    });

    return () => {
      console.log('Cleaning up Sebo WebSocket connection (Top 20 Detailed)');
      socket.disconnect();
    };
  }, []); // El efecto se ejecuta una vez al montar y se limpia al desmontar

  if (error) {
    return <div style={{ color: 'red', padding: '20px' }}>Error: {error}</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Top 20 Oportunidades de Arbitraje (Detallado)</h1>
      {opportunities.length === 0 ? (
        <p>Esperando datos de oportunidades...</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
          {opportunities.map((op, index) => (
            <div key={op.analysis_id || index} style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '15px', width: '300px', backgroundColor: '#f9f9f9' }}>
              <h3 style={{ marginTop: '0' }}>{op.symbol} <span style={{ color: '#555', fontSize: '0.9em' }}>({op.symbol_name})</span></h3>
              <p style={{ color: op.percentage_difference && parseFloat(op.percentage_difference) > 0 ? 'green' : 'red', fontWeight: 'bold' }}>
                Diferencia: {op.percentage_difference}
              </p>
              <p>Timestamp Análisis: {new Date(op.timestamp).toLocaleString()}</p>

              <div>
                <strong>Comprar en: {op.exchange_min_name} ({op.exchange_min_id})</strong><br/>
                Precio: {op.price_at_exMin_to_buy_asset} USDT<br/>
                Taker Fee: {op.fees_exMin?.taker_fee * 100}% | Maker Fee: {op.fees_exMin?.maker_fee * 100}%<br/>
                Retiro {op.symbol_name}: {op.fees_exMin?.withdrawal_fee_asset} ({op.fees_exMin?.withdrawal_network})
              </div>
              <hr style={{margin: '10px 0'}}/>
              <div>
                <strong>Vender en: {op.exchange_max_name} ({op.exchange_max_id})</strong><br/>
                Precio: {op.price_at_exMax_to_sell_asset} USDT<br/>
                Taker Fee: {op.fees_exMax?.taker_fee * 100}% | Maker Fee: {op.fees_exMax?.maker_fee * 100}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Top20DetailedPage;
