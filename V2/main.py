# main.py
import asyncio
import json
from datetime import datetime, timezone
from typing import Optional
from contextlib import asynccontextmanager

import aiohttp
import ccxt.async_support as ccxt
import socketio
import uvicorn
import websockets
from fastapi import FastAPI, HTTPException, Request
from socketio.exceptions import ConnectionError as SocketIOConnectionError
import pandas as pd
import numpy as np

from arbitrage_calculator import calculate_net_profitability
from arbitrage_executor import evaluate_and_simulate_arbitrage
from config import SEBO_API_BASE_URL, UI_WEBSOCKET_URL, WEBSOCKET_URL
from controllera.data import (
    get_balance_config,
    get_last_balance,
    get_usdt_withdrawal_info,
    update_balance,
)
from data_logger import log_operation_to_csv
from model import ArbitrageIntelligenceModel

# --- Application State ---
class AppState:
    STOPPED = "stopped"
    RUNNING = "running"
    STARTING = "starting"
    STOPPING = "stopping"

# --- FastAPI App Initialization ---
class CryptoArbitrageApp:
    def __init__(self):
        """Inicializa la aplicación de arbitraje, modelos, conexiones y estado."""
        self.model = ArbitrageIntelligenceModel(model_path="trained_model.pkl")
        self.sio = socketio.AsyncClient(logger=False, engineio_logger=False)
        self.ui_clients = set()
        self.ccxt_instances = {}
        self.current_balance_config = None
        self.usdt_holder_exchange_id = None
        self.global_sl_active_flag = False
        self.http_session: Optional[aiohttp.ClientSession] = None
        self._session_lock = asyncio.Lock()
        self._register_sio_handlers()

        self.processing_task: Optional[asyncio.Task] = None
        self.status = AppState.STOPPED

    async def initialize_session(self):
        """Inicializa la sesión HTTP si es necesario."""
        await self._ensure_http_session()

    async def _ensure_http_session(self):
        """Asegura que la sesión HTTP esté creada y abierta."""
        async with self._session_lock:
            if self.http_session is None or self.http_session.closed:
                self.http_session = aiohttp.ClientSession()

    def _register_sio_handlers(self):
        """Registra los manejadores de eventos para el cliente Socket.IO."""
        @self.sio.event
        async def connect():
            """Manejador de evento cuando Socket.IO se conecta a Sebo."""
            print("Socket.IO connected to Sebo")
            await self.broadcast_to_ui({"event": "status_update", "sebo_connection": "connected"})

        @self.sio.event
        async def disconnect():
            """Manejador de evento cuando Socket.IO se desconecta de Sebo."""
            print("Socket.IO disconnected from Sebo")
            await self.broadcast_to_ui({"event": "status_update", "sebo_connection": "disconnected"})

        self.sio.on('spot-arb', self.on_spot_arb_data_method, namespace='/api/spot/arb')

    async def connect_and_print_sebo(self):
        """
        Se conecta al socket de Sebo al arrancar y muestra por consola los datos recibidos.
        """
        sebo_url = WEBSOCKET_URL

        async def print_handler(data):
            print("\n--- Datos recibidos de Sebo ---")
            print(json.dumps(data, indent=2))
            print("--------------------------------\n")

        self.sio.on('spot-arb', print_handler, namespace='/api/spot/arb')

        try:
            await self._ensure_http_session()
            print(f"Conectando al socket de Sebo en {sebo_url}...")
            await self.sio.connect(sebo_url, namespaces=['/api/spot/arb'])
            print("Conectado al socket de Sebo. Esperando datos...")
            await self.sio.wait()
        except Exception as e:
            print(f"Error al conectar o recibir datos de Sebo: {e}")

    async def on_spot_arb_data_method(self, data):
        """Procesa los datos de oportunidades de arbitraje recibidos desde Sebo y los transmite a la UI."""
        print("\n--- Oportunidad de Arbitraje Recibida de Sebo ---")
        print(json.dumps(data, indent=2))
        print("---------------------------------------------------\n")
        symbol_str = data.get('symbol', 'N/A')
        # Inicializa el diccionario de entrada para IA con el símbolo recibido
        ai_input_dict = {'symbol': symbol_str}
        last = await get_last_balance(self.http_session)
        self.usdt_holder_exchange_id = last.get('usdt_holder_exchange_id')
        self.last_balance = last.get('last_balance', 0.0)
        # Obtiene el balance actual del usdt_holder_exchange desde el endpoint de Sebo
        ai_input_dict['usdt_holder_balance'] = self.last_balance
        try:
            # ... lógica de procesamiento ... 
            # if not self.usdt_holder_exchange_id: raise Exception("usdt_holder_exchange_id not configured.")
            # if not await self.load_balance_config(self.usdt_holder_exchange_id): raise Exception("Could not load balance config.")
            usdt_withdrawal_info = await get_usdt_withdrawal_info(self.http_session, self.usdt_holder_exchange_id)
            ai_input_dict.update({
                'analysis_id': data.get('analysis_id'), 'symbol': symbol_str,
                'determined_investment_usdt_v2': 100.0
            })
            profitability_results = calculate_net_profitability(ai_input_dict, 100.0)
            ai_input_dict['net_profitability_results'] = profitability_results
            if profitability_results.get("error_message"): raise Exception(profitability_results["error_message"])
            prediction_result = self.model.predict(ai_input_dict)
            ai_input_dict['ai_model_prediction'] = prediction_result[0] if prediction_result else 0
            simulation_results = await evaluate_and_simulate_arbitrage(ai_input_dict, self)
            ai_input_dict['simulation_results'] = simulation_results
        except Exception as e:
            error_message_for_log = f"Error during processing V2 for {symbol_str}: {e}"
            print(error_message_for_log)
            if 'net_profitability_results' not in ai_input_dict: ai_input_dict['net_profitability_results'] = {}
            if 'simulation_results' not in ai_input_dict: ai_input_dict['simulation_results'] = {}
            ai_input_dict['net_profitability_results']['error_message'] = str(e)
            ai_input_dict['simulation_results']['decision_outcome'] = "ERROR_PROCESSING_V2"
        finally:
            # --- Enriched broadcast to UI ---
            message_to_ui = {
                "event": "arbitrage_opportunity",
                "data": ai_input_dict,
                "model_status": self.model.get_status() # Include model status
            }
            await self.broadcast_to_ui(message_to_ui)

            try:
                await log_operation_to_csv(ai_input_dict, "logs/v2_operation_logs.csv")
            except Exception as log_e:
                print(f"V2: {symbol_str} | Error saving final log: {log_e}")

    async def start_processing(self):
        """Inicia el procesamiento de oportunidades de arbitraje conectándose a Sebo y esperando datos."""
        if self.status == AppState.RUNNING:
            print("Processing is already running.")
            return

        self.status = AppState.STARTING
        print("Starting arbitrage processing...")
        await self.broadcast_to_ui({"event": "status_update", "app_status": self.status})

        sebo_url = WEBSOCKET_URL
        try:
            await self._ensure_http_session()
            print(f"Connecting to Sebo Socket.IO at {sebo_url}...")
            await self.sio.connect(sebo_url, namespaces=['/api/spot/arb'])
            self.status = AppState.RUNNING
            print("Arbitrage processing started.")
            await self.broadcast_to_ui({"event": "status_update", "app_status": self.status})
            await self.sio.wait()
        except SocketIOConnectionError as e:
            print(f"Socket.IO connection error with Sebo: {e}")
            self.status = AppState.STOPPED
        except Exception as e:
            print(f"An error occurred in the processing loop: {e}")
            self.status = AppState.STOPPED
        finally:
            print("Processing loop has ended.")
            if self.sio.connected:
                await self.sio.disconnect()
            self.status = AppState.STOPPED
            await self.broadcast_to_ui({"event": "status_update", "app_status": self.status, "sebo_connection": "disconnected"})

    async def stop_processing(self):
        """Detiene el procesamiento de oportunidades de arbitraje y desconecta de Sebo."""
        if self.status == AppState.STOPPED:
            print("Processing is not running.")
            return

        self.status = AppState.STOPPING
        print("Stopping arbitrage processing...")
        await self.broadcast_to_ui({"event": "status_update", "app_status": self.status})

        if self.processing_task:
            self.processing_task.cancel()
            try:
                await self.processing_task
            except asyncio.CancelledError:
                print("Processing task cancelled.")

        if self.sio.connected:
            await self.sio.disconnect()
            print("Socket.IO disconnected.")

        self.processing_task = None
        self.status = AppState.STOPPED
        print("Arbitrage processing stopped.")
        await self.broadcast_to_ui({"event": "status_update", "app_status": self.status})

    async def broadcast_to_ui(self, message_data):
        """Envía un mensaje a todos los clientes UI conectados por WebSocket."""
        if not self.ui_clients:
            return

        message_json = json.dumps(message_data, default=str) # Use default=str for non-serializable data

        disconnected_clients = set()
        for client in self.ui_clients:
            try:
                await client.send(message_json)
            except websockets.exceptions.ConnectionClosed:
                disconnected_clients.add(client)
            except Exception as e:
                print(f"Error sending to UI client: {e}")
                disconnected_clients.add(client)

        self.ui_clients.difference_update(disconnected_clients)

    async def start_ui_websocket_server(self):
        """Inicia el servidor WebSocket para la UI en el puerto configurado."""
        try:
            ui_port = int(UI_WEBSOCKET_URL.split(":")[-1].split("/")[0])
        except (ValueError, IndexError):
            print(f"Error parsing port from UI_WEBSOCKET_URL: '{UI_WEBSOCKET_URL}'. Defaulting to 3001.")
            ui_port = 3001

        async def ui_websocket_handler(websocket_client):
            """Manejador para cada cliente UI conectado por WebSocket."""
            print("UI client connected")
            self.ui_clients.add(websocket_client)
            try:
                # Send initial status on connect
                await websocket_client.send(json.dumps({
                    "event": "initial_status",
                    "app_status": self.status,
                    "model_status": self.model.get_status(),
                    "sebo_connection": "connected" if self.sio.connected else "disconnected"
                }))
                async for message in websocket_client:
                    print(f"Received message from UI client: {message}")
            except websockets.exceptions.ConnectionClosed:
                print("UI client disconnected.")
            finally:
                self.ui_clients.discard(websocket_client)
        print(f"Starting UI WebSocket server on ws://localhost:{ui_port}")
        server = await websockets.serve(ui_websocket_handler, "localhost", ui_port)
        return server

    async def close_resources(self):
        """Cierra todos los recursos abiertos: procesamiento, sesión HTTP y CCXT."""
        print("Closing all resources...")
        await self.stop_processing()
        if self.http_session and not self.http_session.closed:
            await self.http_session.close()
            print("aiohttp session closed.")
        await self.close_ccxt_instances()

    async def close_ccxt_instances(self):
        """Cierra todas las instancias de CCXT abiertas."""
        print("Closing CCXT instances...")
        for instance in self.ccxt_instances.values():
            if hasattr(instance, 'close') and asyncio.iscoroutinefunction(instance.close):
                try:
                    await instance.close()
                except Exception as e:
                    print(f"Error closing a CCXT instance: {e}")
        self.ccxt_instances.clear()
        print("All CCXT instances scheduled for closure.")

    # async def load_balance_config(self, exchange_id: str):
    #     """
    #     Carga la configuración de balance para un exchange consultando el endpoint /api/config.
    #     """
    #     await self._ensure_http_session()
    #     url = f"{SEBO_API_BASE_URL}/api/config"
    #     try:
    #         async with self.http_session.get(url, params={"exchange_id": exchange_id}) as resp:
    #                 self.current_balance_config = config
    #                 return True
    #             else:
    #                 print(f"Error loading config: HTTP {resp.status}")
    #                 return False
    #     except Exception as e:
    #         print(f"Exception loading config from {url}: {e}")
    #         return False

