import React, { useState } from 'react';
import './TrainingPage.css'; // Crearemos este archivo CSS después para estilos básicos

function TrainingPage() {
  const [statusMessage, setStatusMessage] = useState('Listo para entrenar el modelo.');
  const [isLoading, setIsLoading] = useState(false);
  const [errorDetails, setErrorDetails] = useState('');

  const handleStartTraining = async () => {
    setIsLoading(true);
    setStatusMessage('Iniciando entrenamiento del modelo...');
    setErrorDetails(''); // Limpiar errores previos

    try {
      // La llamada usa /api/v_dos/model/train debido a la configuración del proxy en vite.config.js
      const response = await fetch('/api/v_dos/model/train', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Aunque no enviemos cuerpo, es buena práctica
        },
      });

      // Intentar parsear JSON siempre, incluso si no es response.ok, por si hay info de error
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        // Si el JSON falla, podría ser HTML (ej. error de proxy no capturado) o texto plano
        const textError = await response.text();
        throw new Error(`Respuesta no es JSON: ${response.status} ${response.statusText}. Contenido: ${textError}`);
      }

      if (response.ok) {
        setStatusMessage(data.message || 'Entrenamiento iniciado con éxito. El proceso continuará en segundo plano.');
      } else {
        // Usar data.error o data.message si el backend envía errores estructurados en JSON
        const backendError = data.error || data.message || `Error del servidor: ${response.status}`;
        setStatusMessage('Error durante el inicio del entrenamiento.');
        setErrorDetails(backendError);
        console.error('Error del backend:', data);
      }
    } catch (error) {
      console.error('Error al contactar la API de entrenamiento:', error);
      setStatusMessage('Error de conexión al intentar iniciar el entrenamiento.');
      setErrorDetails(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="training-page-container">
      <h2 className="training-page-title">Entrenamiento del Modelo de IA</h2>
      <div className="training-controls">
        <button
          className="training-button"
          onClick={handleStartTraining}
          disabled={isLoading}
        >
          {isLoading ? 'Entrenando...' : 'Iniciar Entrenamiento'}
        </button>
      </div>
      <div className="training-status">
        <p><strong>Estado:</strong> {statusMessage}</p>
        {errorDetails && (
          <p className="training-error-details"><strong>Detalles del Error:</strong> {errorDetails}</p>
        )}
      </div>
    </div>
  );
}

export default TrainingPage;
