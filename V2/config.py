# Simo/V2/config.py

API_KEYS = {
    "BINANCE_API_KEY": "your_binance_api_key",
    "BINANCE_SECRET_KEY": "your_binance_secret_key",
    "OKX_API_KEY": "your_okx_api_key",
    "OKX_SECRET_KEY": "your_okx_secret_key",
    # Agrega aquí las claves de API para otros exchanges que vayas a usar
}

WEBSOCKET_URL = "ws://localhost:3000/api/spot/arb" # WebSocket de sebo
UI_WEBSOCKET_URL = "ws://localhost:3031/api/spot/ui" # WebSocket para la UI (V2 -> UI)
TOP_OPPORTUNITY_URL = "http://localhost:3000/api/spot/top-opportunit"

# Parámetros para la lógica de arbitraje
MIN_PROFIT_PERCENTAGE = 0.6 # Porcentaje mínimo de ganancia para realizar una operación


