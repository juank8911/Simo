# main.py

import asyncio
from datetime import datetime, timezone # Añadir timezone
import websockets # Ensure this is imported for the UI server
# import websockets.uri # This should remain commented or removed
import socketio # Ensure this is imported
import json
import ccxt.async_support as ccxt
import aiohttp
from arbitrage_executor import evaluate_and_simulate_arbitrage # Import the executor
from data_logger import log_operation_to_csv # Import the CSV logger
from config import WEBSOCKET_URL, UI_WEBSOCKET_URL # Updated config imports
# from model import ArbitrageModel # Keep for when model is used - Temporarily commented due to ImportError
from arbitrage_calculator import calculate_net_profitability
# Removed duplicate evaluate_and_simulate_arbitrage import

SEBO_API_BASE_URL = "http://localhost:3000/api"

class CryptoArbitrageApp:
    def __init__(self):
        self.exchanges = {}
        # self.model = ArbitrageModel() # Assuming model.py and class exist, can be uncommented later
        self.sio = socketio.AsyncClient(logger=False, engineio_logger=False) # Reduce verbosity
        self.ui_clients = set()
        self.ccxt_instances = {} # For caching CCXT instances
        self.current_balance_config = None # Will store Balance config from Sebo
        self.usdt_holder_exchange_id = "binance" # Placeholder, V2 needs to set this
        self.global_sl_active_flag = False # Flag for global stop-loss
        self.http_session = None # Added for shared aiohttp session
        self.latest_balances_from_sebo = None # To store balances received from Sebo
        self._register_sio_handlers()
        # self.load_exchanges() # Call removed
        # Cargar el modelo de IA si ya está entrenado
        # try:
        #     # self.model = ArbitrageModel() # Ensure this remains commented if not ready
        #     self.model.load_model() # Assuming model.py and class exist
        # except FileNotFoundError:
        #     print("Modelo de IA no encontrado. Por favor, entrene el modelo primero.")
        # except AttributeError: # If self.model is None
        #     print("Atributo de modelo no encontrado, posible problema con inicialización de modelo.")

    async def _ensure_http_session(self):
        if self.http_session is None or self.http_session.closed:
            self.http_session = aiohttp.ClientSession()

    def _register_sio_handlers(self):
        @self.sio.event
        async def connect():
            print("Socket.IO connected to Sebo")
            # No need to emit 'join_room' unless Sebo server expects it for namespaces

        @self.sio.event
        async def disconnect():
            print("Socket.IO disconnected from Sebo")

        # Register the instance method directly for the 'spot-arb' event
        self.sio.on('spot-arb', namespace='/api/spot/arb')(self.on_spot_arb_data_method)
        # Register new handler for 'balances-update' event from Sebo
        self.sio.on('balances-update', namespace='/api/spot/arb')(self.on_balances_update_from_sebo)

    async def on_balances_update_from_sebo(self, data):
        print(f"V2: Recibido 'balances-update' de Sebo: {data}")
        self.latest_balances_from_sebo = data # Store the received balances

        # Retransmit to UI clients
        ui_message = {
            "type": "full_balance_update_from_v2",
            "payload": self.latest_balances_from_sebo
        }
        await self.broadcast_to_ui(ui_message)
        print(f"V2: 'balances-update' retransmitido a clientes UI.")

    async def get_ccxt_exchange_instance(self, exchange_id: str):
        if exchange_id not in self.ccxt_instances:
            try:
                exchange_class = getattr(ccxt, exchange_id)
                instance = exchange_class({'enableRateLimit': True})
                self.ccxt_instances[exchange_id] = instance
            except AttributeError:
                print(f"V2: Error: Exchange CCXT '{exchange_id}' no soportado o nombre incorrecto.")
                return None
            except Exception as e:
                print(f"V2: Error creando instancia CCXT para {exchange_id}: {e}")
                return None
        return self.ccxt_instances[exchange_id]

    async def get_current_market_prices(self, exchange_id: str, symbol: str):
        exchange = await self.get_ccxt_exchange_instance(exchange_id)
        if not exchange:
            return None, None
        try:
            ticker = await exchange.fetch_ticker(symbol)
            return ticker.get('ask'), ticker.get('bid')
        except ccxt.NetworkError as e:
            print(f"V2: CCXT NetworkError Ticker {symbol}@{exchange_id}: {e}")
        except ccxt.ExchangeError as e:
            print(f"V2: CCXT ExchangeError Ticker {symbol}@{exchange_id}: {e}")
        except Exception as e:
            print(f"V2: CCXT Generic Error Ticker {symbol}@{exchange_id}: {e}")
        return None, None

    async def get_usdt_withdrawal_info(self, from_exchange_id: str):
        # (Contenido del método get_usdt_withdrawal_info como estaba antes)
        usdt_withdrawal_info = {
            "selected_network": None, "selected_fee": float('inf'), "all_networks": []
        }
        if not from_exchange_id: return usdt_withdrawal_info # Return early if no id
        api_url = f"{SEBO_API_BASE_URL}/exchanges/{from_exchange_id}/withdrawal-fees/USDT"
        try:
            await self._ensure_http_session()
            async with self.http_session.get(api_url) as response: # Use shared session
                    if response.status == 200:
                        data = await response.json()
                        if data and data.get('networks'):
                            usdt_withdrawal_info["all_networks"] = data['networks']
                            for net_info in data['networks']: # Corrected variable name
                                if net_info.get('active') and net_info.get('withdraw') and net_info.get('fee') is not None:
                                    fee = float(net_info['fee'])
                                    if fee < usdt_withdrawal_info["selected_fee"]:
                                        usdt_withdrawal_info["selected_fee"] = fee
                                        usdt_withdrawal_info["selected_network"] = net_info['network']
                            if usdt_withdrawal_info["selected_fee"] == float('inf'):
                                usdt_withdrawal_info["selected_fee"] = None # Set to None if no suitable fee found
                        else:
                            print(f"V2: No network info for USDT@{from_exchange_id} from Sebo.")
                    else:
                        print(f"V2: Error Sebo API USDT fees: {response.status} - {await response.text()}")
        except Exception as e:
            print(f"V2: Exception Sebo API USDT fees: {e}")
        return usdt_withdrawal_info

    async def load_balance_config(self, exchange_id: str):
        if not exchange_id:
            self.current_balance_config = None
            return False

        api_url = f"{SEBO_API_BASE_URL}/balances/exchange/{exchange_id}"
        try:
            await self._ensure_http_session()
            async with self.http_session.get(api_url) as response: # Use shared session
                    if response.status == 200:
                        self.current_balance_config = await response.json()
                        print(f"V2: Config Balance para {exchange_id} cargada: {self.current_balance_config.get('balance_usdt')} USDT")
                        return True
                    else: # Manejar 404 u otros errores
                        print(f"V2: Error cargando config Balance para {exchange_id} de Sebo: {response.status}")
                        self.current_balance_config = None # Asegurar que no haya config vieja
                        # Si es 404, V2 podría intentar crear un doc Balance con defaults via API
                        # if response.status == 404:
                        #    await self.create_default_balance_config_on_sebo(exchange_id)
                        return False
        except Exception as e:
            print(f"V2: Excepción al cargar config Balance para {exchange_id}: {e}")
            self.current_balance_config = None
            return False

    async def update_balance_on_sebo(self, exchange_id: str, new_balance_usdt: float, full_config_to_upsert: dict):
        if not exchange_id:
            print("V2_UpdateBalance: No exchange_id para actualizar balance en Sebo.")
            return False

        api_url = f"{SEBO_API_BASE_URL}/balances/exchange/{exchange_id}"

        payload = {**full_config_to_upsert}
        payload['balance_usdt'] = new_balance_usdt
        payload['id_exchange'] = exchange_id
        payload['timestamp'] = datetime.now(timezone.utc).isoformat()

        payload.pop('_id', None)
        payload.pop('__v', None)

        try:
            await self._ensure_http_session()
            async with self.http_session.put(api_url, json=payload) as response: # Use shared session
                    if response.status == 200:
                        updated_balance_doc = await response.json()
                        print(f"V2_UpdateBalance: Balance en Sebo para {exchange_id} actualizado. Nuevo balance: {updated_balance_doc.get('balance_usdt')}")
                        if exchange_id == self.usdt_holder_exchange_id:
                            self.current_balance_config = updated_balance_doc
                        return True
                    else:
                        print(f"V2_UpdateBalance: Error API Sebo actualizando balance para {exchange_id}: {response.status} - {await response.text()}")
                        return False
        except Exception as e:
            print(f"V2_UpdateBalance: Excepción actualizando balance para {exchange_id}: {e}")
            return False

    async def load_balance_config_for_exchange(self, exchange_id: str) -> dict | None:
        if not exchange_id: return None
        api_url = f"{SEBO_API_BASE_URL}/balances/exchange/{exchange_id}"
        try:
            await self._ensure_http_session()
            async with self.http_session.get(api_url) as response: # Use shared session
                    if response.status == 200:
                        return await response.json()
                    elif response.status == 404:
                        print(f"V2: No existe config de Balance para {exchange_id} en Sebo. Se usarán defaults para el primer registro.")
                        return {
                            "id_exchange": exchange_id,
                            "balance_usdt": 0,
                        }
                    else:
                        print(f"V2: Error API Sebo cargando config Balance para {exchange_id} (helper): {response.status}")
                        return None
        except Exception as e:
            print(f"V2: Excepción cargando config Balance para {exchange_id} (helper): {e}")
            return None

    async def on_spot_arb_data_method(self, data):
        """
        Handler for individual 'spot-arb' events from Sebo.
        With 'process_opportunity_batch' as the primary decision driver,
        this method is now mainly for logging or potential lightweight updates,
        not for initiating full analysis or trades.
        """
        symbol_str = data.get('symbol', 'N/A_INDIVIDUAL_EVENT')
        analysis_id = data.get('analysis_id', 'N/A_INDIVIDUAL_EVENT')

        # print(f"V2: Received individual 'spot-arb' event: ID={analysis_id}, Symbol={symbol_str}. Batch processor is primary for action.")

        # Potential future use: Update a live ticker or a more granular internal cache of opportunity details.
        # For now, just log receipt as the main decision logic is in process_opportunity_batch.
        # Avoid any heavy processing or trade initiation here to prevent conflicts with batch processing.
        pass

    # async def store_training_data(self, data_dict): # This was a placeholder, actual logging is now log_operation_to_csv
    #     pass

    # Old methods to be removed are below this line in the original file
    # The connect_and_process method is kept as it's essential for Socket.IO connection.
    # Methods like load_exchanges, fetch_spot_prices, _fetch_single_price, process_arb_data,
    # analyze_and_act, execute_arbitrage, request_top_opportunities will be removed.

    async def connect_and_process(self):
        # WEBSOCKET_URL is "ws://localhost:3000/api/spot/arb"
        # For python-socketio, the main URL is ws://localhost:3000
        # The namespace is /api/spot/arb
        sebo_url = "ws://localhost:3000" # Base URL for Socket.IO connection
        try:
            # The handlers are already registered in __init__ via _register_sio_handlers
            await self.sio.connect(sebo_url, namespaces=['/api/spot/arb'])
            await self.sio.wait() # Keep the client running and listening for events

        except socketio.exceptions.ConnectionError as e:
            print(f"Error de conexión Socket.IO con Sebo: {e}")
        except Exception as e: # Catch other potential exceptions
            print(f"Error en la conexión Socket.IO con Sebo: {e}")
        finally:
            if self.sio.connected:
                print("Desconectando Socket.IO...")
                await self.sio.disconnect()

    async def broadcast_to_ui(self, message_data):
        if not self.ui_clients:
            # print("No UI clients connected, not broadcasting.") # Optional log
            return

        # print(f"Broadcasting to {len(self.ui_clients)} UI client(s): {message_data}") # Can be noisy
        message_json = json.dumps(message_data)

        disconnected_clients = set()
        for client in self.ui_clients:
            try:
                await client.send(message_json)
            except websockets.exceptions.ConnectionClosed:
                print("Failed to send to a UI client, connection closed.")
                disconnected_clients.add(client)
            except Exception as e:
                print(f"Error sending to UI client: {e}")
                disconnected_clients.add(client)

        for client in disconnected_clients:
            self.ui_clients.discard(client) # Use discard to avoid KeyError if already removed

    async def start_ui_websocket_server(self):
        # Extraer el puerto de UI_WEBSOCKET_URL (ej. ws://localhost:3001/api/ui -> 3001)
        try:
            # Example: "ws://localhost:3031/api/spot/ui" -> 3031
            ui_port = int(UI_WEBSOCKET_URL.split(":")[-1].split("/")[0])
        except ValueError:
            print(f"Error al parsear puerto de UI_WEBSOCKET_URL: '{UI_WEBSOCKET_URL}'. Usando puerto por defecto 3001.")
            ui_port = 3001
        except Exception as e: # Catch other potential parsing errors
            print(f"Error inesperado al parsear UI_WEBSOCKET_URL ('{UI_WEBSOCKET_URL}'): {e}. Usando puerto por defecto 3001.")
            ui_port = 3001

        async def ui_websocket_handler(websocket_client, path):
            print(f"Cliente UI conectado (path: {path})")
            self.ui_clients.add(websocket_client)
            try:
                # Keep connection alive and handle incoming messages if any
                async for message in websocket_client:
                    # Process messages from UI if needed
                    print(f"Received message from UI client: {message}")
                    # Example: await self.handle_ui_message(message)
                    pass
            except websockets.exceptions.ConnectionClosed:
                print("Cliente UI desconectado.")
            except Exception as e:
                print(f"Error en el handler del WebSocket de UI: {e}")
            finally:
                self.ui_clients.discard(websocket_client) # Use discard

        print(f"Iniciando servidor WebSocket para UI en ws://localhost:{ui_port}")
        # This relies on `import websockets` being active at the top of the file.
        # websockets.serve returns a Server object which can be awaited to keep it running,
        # but asyncio.gather will manage its task.
        await websockets.serve(ui_websocket_handler, "localhost", ui_port)

    async def close_http_session(self):
        if self.http_session and not self.http_session.closed:
            await self.http_session.close()
            print("V2: Sesión aiohttp cerrada.")

    async def close_ccxt_instances(self):
        print("V2: Cerrando instancias CCXT...")
        for exchange_id, instance in self.ccxt_instances.items():
            try:
                if hasattr(instance, 'close') and asyncio.iscoroutinefunction(instance.close):
                    await instance.close()
                # print(f"V2: Conexión CCXT cerrada para {exchange_id}")
            except Exception as e:
                print(f"V2: Error cerrando conexión CCXT para {exchange_id}: {e}")
        self.ccxt_instances.clear()
        print("V2: Todas las instancias CCXT programadas para cierre.")

async def main():
    app = CryptoArbitrageApp()
    try:
        await asyncio.gather(
            app.connect_and_process(),
            app.start_ui_websocket_server()
        )
    except KeyboardInterrupt:
        print("V2: Aplicación interrumpida.")
    finally:
        await app.close_http_session() # Close aiohttp session
        await app.close_ccxt_instances()

if __name__ == "__main__":
    asyncio.run(main())