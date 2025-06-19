# main.py

import asyncio
import websockets # Ensure this is imported for the UI server
# import websockets.uri # This should remain commented or removed
import socketio # Ensure this is imported
import json
import ccxt.async_support as ccxt
import aiohttp
from config import WEBSOCKET_URL, UI_WEBSOCKET_URL, TOP_OPPORTUNITY_URL, API_KEYS, MIN_PROFIT_PERCENTAGE
from model import ArbitrageModel

class CryptoArbitrageApp:
    def __init__(self):
        self.exchanges = {}
        self.model = ArbitrageModel()
        self.sio = socketio.AsyncClient(logger=True, engineio_logger=True)
        self.ui_clients = set() # Added for managing UI WebSocket clients
        self._register_sio_handlers()
        self.load_exchanges()
        # Cargar el modelo de IA si ya está entrenado
        try:
            self.model.load_model()
        except FileNotFoundError:
            print("Modelo de IA no encontrado. Por favor, entrene el modelo primero.")

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

    async def on_spot_arb_data_method(self, data): # 'data' es ahora el JSON enriquecido
        print(f"V2: Datos enriquecidos recibidos de Sebo (spot-arb): {data.get('symbol')} dif: {data.get('percentage_difference')}")

        # 'data' ahora contiene:
        # analysis_id, symbol, symbol_name, exchange_min_id, exchange_min_name,
        # exchange_max_id, exchange_max_name, price_at_exMin_to_buy_asset,
        # price_at_exMax_to_sell_asset, percentage_difference,
        # fees_exMin: { taker_fee, maker_fee, withdrawal_fee_asset, withdrawal_network },
        # fees_exMax: { taker_fee, maker_fee },
        # timestamp

        # TODO: Lógica para obtener el `txTrOutSell` inicial (retiro de USDT)
        # Esto implica:
        # 1. Leer de la colección `Balance` para saber desde qué `id_exchange` retirar USDT.
        #    (Por ahora, podemos simular esto o V2 necesitará acceso a MongoDB
        #     o un endpoint de Sebo para leer su propio balance).
        #    Ejemplo simulado:
        current_usdt_balance_exchange_id = "binance" # Simulado - V2 debería obtener esto de la BD 'Balance'
                                                     # o a través de una configuración/API de V2.

        usdt_withdrawal_fees_data = None
        if current_usdt_balance_exchange_id:
            try:
                # El puerto 3000 es donde corre Sebo
                sebo_api_url = f"http://localhost:3000/api/exchanges/{current_usdt_balance_exchange_id}/withdrawal-fees/USDT"
                async with aiohttp.ClientSession() as session:
                    async with session.get(sebo_api_url) as response:
                        if response.status == 200:
                            usdt_withdrawal_fees_data = await response.json()
                            print(f"V2: Comisiones de retiro de USDT desde {current_usdt_balance_exchange_id}: {usdt_withdrawal_fees_data}")
                            # Aquí, la IA necesitaría seleccionar la red óptima y su fee.
                        else:
                            print(f"V2: Error al obtener comisiones de retiro de USDT de Sebo: Status {response.status} - {await response.text()}")
            except Exception as e:
                print(f"V2: Excepción al obtener comisiones de retiro de USDT de Sebo: {e}")

        # Ahora 'data' tiene las comisiones de la oportunidad (exMin, exMax)
        # y 'usdt_withdrawal_fees_data' tiene las opciones para el retiro inicial de USDT.
        # La IA puede proceder a calcular la rentabilidad neta y tomar decisiones.

        # La llamada a self.process_arb_data y self.analyze_and_act necesitarán ser adaptadas
        # para usar esta estructura de datos más rica.
        # Por ahora, solo imprimimos para verificar y se comenta la lógica anterior.

        # print(f"V2: Oportunidad original: {data}") # Puede ser muy verboso
        # print(f"V2: Comisiones USDT: {usdt_withdrawal_fees_data}") # Ya se imprime arriba

        # Ejemplo de cómo podrías pasar los datos (esto es conceptual para el futuro)
        # if data and usdt_withdrawal_fees_data:
        #     # Aquí se necesitaría una nueva función o adaptar las existentes.
        #     # Por ejemplo, una función que combine 'data' y 'usdt_withdrawal_fees_data'
        #     # para calcular la rentabilidad neta final.
        #     # full_opportunity_details = {**data, "usdt_withdrawal_options": usdt_withdrawal_fees_data}
        #     # await self.evaluate_full_opportunity(full_opportunity_details)
        #     pass


        # Las siguientes líneas deben ser adaptadas o reemplazadas por la nueva lógica de IA
        # que considera todas las comisiones.
        # processed_data = await self.process_arb_data(data) # Firma y lógica obsoletas
        # print(f"Datos procesados (lógica antigua): {processed_data}")
        # await self.analyze_and_act(processed_data) # Firma y lógica obsoletas

        # Broadcast de los datos enriquecidos (o un resumen) a la UI de V2 si es necesario.
        # La UI de V2 actualmente no está diseñada para este nivel de detalle, pero podría serlo.
        # Por ahora, la UI de V2 (localhost:3031) recibe datos de arbitraje básicos de Sebo.
        # Si V2 tuviera su propia UI que necesitara estos datos enriquecidos, aquí se enviarían.
        # await self.broadcast_to_ui({"type": "v2_detailed_opportunity_analysis", "payload": data_combinada_con_usdt_fees})

        print(f"V2: Fin del manejo de oportunidad para {data.get('symbol')}. Lógica de procesamiento y acción con comisiones completas pendiente.")


    def load_exchanges(self):
        # Inicializar los exchanges de CCXT
        # Asegúrate de que las claves de API estén configuradas en config.py
        exchange_names = ["binance", "okx"] # Agrega aquí los exchanges que vayas a usar
        for name in exchange_names:
            exchange_class = getattr(ccxt, name)
            self.exchanges[name] = exchange_class({
                'apiKey': API_KEYS.get(f'{name.upper()}_API_KEY'),
                'secret': API_KEYS.get(f'{name.upper()}_SECRET_KEY'),
                'enableRateLimit': True,
                'options': {
                    'defaultType': 'spot',
                },
            })

    async def fetch_spot_prices(self, symbol, exchange_list):
        prices = {}
        tasks = []
        for exchange_name in exchange_list:
            exchange = self.exchanges.get(exchange_name.lower())
            if exchange:
                tasks.append(self._fetch_single_price(exchange, symbol, exchange_name))
            else:
                print(f"Exchange {exchange_name} no configurado.")
        results = await asyncio.gather(*tasks)
        for exchange_name, price in results:
            if price is not None:
                prices[exchange_name] = price
        return prices

    async def _fetch_single_price(self, exchange, symbol, exchange_name):
        try:
            ticker = await exchange.fetch_ticker(symbol)
            return exchange_name, ticker['last']
        except Exception as e:
            print(f"Error al obtener el precio de {symbol} en {exchange_name}: {e}")
            return exchange_name, None

    async def process_arb_data(self, data):
        processed_data = []
        for item in data:
            symbol = item["symbol"]
            exchanges_raw = item["exchanges"]
            
            # Asegurarse de que los nombres de los exchanges sean consistentes (ej. minúsculas)
            exchanges_formatted = [e.lower() for e in exchanges_raw]

            # Obtener precios actuales de los exchanges usando CCXT
            current_prices = await self.fetch_spot_prices(symbol, exchanges_formatted)
            
            if not current_prices:
                print(f"No se pudieron obtener precios para {symbol}. Saltando este par.")
                continue

            # Encontrar el valor mínimo y máximo y sus respectivos exchanges
            val_min = float('inf')
            val_max = float('-inf')
            ex_val_min = None
            ex_val_max = None

            for ex_name, price in current_prices.items():
                if price < val_min:
                    val_min = price
                    ex_val_min = ex_name
                if price > val_max:
                    val_max = price
                    ex_val_max = ex_name

            # Calcular el porcentaje de diferencia
            difer_percentage = 0
            if val_min > 0:
                difer_percentage = ((val_max - val_min) / val_min) * 100

            # Construir el formato de salida
            output_item = {
                "symbol": symbol,
                "difer": f"{difer_percentage:.2f}%",
                "valMin": val_min,
                "valMax": val_max,
                "exValMin": ex_val_min,
                "exValMax": ex_val_max
            }
            # Agregar los precios de cada exchange al output_item
            for ex_name, price in current_prices.items():
                output_item[ex_name] = price
            
            processed_data.append(output_item)
        return processed_data

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

    async def analyze_and_act(self, processed_data):
        for item in processed_data:
            symbol = item["symbol"]
            difer_str = item["difer"]
            difer_percentage = float(difer_str.replace("%", ""))
            val_min = item["valMin"]
            val_max = item["valMax"]
            ex_val_min = item["exValMin"]
            ex_val_max = item["exValMax"]

            # Preparar datos para la predicción del modelo de IA
            prediction_input = {
                'valMin': val_min,
                'valMax': val_max
            }

            predicted_difer = None
            try:
                predicted_difer = self.model.predict(prediction_input)
                print(f"Predicción del modelo para {symbol}: {predicted_difer*100:.2f}%")
            except ValueError as e:
                print(f"Error al predecir con el modelo: {e}. Asegúrese de que el modelo esté entrenado.")
                # Si el modelo no está entrenado, no podemos usar su predicción, así que continuamos con la lógica básica.

            # Lógica de decisión de la IA
            # Si el porcentaje de diferencia es mayor que el mínimo requerido
            # O si el modelo predice una ganancia significativa (ajustar umbral según sea necesario)
            if difer_percentage > MIN_PROFIT_PERCENTAGE or (predicted_difer is not None and predicted_difer * 100 > MIN_PROFIT_PERCENTAGE):
                print(f"Oportunidad de arbitraje para {symbol} con {difer_percentage:.2f}% de diferencia. Analizando...")
                # Aquí iría la lógica de compra/venta y transferencia
                await self.execute_arbitrage(symbol, ex_val_min, ex_val_max, val_min, val_max, difer_percentage)
                
            else:
                print(f"Diferencia para {symbol} ({difer_percentage:.2f}%) no es suficiente para arbitraje o la IA no predice ganancia. Buscando nuevas oportunidades...")
                await self.request_top_opportunities()

    async def execute_arbitrage(self, symbol, buy_exchange_name, sell_exchange_name, buy_price, sell_price, difer_percentage):
        print(f"Iniciando operación de arbitraje para {symbol}...")

        # Obtener costos de trading (fees) usando CCXT para ambos exchanges
        buy_exchange = self.exchanges.get(buy_exchange_name.lower())
        sell_exchange = self.exchanges.get(sell_exchange_name.lower())

        buy_fee = 0.0 # Inicializar con 0.0 para evitar errores si no se encuentran
        sell_fee = 0.0 # Inicializar con 0.0 para evitar errores si no se encuentran
        transfer_fee = 0.0 # Inicializar con 0.0 para evitar errores si no se encuentran

        # Obtener fee de compra
        if buy_exchange:
            try:
                markets = await buy_exchange.load_markets()
                market = markets.get(symbol)
                if market and 'taker' in market['fees']['trading']:
                    buy_fee = market['fees']['trading']['taker']
                elif market and 'taker' in market:
                    buy_fee = market['taker']
            except Exception as e:
                print(f"Error obteniendo trading fee de compra en {buy_exchange_name}: {e}")

        # Obtener fee de venta
        if sell_exchange:
            try:
                markets = await sell_exchange.load_markets()
                market = markets.get(symbol)
                if market and 'taker' in market['fees']['trading']:
                    sell_fee = market['fees']['trading']['taker']
                elif market and 'taker' in market:
                    sell_fee = market['taker']
            except Exception as e:
                print(f"Error obteniendo trading fee de venta en {sell_exchange_name}: {e}")

        # Obtener fee de transferencia (retiro) desde el exchange de compra
        if buy_exchange:
            try:
                currency = symbol.split('/')[0]
                currencies = await buy_exchange.fetch_currencies()
                if currency in currencies and 'fee' in currencies[currency]:
                    transfer_fee = currencies[currency]['fee']
            except Exception as e:
                print(f"Error obteniendo withdrawal fee en {buy_exchange_name}: {e}")

        # Calcular costos de transacción usando los fees obtenidos
        # Asumimos que los fees son porcentajes (ej. 0.001 para 0.1%)
        cost_buy = buy_price * buy_fee
        cost_sell = sell_price * sell_fee
        cost_transfer = transfer_fee # Este fee suele ser fijo por retiro, no un porcentaje del valor

        # Calcular la ganancia neta en términos absolutos
        # Cantidad de moneda base comprada (ej. BTC) con 1 USDT de inversión (simplificado)
        # Esto es una simplificación, en la realidad se compraría una cantidad fija de moneda base
        # y se calcularía el costo en USDT.
        # Para el cálculo de arbitraje, nos interesa la diferencia de precios y los costos asociados.
        
        # Ganancia bruta en USDT por unidad de moneda base
        gross_profit_absolute = sell_price - buy_price
        
        # Costo total de la operación por unidad de moneda base
        # Aquí se asume que los fees de compra/venta se aplican al valor de la operación
        # y el fee de transferencia es un costo fijo.
        total_cost_absolute = cost_buy + cost_sell + cost_transfer
        
        net_profit_absolute = gross_profit_absolute - total_cost_absolute
        
        # Calcular la ganancia neta porcentual sobre el precio de compra
        net_profit_percentage = (net_profit_absolute / buy_price) * 100 if buy_price > 0 else 0
        
        print(f"Ganancia bruta: {gross_profit_absolute:.6f} (abs)")
        print(f"Costo total de transacción: {total_cost_absolute:.6f} (abs)")
        print(f"Ganancia neta esperada: {net_profit_percentage:.2f}%")

        if net_profit_percentage > 0:
            print(f"La operación generaría ganancias netas. Procediendo con la compra...")
            
            # Paso 1: Realizar la compra en el exchange con el valor más bajo
            buy_exchange = self.exchanges.get(buy_exchange_name.lower())
            if buy_exchange:
                try:
                    # Simulación de orden de compra
                    # order = await buy_exchange.create_market_buy_order(symbol, amount)
                    print(f"Comprado {symbol} en {buy_exchange_name} a {buy_price}")
                    
                    # Paso 2: Simular transferencia al otro exchange (esto es complejo y depende de la API del exchange)
                    # En un entorno real, esto implicaría retirar de un exchange y depositar en otro.
                    # Esto puede tomar tiempo y tiene sus propios costos y riesgos.
                    print(f"Simulando transferencia de {symbol} de {buy_exchange_name} a {sell_exchange_name}...")
                    await asyncio.sleep(2) # Simular tiempo de transferencia
                    print(f"Transferencia de {symbol} completada a {sell_exchange_name}.")
                    
                    # Paso 3: Vender en el otro exchange
                    sell_exchange = self.exchanges.get(sell_exchange_name.lower())
                    if sell_exchange:
                        try:
                            # Simulación de orden de venta
                            # order = await sell_exchange.create_market_sell_order(symbol, amount)
                            print(f"Vendido {symbol} en {sell_exchange_name} a {sell_price}")
                            print(f"Operación de arbitraje para {symbol} completada con ganancia neta de {net_profit_percentage:.2f}%")
                        except Exception as e:
                            print(f"Error al vender {symbol} en {sell_exchange_name}: {e}")
                    else:
                        print(f"Exchange de venta {sell_exchange_name} no configurado.")
                except Exception as e:
                    print(f"Error al comprar {symbol} en {buy_exchange_name}: {e}")
            else:
                print(f"Exchange de compra {buy_exchange_name} no configurado.")
        else:
            print(f"La operación para {symbol} no generaría ganancias netas ({net_profit_percentage:.2f}%). Volviendo a la búsqueda de oportunidades.")
            await self.request_top_opportunities()

    async def request_top_opportunities(self):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(TOP_OPPORTUNITY_URL) as response:
                    if response.status == 200:
                        data = await response.json()
                        print(f"Respuesta de top opportunities: {data}")
                        # Aquí podrías procesar las nuevas oportunidades y agregarlas a la cola de procesamiento
                    else:
                        print(f"Error al solicitar top opportunities: {response.status} - {await response.text()}")
        except Exception as e:
            print(f"Error al solicitar top opportunities: {e}")

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

async def main(): 
    app = CryptoArbitrageApp()
    
    # Iniciar el cliente Socket.IO para Sebo y el servidor WebSocket para la UI en paralelo.
    await asyncio.gather(
        app.connect_and_process(),      # Socket.IO client for Sebo
        app.start_ui_websocket_server() # websockets server for UI
    )

if __name__ == "__main__":
    asyncio.run(main())