# Simos/V3/config_v3.py

API_KEYS = {
    "BINANCE_API_KEY": "your_binance_api_key",
    "BINANCE_SECRET_KEY": "your_binance_secret_key",
    "OKX_API_KEY": "your_okx_api_key",
    "OKX_SECRET_KEY": "your_okx_secret_key",
    "KUCOIN_API_KEY": "your_kucoin_api_key",
    "KUCOIN_SECRET_KEY": "your_kucoin_secret_key",
    "KUCOIN_PASSPHRASE": "your_kucoin_passphrase",
    "BYBIT_API_KEY": "your_bybit_api_key",
    "BYBIT_SECRET_KEY": "your_bybit_secret_key",
    # Agrega aquí las claves de API para otros exchanges que vayas a usar
}

# URLs de conexión
WEBSOCKET_URL = "ws://localhost:3031/api/spot/arb"  # WebSocket de sebo
UI_WEBSOCKET_URL = "ws://localhost:3001/api/spot/ui"  # WebSocket para la UI
SEBO_API_BASE_URL = "http://localhost:3000/api"  # API base de Sebo

# Parámetros para la lógica de arbitraje
MIN_PROFIT_PERCENTAGE = 0.6  # Porcentaje mínimo de ganancia para realizar una operación
MIN_PROFIT_USDT = 0.01  # Ganancia mínima absoluta en USDT
MIN_OPERATIONAL_USDT = 10.0  # Balance mínimo para operar

# Parámetros de la IA
AI_MODEL_PATH = "models/arbitrage_model.pkl"
AI_TRAINING_DATA_PATH = "data/training_data.csv"
AI_CONFIDENCE_THRESHOLD = 0.7  # Umbral de confianza para ejecutar operaciones

# Parámetros de trading
DEFAULT_INVESTMENT_MODE = "PERCENTAGE"  # "FIXED" o "PERCENTAGE"
DEFAULT_INVESTMENT_PERCENTAGE = 10.0  # Porcentaje del balance a invertir
DEFAULT_FIXED_INVESTMENT_USDT = 50.0  # Monto fijo a invertir
DEFAULT_STOP_LOSS_PERCENTAGE_GLOBAL = 50.0  # Stop loss global
DEFAULT_STOP_LOSS_PERCENTAGE_OPERATION = 50.0  # Stop loss por operación
DEFAULT_TAKE_PROFIT_PERCENTAGE_OPERATION = None  # Take profit por operación

# Configuración de logging
LOG_LEVEL = "INFO"
LOG_FILE_PATH = "logs/v3_operations.log"
CSV_LOG_PATH = "logs/v3_operation_logs.csv"

# Configuración de simulación
SIMULATION_MODE = False  # True para modo simulación, False para trading real
SIMULATION_DELAY = 0.1  # Delay en segundos para simular tiempo de ejecución

# Configuración de persistencia
TRADING_STATE_FILE = "data/trading_state.json"
BALANCE_CACHE_FILE = "data/balance_cache.json"

# Configuración de red y timeouts
REQUEST_TIMEOUT = 30  # Timeout para requests HTTP en segundos
WEBSOCKET_RECONNECT_DELAY = 5  # Delay para reconexión de WebSocket
MAX_RECONNECT_ATTEMPTS = 10  # Máximo número de intentos de reconexión

# Configuración de exchanges soportados
SUPPORTED_EXCHANGES = [
    "binance", "okx", "kucoin", "bybit", "huobi", "gate", "mexc"
]

# Configuración de redes de transferencia preferidas (por costo)
PREFERRED_NETWORKS = {
    "USDT": ["TRC20", "BSC", "POLYGON", "ERC20"],
    "BTC": ["BTC", "BSC", "POLYGON"],
    "ETH": ["BSC", "POLYGON", "ERC20"],
    "BNB": ["BSC", "BEP2"],
}

