# main.py

import asyncio
import websockets
import json
import ccxt.async_support as ccxt
import aiohttp
from aiohttp import web
from config import WEBSOCKET_URL, UI_WEBSOCKET_URL, TOP_OPPORTUNITY_URL, API_KEYS, MIN_PROFIT_PERCENTAGE, EXCHANGE_NAMES
from .model import ArbitrageModel, generate_sample_data

class CryptoArbitrageApp:
    async def __init__(self): # Changed to async to allow await for load_model
        self.exchanges = {}
        self.model = ArbitrageModel()
        self.load_exchanges()
        # Cargar el modelo de IA si ya está entrenado
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self.model.load_model)
            print("Modelo de IA cargado.")
        except FileNotFoundError:
            print("Modelo de IA no encontrado. Por favor, entrene el modelo primero.")
        except Exception as e:
            print(f"Error al cargar el modelo de IA: {e}")

    def load_exchanges(self):
        # Inicializar los exchanges de CCXT
        # Asegúrate de que las claves de API estén configuradas en config.py
        exchange_names = EXCHANGE_NAMES # Agrega aquí los exchanges que vayas a usar
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
        uri = WEBSOCKET_URL
        async with websockets.connect(uri) as websocket:
            print(f"Conectado al WebSocket: {uri}")
            try:
                async for message in websocket:
                    data = json.loads(message)
                    print(f"Datos recibidos: {data}")
                    
                    # Procesar los datos recibidos
                    processed_data = await self.process_arb_data(data)
                    print(f"Datos procesados: {processed_data}")
                    
                    # Aquí se integraría la lógica de IA y trading
                    await self.analyze_and_act(processed_data)

            except websockets.exceptions.ConnectionClosedOK:
                print("Conexión WebSocket cerrada limpiamente.")
            except Exception as e:
                print(f"Error en la conexión WebSocket: {e}")

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
                await self.simulate_arbitrage_operation(symbol, ex_val_min, ex_val_max, val_min, val_max, difer_percentage)
                
            else:
                print(f"Diferencia para {symbol} ({difer_percentage:.2f}%) no es suficiente para arbitraje o la IA no predice ganancia. Buscando nuevas oportunidades...")
                await self.request_top_opportunities()

    async def simulate_arbitrage_operation(self, symbol, buy_exchange_name, sell_exchange_name, buy_price, sell_price, difer_percentage):
        print(f"Iniciando operación de arbitraje para {symbol}...")

        # Obtener costos de trading (fees) usando CCXT para ambos exchanges
        buy_exchange = self.exchanges.get(buy_exchange_name.lower())
        sell_exchange = self.exchanges.get(sell_exchange_name.lower())

        buy_fee = None
        sell_fee = None
        transfer_fee = None

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

        # Las variables buy_fee, sell_fee y transfer_fee quedan disponibles para su uso posterior

        # Manejo de None para fees y conversión a float
        if buy_fee is None:
            print(f"Advertencia: buy_fee para {symbol} en {buy_exchange_name} no fue obtenido. Usando 0.0 para el cálculo.")
            buy_fee_calc = 0.0
        else:
            buy_fee_calc = float(buy_fee)

        if sell_fee is None:
            print(f"Advertencia: sell_fee para {symbol} en {sell_exchange_name} no fue obtenido. Usando 0.0 para el cálculo.")
            sell_fee_calc = 0.0
        else:
            sell_fee_calc = float(sell_fee)

        if transfer_fee is None:
            print(f"Advertencia: transfer_fee para {symbol} desde {buy_exchange_name} no fue obtenido. Usando 0.0 para el cálculo.")
            transfer_fee_abs = 0.0
        else:
            transfer_fee_abs = float(transfer_fee) # Asegurar que sea float

        # Calcular costos absolutos por unidad de activo
        cost_compra_abs = buy_price * buy_fee_calc
        cost_venta_abs = sell_price * sell_fee_calc # Asume que sell_fee_calc se aplica al precio de venta de una unidad

        # Calcular Ganancia/Pérdida Bruta Absoluta por unidad de activo
        ganancia_bruta_unitaria_abs = sell_price - buy_price
        
        # Calcular Ganancia/Pérdida Neta Absoluta por unidad de activo
        ganancia_neta_unitaria_abs = ganancia_bruta_unitaria_abs - cost_compra_abs - cost_venta_abs - transfer_fee_abs

        # Calcular Porcentaje de Ganancia Neta sobre el precio de compra
        if buy_price > 0:
            net_profit_percentage = (ganancia_neta_unitaria_abs / buy_price) * 100
        else:
            net_profit_percentage = 0.0 # O manejar como un error/imposibilidad de calcular
            print(f"Error: buy_price es 0 para {symbol} en {buy_exchange_name}. No se puede calcular el porcentaje de ganancia neta.")

        # Imprimir información detallada de costos y ganancias
        print(f"Detalle de Operación para {symbol} ({buy_exchange_name} -> {sell_exchange_name}):")
        print(f"  Precios: Compra={buy_price:.6f}, Venta={sell_price:.6f}")
        print(f"  Fees (Tasas/Abs): Compra Tasa={buy_fee_calc:.4f}, Venta Tasa={sell_fee_calc:.4f}, Transferencia Abs={transfer_fee_abs:.6f}")
        print(f"  Costos Absolutos Unitarios: Compra={cost_compra_abs:.6f}, Venta={cost_venta_abs:.6f}")
        print(f"  Ganancia Bruta Unitaria (abs): {ganancia_bruta_unitaria_abs:.6f}")
        print(f"  Ganancia Neta Unitaria (abs): {ganancia_neta_unitaria_abs:.6f}")
        print(f"  Ganancia Neta Esperada (porcentaje): {net_profit_percentage:.2f}%")

        if net_profit_percentage > MIN_PROFIT_PERCENTAGE: # Comparar con MIN_PROFIT_PERCENTAGE
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

    async def start_ui_websocket_server(self):
        # Extraer el puerto de UI_WEBSOCKET_URL (ej. ws://localhost:3001/api/ui -> 3001)
        # Asumo que UI_WEBSOCKET_URL tendrá el formato correcto para extraer el puerto
        # Si el formato es diferente, esta lógica necesitará ser ajustada.
        try:
            # Parsear la URL para obtener el puerto
            parsed_url = websockets.uri.parse_uri(UI_WEBSOCKET_URL)
            print(f"Parsed UI_WEBSOCKET_URL: {parsed_url}")
            ui_port = parsed_url.port
            if ui_port is None:
                # Si no se especifica el puerto, usar el puerto por defecto para ws (80) o wss (443)
                # Para desarrollo local, asumiremos un puerto por defecto si no está en la URL
                ui_port = 8000 # Puerto por defecto para el servidor UI si no está en la URL
        except Exception as e:
            print(f"Error al parsear UI_WEBSOCKET_URL: {e}. Usando puerto por defecto 3001.")
            ui_port = 8000

        async def handler(websocket):
            print("Cliente UI conectado.")
            try:
                while True:
                    # Aquí enviarías los datos procesados a la UI
                    # Por ejemplo, cada cierto tiempo o cuando haya nuevas oportunidades
                    # await websocket.send(json.dumps({"status": "running", "data": "some_data"}))
                    await asyncio.sleep(5) # Envía datos cada 5 segundos (ejemplo)
            except websockets.exceptions.ConnectionClosedOK:
                print("Cliente UI desconectado limpiamente.")
            except Exception as e:
                print(f"Error en el servidor WebSocket de UI: {e}")

        print(f"Iniciando servidor WebSocket para UI en ws://localhost:{ui_port}")
        # Iniciar el servidor WebSocket en el puerto extraído o por defecto
        await websockets.serve(handler, "localhost", ui_port)

    async def train_ia_model(self):
        try:
            print("Iniciando generación de datos y entrenamiento del modelo de IA...")
            # Generar datos de ejemplo
            # Nota: El número de muestras (e.g., 500) podría ser configurable en el futuro.
            training_data = generate_sample_data(500)

            # Añadir datos al modelo. self.model es una instancia de ArbitrageModel.
            # add_data no es async, así que se llama directamente.
            self.model.add_data(training_data)

            print("Datos generados y añadidos. Procediendo a entrenar el modelo...")
            # train_model no es async, ejecutar en un executor para no bloquear el event loop.
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self.model.train_model)
            # self.model.train_model() ya guarda el modelo internamente.

            print("Entrenamiento del modelo de IA completado.")
            # Considerar: Notificar a la UI/cliente vía WebSocket si es necesario.
        except Exception as e:
            print(f"Error durante el proceso de entrenamiento del modelo de IA: {e}")
            # Considerar: Notificar a la UI/cliente sobre el error.

