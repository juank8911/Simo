import React, { useState, useEffect, useRef } from 'react';

const TopSpotData = () => {
  const [data, setData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Initializing...');
  const socketRef = useRef(null);

  // Esta URL debe coincidir con la UI_WEBSOCKET_URL de tu configuración de Python
  // y el servidor WebSocket que has implementado.
  const WEBSOCKET_URL = "ws://localhost:8000/api/spot/ui";

  useEffect(() => {
    setConnectionStatus('Connecting...');
    socketRef.current = new WebSocket(WEBSOCKET_URL);

    socketRef.current.onopen = () => {
      console.log('TopSpotData: WebSocket connected to UI server');
      setConnectionStatus('Connected');
    };

    socketRef.current.onmessage = (event) => {
      try {
        const receivedData = JSON.parse(event.data);
        console.log('TopSpotData: Data received from UI WebSocket:', receivedData);
        setData(receivedData);
      } catch (error) {
        console.error('TopSpotData: Error parsing WebSocket message:', error);
        setData({ error: 'Failed to parse message', rawData: event.data });
      }
    };

    socketRef.current.onerror = (error) => {
      console.error('TopSpotData: WebSocket Error:', error);
      setConnectionStatus('Error connecting');
      setData({ error: 'WebSocket connection error. Is the Python UI WebSocket server running on port 8000?' });
    };

    socketRef.current.onclose = (event) => {
      console.log('TopSpotData: WebSocket disconnected from UI server:', event.reason);
      setConnectionStatus(`Closed: ${event.reason || (event.wasClean ? 'Normal closure' : 'Connection died')}`);
      if (!event.wasClean) {
        setData({ error: `WebSocket closed unexpectedly. Code: ${event.code}` });
      }
    };

    // Limpieza al desmontar el componente
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []); // El array vacío asegura que el efecto se ejecute solo al montar y desmontar

  return (
    <div className="top-spot-data-container" style={{ marginTop: '10px', padding: '10px', border: '1px solid #ccc' }}>
      <h4>Live Top Spot Data</h4>
      <p><strong>Status:</strong> {connectionStatus}</p>
      <div style={{ maxHeight: '300px', overflowY: 'auto', background: '#f5f5f5', padding: '8px', borderRadius: '4px' }}>
        <pre>{data ? JSON.stringify(data, null, 2) : 'Waiting for data...'}</pre>
      </div>
    </div>
  );
};

export default TopSpotData;