# --- FastAPI Lifecycle Events with Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Contexto de ciclo de vida de la aplicación FastAPI.
    Crea y limpia la instancia principal de CryptoArbitrageApp.
    """
    # --- Startup ---
    # Create the main application instance and attach it to the app state
    # This avoids global variables and uses FastAPI's state management.
    crypto_app_instance = CryptoArbitrageApp()
    app.state.crypto_app = crypto_app_instance
    
    await app.state.crypto_app.initialize_session()
    
    # Start the UI server as a background task
    asyncio.create_task(app.state.crypto_app.start_ui_websocket_server())
    print("FastAPI app started. UI WebSocket server is running in the background.")
    
    yield # The application runs here
    
    # --- Shutdown ---
    await app.state.crypto_app.close_resources()
    print("FastAPI app shutdown complete.")

app = FastAPI(
    title="Crypto Arbitrage V2 API",
    description="API para controlar y monitorear el bot de arbitraje de criptomonedas con IA.",
    version="2.0.0",
    lifespan=lifespan
)

# --- FastAPI Endpoints ---
@app.post("/start", status_code=202)
async def start_bot(request: Request):
    """Inicia el procesamiento de oportunidades de arbitraje.
    Lanza la tarea principal de procesamiento si no está ya corriendo.
    """
    crypto_app = request.app.state.crypto_app
    if crypto_app.status == AppState.RUNNING:
        raise HTTPException(status_code=400, detail="Processing is already running.")
    if crypto_app.processing_task and not crypto_app.processing_task.done():
        raise HTTPException(status_code=400, detail="A processing task is already active.")
        
    crypto_app.processing_task = asyncio.create_task(crypto_app.start_processing())
    return {"message": "Arbitrage processing initiated."}

@app.post("/stop", status_code=200)
async def stop_bot(request: Request):
    """Detiene el procesamiento de oportunidades de arbitraje.
    Cancela la tarea principal de procesamiento si está corriendo.
    """
    crypto_app = request.app.state.crypto_app
    if crypto_app.status == AppState.STOPPED:
        raise HTTPException(status_code=400, detail="Processing is not running.")
    
    await crypto_app.stop_processing()
    return {"message": "Arbitrage processing stopped."}

@app.get("/relay", status_code=200)
async def relay_sebo_data(request: Request):
    """
    Inicia la retransmisión de datos desde Sebo a la UI por WebSocket,
    sin procesar con IA ni lógica de arbitraje, solo reenvía los datos recibidos.
    """
    crypto_app = request.app.state.crypto_app

    # Si ya está conectado, no volver a conectar
    if crypto_app.sio.connected:
        return {"message": "Already relaying Sebo data."}

    async def relay_handler(data):
        # Simplemente retransmite los datos recibidos a la UI
        await crypto_app.broadcast_to_ui({
            "event": "sebo_relay",
            "data": data
        })

    # Registrar handler temporal para relay
    crypto_app.sio.on('spot-arb', relay_handler, namespace='/api/spot/arb')

    sebo_url = WEBSOCKET_URL
    try:
        await crypto_app._ensure_http_session()
        await crypto_app.sio.connect(sebo_url, namespaces=['/api/spot/arb'])
        # No hacer wait(), solo conectar y dejar que el relay funcione en background
        return {"message": "Started relaying Sebo data to UI WebSocket."}
    except Exception as e:
        return {"error": f"Failed to connect to Sebo: {e}"}

@app.get("/status", status_code=200)
async def get_status(request: Request):
    """Obtiene el estado actual de la aplicación y del modelo de IA.
    Devuelve información sobre el estado del bot, la conexión con Sebo,
    el estado del modelo y la cantidad de clientes UI conectados.
    """
    crypto_app = request.app.state.crypto_app
    return {
        "app_status": crypto_app.status,
        "sebo_connection": "connected" if crypto_app.sio.connected else "disconnected",
        "model_status": crypto_app.model.get_status(),
        "ui_clients_connected": len(crypto_app.ui_clients)
    }

@app.post("/train", status_code=202)
async def train_model(request: Request):
    """Inicia el proceso de entrenamiento del modelo de IA.
    Usa datos dummy para el ejemplo y ejecuta el entrenamiento en segundo plano,
    enviando actualizaciones de progreso por WebSocket a la UI.
    """
    crypto_app = request.app.state.crypto_app
    if crypto_app.model.status == "Training":
        raise HTTPException(status_code=400, detail="Model is already training.")
    
    # En una app real, aquí se cargarían los datos reales
    X_dummy = pd.DataFrame(np.random.rand(100, 6))
    y_dummy = pd.Series(np.random.randint(0, 2, 100))

    # El entrenamiento se ejecuta en background y notifica por WebSocket
    asyncio.create_task(crypto_app.model.train(
        X_dummy, y_dummy,
        epochs=20,
        progress_callback=crypto_app.broadcast_to_ui
    ))
    return {"message": "Model training initiated. See UI WebSocket for progress."}

@app.post("/test", status_code=202)
async def test_model(request: Request):
    """Inicia el proceso de evaluación (test) del modelo de IA.
    Usa datos dummy para el ejemplo y ejecuta la evaluación en segundo plano,
    enviando actualizaciones de progreso por WebSocket a la UI.
    """
    crypto_app = request.app.state.crypto_app
    if not crypto_app.model.is_trained:
        raise HTTPException(status_code=400, detail="Model is not trained. Cannot evaluate.")
    if crypto_app.model.status == "Evaluating":
        raise HTTPException(status_code=400, detail="Model is already being evaluated.")

    # Datos dummy para test
    X_test_dummy = pd.DataFrame(np.random.rand(50, 6))
    y_test_dummy = pd.Series(np.random.randint(0, 2, 50))

    asyncio.create_task(crypto_app.model.evaluate(
        X_test_dummy, y_test_dummy,
        progress_callback=crypto_app.broadcast_to_ui
    ))
    return {"message": "Model evaluation initiated. See UI WebSocket for results."}

if __name__ == "__main__":
    """
    Punto de entrada principal. Arranca el servidor FastAPI con Uvicorn en localhost:8000.
    Nota: Los métodos dummy de obtención de datos deben ser reemplazados por implementaciones reales.
    """
      # Start the connection to Sebo in the background
    uvicorn.run(app, host="127.0.0.1", port=8000)
    