# Definir handle_train_model_request fuera de la clase
async def handle_train_model_request(request):
    app_instance = request.app['crypto_app']
    try:
        # Crear una tarea para que el entrenamiento se ejecute en segundo plano
        asyncio.create_task(app_instance.train_ia_model())
        return web.json_response({"message": "Entrenamiento del modelo iniciado."}, status=202)
    except Exception as e:
        print(f"Error al iniciar el entrenamiento: {e}")
        return web.json_response({"error": str(e)}, status=500)

async def main():
    # app ahora se inicializa de forma asíncrona
    app = await CryptoArbitrageApp()

    # Configurar y arrancar servidor HTTP API con aiohttp
    http_server_app = web.Application()
    http_server_app['crypto_app'] = app  # Store the app instance for access in handlers
    http_server_app.router.add_post('/api/model/train', handle_train_model_request)
    
    runner = web.AppRunner(http_server_app)
    await runner.setup()
    # Usar un puerto diferente al de la UI WebSocket y al de Sebo
    # Por ejemplo, 8080 para esta API de backend.
    site = web.TCPSite(runner, 'localhost', 8080)
    await site.start()
    print(f"Servidor HTTP API para V2 iniciado en http://localhost:8080")

    # Tareas principales de la aplicación (consumidor de WebSocket, servidor UI WebSocket)
    main_tasks = [
        app.connect_and_process(),
    ]
    # Verificar si app.start_ui_websocket_server está definido y agregarlo
    # La implementación actual de start_ui_websocket_server es síncrona en su definición externa
    # pero se llama con await websockets.serve que es asíncrono.
    # La lógica de la tarea original es:
    # #app.start_ui_websocket_server() # Descomentar cuando se implemente el servidor de UI en un puerto diferente
    # Lo mantendremos comentado como en el original, pero si se descomenta, debe ser llamado correctamente.
    if hasattr(app, 'start_ui_websocket_server') and callable(app.start_ui_websocket_server):
        main_tasks.append(app.start_ui_websocket_server()) # Asegurarse que este método sea async o se llame apropiadamente
    else:
        print("Advertencia: app.start_ui_websocket_server no está disponible para iniciar o no está configurado para ejecutarse.")

    try:
        await asyncio.gather(*main_tasks)
    except KeyboardInterrupt:
        print("V2 Aplicación interrumpida por el usuario.")
    finally:
        print("Cerrando recursos de V2...")
        await runner.cleanup() # Limpiar el runner del servidor HTTP
        # Aquí también se deberían cerrar otros recursos de 'app' si es necesario
        # Ejemplo: if hasattr(app, 'close_resources'): await app.close_resources()
        # Asegurarse de que los exchanges de ccxt se cierren si es necesario
        for ex_name, exchange in app.exchanges.items():
            if hasattr(exchange, 'close'):
                try:
                    await exchange.close()
                    print(f"Conexión con {ex_name} cerrada.")
                except Exception as e:
                    print(f"Error cerrando conexión con {ex_name}: {e}")
        print("Recursos de V2 cerrados.")

if __name__ == "__main__":
    asyncio.run(main())
