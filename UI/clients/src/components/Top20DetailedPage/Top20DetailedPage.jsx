useEffect(() => {
  // Lanzar petición POST para iniciar transmisión en V2
  fetch('http://localhost:8000/relay', { method: 'GET' })
    .then(res => {
      if (!res.ok) throw new Error('No se pudo iniciar V2');
      return res.json().catch(() => ({})); // Por si no hay body
    })
    .then(() => {
      // Conectar al namespace específico
      const socket = io(`${SEBO_WEBSOCKET_URL}${NAMESPACE}`, {
        transports: ['websocket']
      });

      socket.on('connect', () => {
        console.log('Connected to Sebo WebSocket (Top 20 Detailed) on namespace:', NAMESPACE);
        setError(null);
      });

      socket.on('disconnect', (reason) => {
        console.log('Disconnected from Sebo WebSocket (Top 20 Detailed):', reason);
      });

      socket.on('connect_error', (err) => {
        console.error('Connection error with Sebo WebSocket (Top 20 Detailed):', err);
        setError(`Connection Error: ${err.message}. Is Sebo server running on port 3000?`);
      });

      socket.on('spot-arb', (opportunity) => {
        setOpportunities(prevOpportunities => {
          const newOpportunities = [opportunity, ...prevOpportunities];
          const uniqueOpportunities = newOpportunities.filter(
            (op, index, self) => index === self.findIndex((o) => o.analysis_id === op.analysis_id)
          );
          return uniqueOpportunities.slice(0, 20);
        });
      });

      // Cleanup
      return () => {
        console.log('Cleaning up Sebo WebSocket connection (Top 20 Detailed)');
        socket.disconnect();
      };
    })
    .catch(err => {
      setError(`Error al iniciar V2: ${err.message}`);
    });
}, []);
