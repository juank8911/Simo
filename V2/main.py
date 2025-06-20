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
from config import WEBSOCKET_URL, UI_WEBSOCKET_URL, TOP_OPPORTUNITY_URL, API_KEYS, MIN_PROFIT_PERCENTAGE
from model import ArbitrageModel
from arbitrage_calculator import calculate_net_profitability
# from arbitrage_executor import evaluate_and_simulate_arbitrage # Import the executor (already imported once)

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
        self._register_sio_handlers()
        # self.load_exchanges() # load_exchanges is not defined, can be removed if not used
        # Cargar el modelo de IA si ya está entrenado
        # try:
        #     self.model.load_model() # Assuming model.py and class exist
        # except FileNotFoundError:
        #     print("Modelo de IA no encontrado. Por favor, entrene el modelo primero.")
        # except AttributeError: # If self.model is None
        #     print("Atributo de modelo no encontrado, posible problema con inicialización de modelo.")


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
            async with aiohttp.ClientSession() as session:
                async with session.get(api_url) as response:
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
            async with aiohttp.ClientSession() as session:
                async with session.get(api_url) as response:
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
            async with aiohttp.ClientSession() as session:
                async with session.put(api_url, json=payload) as response:
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
            async with aiohttp.ClientSession() as session:
                async with session.get(api_url) as response:
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
        symbol_str = data.get('symbol', 'N/A')
        # print(f"V2: Oportunidad Sebo: {symbol_str}. Aplicando gestión de capital y riesgo...")

        if not self.usdt_holder_exchange_id:
            print(f"V2: {symbol_str} | Abortado: usdt_holder_exchange_id no configurado.")
            return

        config_loaded = await self.load_balance_config(self.usdt_holder_exchange_id)

        if not config_loaded or not self.current_balance_config:
            print(f"V2: {symbol_str} | Abortado: No se pudo cargar config de Balance para {self.usdt_holder_exchange_id}.")
            return

        # --- Monitor de Stop Loss Global ---
        if self.global_sl_active_flag:
            print(f"V2: {symbol_str} | SL GLOBAL ACTIVO. No se procesa.")
            return

        current_bal_usdt = float(self.current_balance_config.get('balance_usdt', 0))
        initial_cap_sl = float(self.current_balance_config.get('initial_capital_for_global_sl', 0))
        sl_global_perc = float(self.current_balance_config.get('stop_loss_percentage_global', 50))

        if initial_cap_sl > 0: # Only activate SL if initial capital is set
            sl_threshold = initial_cap_sl * (1 - (sl_global_perc / 100.0))
            if current_bal_usdt < sl_threshold:
                self.global_sl_active_flag = True
                print(f"V2: ALERTA STOP LOSS GLOBAL! Balance: {current_bal_usdt} < Umbral: {sl_threshold}. Capital Inicial: {initial_cap_sl}, SL: {sl_global_perc}%.")
                # TODO: Consider notifying admin/user
                return

        # --- Determinar Monto de Inversión ---
        amount_to_invest_usdt = 0.0
        investment_mode = self.current_balance_config.get('investment_mode', "FIXED")

        min_operational_usdt = 10.0 # Minimum amount to consider an operation viable
        if current_bal_usdt < min_operational_usdt:
             print(f"V2: {symbol_str} | Balance USDT ({current_bal_usdt:.2f}) demasiado bajo para operar (min: {min_operational_usdt:.2f}).")
             return

        if current_bal_usdt < 150: # If balance is low, use full available balance (respecting min_operational_usdt)
            amount_to_invest_usdt = current_bal_usdt
        else: # balance_usdt >= 150
            if investment_mode == "FIXED":
                fixed_inv = float(self.current_balance_config.get('fixed_investment_usdt', 50))
                amount_to_invest_usdt = fixed_inv
            elif investment_mode == "PERCENTAGE":
                percent = float(self.current_balance_config.get('investment_percentage', 10))
                calculated_amount = current_bal_usdt * (percent / 100.0)
                amount_to_invest_usdt = calculated_amount
            else: # Default to FIXED if mode is unknown
                fixed_inv = float(self.current_balance_config.get('fixed_investment_usdt', 50))
                amount_to_invest_usdt = fixed_inv

        practical_min_investment = 50.0
        if amount_to_invest_usdt < practical_min_investment and current_bal_usdt >= practical_min_investment :
             if current_bal_usdt >= 150 :
                 amount_to_invest_usdt = practical_min_investment

        amount_to_invest_usdt = min(amount_to_invest_usdt, current_bal_usdt)

        if amount_to_invest_usdt < min_operational_usdt:
            print(f"V2: {symbol_str} | Monto a invertir ({amount_to_invest_usdt:.2f}) bajo mínimo operacional ({min_operational_usdt:.2f}).")
            return

        usdt_withdrawal_info = await self.get_usdt_withdrawal_info(self.usdt_holder_exchange_id)

        ai_input_dict = {
            'analysis_id': data.get('analysis_id'),
            'symbol': data.get('symbol'),
            'symbol_name': data.get('symbol_name'),
            'fetch_timestamp_sebo': data.get('timestamp'),
            'ex_min_id_sebo': data.get('exchange_min_id'),
            'ex_min_name_sebo': data.get('exchange_min_name'),
            'price_ex_min_buy_asset_sebo': data.get('price_at_exMin_to_buy_asset'),
            'ex_min_taker_fee_rate_sebo': data.get('fees_exMin', {}).get('taker_fee'),
            'ex_min_maker_fee_rate_sebo': data.get('fees_exMin', {}).get('maker_fee'),
            'asset_withdrawal_fee_from_ex_min_sebo': data.get('fees_exMin', {}).get('withdrawal_fee_asset'),
            'asset_withdrawal_network_from_ex_min_sebo': data.get('fees_exMin', {}).get('withdrawal_network'),
            'ex_max_id_sebo': data.get('exchange_max_id'),
            'ex_max_name_sebo': data.get('exchange_max_name'),
            'price_ex_max_sell_asset_sebo': data.get('price_at_exMax_to_sell_asset'),
            'ex_max_taker_fee_rate_sebo': data.get('fees_exMax', {}).get('taker_fee'),
            'ex_max_maker_fee_rate_sebo': data.get('fees_exMax', {}).get('maker_fee'),
            'gross_percentage_diff_sebo': float(data.get('percentage_difference', '0%').replace('%','')) if data.get('percentage_difference') else 0.0,
            'initial_usdt_holder_exchange_id': self.usdt_holder_exchange_id,
            'initial_usdt_withdrawal_selected_fee': usdt_withdrawal_info.get('selected_fee'),
            'initial_usdt_withdrawal_selected_network': usdt_withdrawal_info.get('selected_network'),
            'initial_usdt_all_networks_info': usdt_withdrawal_info.get('all_networks'),
            'processing_timestamp_v2_start': asyncio.get_event_loop().time(),
            'current_balance_config_v2': self.current_balance_config,
            'determined_investment_usdt_v2': amount_to_invest_usdt
        }

        current_price_ex_min_buy = None; current_price_ex_max_sell = None
        if ai_input_dict['ex_min_id_sebo'] and symbol_str != 'N/A':
            ask_price, _ = await self.get_current_market_prices(ai_input_dict['ex_min_id_sebo'], symbol_str)
            current_price_ex_min_buy = ask_price
        if ai_input_dict['ex_max_id_sebo'] and symbol_str != 'N/A':
            _, bid_price = await self.get_current_market_prices(ai_input_dict['ex_max_id_sebo'], symbol_str)
            current_price_ex_max_sell = bid_price
        ai_input_dict['current_price_ex_min_buy_asset'] = current_price_ex_min_buy
        ai_input_dict['current_price_ex_max_sell_asset'] = current_price_ex_max_sell
        current_percentage_diff = None
        if current_price_ex_min_buy and current_price_ex_max_sell and current_price_ex_min_buy > 0:
            current_percentage_diff = ((current_price_ex_max_sell - current_price_ex_min_buy) / current_price_ex_min_buy) * 100
            ai_input_dict['current_percentage_difference'] = current_percentage_diff
        else:
            ai_input_dict['current_percentage_difference'] = None

        if ai_input_dict.get('initial_usdt_withdrawal_selected_fee') is not None:
            profitability_results = calculate_net_profitability(ai_input_dict, amount_to_invest_usdt)
            ai_input_dict['net_profitability_results'] = profitability_results
            if profitability_results.get("error_message"):
                 print(f"V2: {symbol_str} | Error cálculo rentabilidad: {profitability_results['error_message']}")
            else:
                 print(f"V2: {symbol_str} | Rentabilidad Neta: {profitability_results.get('net_profit_percentage'):.4f}% ({profitability_results.get('net_profit_usdt'):.4f} USDT) para inversión de {amount_to_invest_usdt:.2f} USDT.")
        else:
            print(f"V2: {symbol_str} | Abortado: Falta comisión de retiro inicial de USDT para {self.usdt_holder_exchange_id}.")
            ai_input_dict['net_profitability_results'] = {"error_message": "Missing initial USDT withdrawal fee.", "is_profitable": False}
            # self.log_processed_opportunity(ai_input_dict)
            return

        # print(f"V2: {symbol_str} | Gestión de capital aplicada. Siguiente: Decisión con SL/TP por operación.") # Old message

        if ai_input_dict['net_profitability_results'].get("error_message"):
            print(f"V2: {symbol_str} | Abortando decisión debido a error previo en cálculo de rentabilidad: {ai_input_dict['net_profitability_results']['error_message']}")
            # self.log_processed_opportunity(ai_input_dict) # Futuro logging
            return

        # Llamar a la función de evaluación y simulación
        # 'self' (app_instance) se pasa para permitir que el executor llame a get_current_market_prices
        simulation_results = await evaluate_and_simulate_arbitrage(ai_input_dict, self)
        ai_input_dict['simulation_results'] = simulation_results

        print(f"V2: {symbol_str} | Decisión: {simulation_results.get('decision_outcome')}, Ganancia Final Sim: {simulation_results.get('final_simulated_profit_usdt'):.4f} USDT")
        # for step_log in simulation_results.get("simulated_steps", []):
        #    print(f"V2: {symbol_str} | SIM_LOG: {step_log}") # Log detallado de simulación

        decision = simulation_results.get('decision_outcome')
        if decision == "EJECUTADA_SIMULADA" or \
           decision == "EJECUTADA_SIMULADA_TP_INICIAL" or \
           decision == "EJECUTADA_SIMULADA_TP_FINAL":

            profit_loss_this_op = simulation_results.get('final_simulated_profit_usdt', 0.0)

            original_holder_id = ai_input_dict.get('initial_usdt_holder_exchange_id')
            final_usdt_destination_exchange_id = ai_input_dict.get('ex_max_id_sebo') # Donde terminan los USDT

            investment_for_this_op = float(ai_input_dict.get('determined_investment_usdt_v2', 0.0))

            if original_holder_id:
                config_original_holder = await self.load_balance_config_for_exchange(original_holder_id)
                if not config_original_holder:
                     print(f"V2: {symbol_str} | No se pudo cargar config de balance para {original_holder_id} (origen), no se actualiza balance.")
                else:
                    current_balance_original_holder = float(config_original_holder.get('balance_usdt', 0))
                    new_balance_original_holder = current_balance_original_holder - investment_for_this_op
                    await self.update_balance_on_sebo(original_holder_id, new_balance_original_holder, config_original_holder)

            if final_usdt_destination_exchange_id:
                config_final_holder = await self.load_balance_config_for_exchange(final_usdt_destination_exchange_id)
                if not config_final_holder:
                    config_final_holder = {"id_exchange": final_usdt_destination_exchange_id, "balance_usdt": 0}

                current_balance_final_holder = float(config_final_holder.get('balance_usdt', 0))
                usdt_received_from_op = investment_for_this_op + profit_loss_this_op
                new_balance_final_holder = current_balance_final_holder + usdt_received_from_op

                if not config_final_holder.get('initial_capital_for_global_sl') or config_final_holder.get('initial_capital_for_global_sl') == 0:
                    config_final_holder['initial_capital_for_global_sl'] = new_balance_final_holder

                await self.update_balance_on_sebo(final_usdt_destination_exchange_id, new_balance_final_holder, config_final_holder)

                if original_holder_id != final_usdt_destination_exchange_id:
                    print(f"V2: Fondos movidos de {original_holder_id} a {final_usdt_destination_exchange_id}. Actualizando exchange principal de USDT.")
                    self.usdt_holder_exchange_id = final_usdt_destination_exchange_id
                    await self.load_balance_config(self.usdt_holder_exchange_id)

        # Log final de la operación completa
        try:
            await log_operation_to_csv(ai_input_dict, "logs/v2_operation_logs.csv")
            print(f"V2: {symbol_str} | Log de operación completo guardado.")
        except Exception as e:
            print(f"V2: {symbol_str} | Error al intentar guardar log completo: {e}")

        print(f"V2: {symbol_str} | Procesamiento completo finalizado.")

    # async def store_training_data(self, data_dict): # This was a placeholder, actual logging is now log_operation_to_csv
    #     pass

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
        await app.close_ccxt_instances()

if __name__ == "__main__":
    asyncio.run(main())