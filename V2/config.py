# config.py

API_KEYS = {
    "BINANCE_API_KEY": "your_binance_api_key",
    "BINANCE_SECRET_KEY": "your_binance_secret_key",
    "OKX_API_KEY": "your_okx_api_key",
    "OKX_SECRET_KEY": "your_okx_secret_key",
    # Agrega aquí las claves de API para otros exchanges que vayas a usar
}

WEBSOCKET_URL = "ws://localhost:3000/api/spot/arb"
UI_WEBSOCKET_URL = "ws://localhost:8000/api/spot/ui"
TOP_OPPORTUNITY_URL = "http://localhost:3000/api/spot/top-opportunit"

# Parámetros para la lógica de arbitraje
MIN_PROFIT_PERCENTAGE = 0.6 # Porcentaje mínimo de ganancia para realizar una operación


