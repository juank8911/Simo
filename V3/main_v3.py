# Simos/V3/main_v3.py

import asyncio
import logging
import signal
import sys
from typing import Dict, Any

# Importar módulos de V3
from config_v3 import LOG_LEVEL, LOG_FILE_PATH
from utils import setup_logging
from sebo_connector import SeboConnector
from ui_broadcaster import UIBroadcaster
from exchange_manager import ExchangeManager
from data_persistence import DataPersistence
from trading_logic import TradingLogic
from ai_model import ArbitrageAIModel
from simulation_engine import SimulationEngine

class CryptoArbitrageV3:
    """Aplicación principal de arbitraje de criptomonedas V3."""
    
    def __init__(self):
        # Configurar logging
        self.logger = setup_logging(LOG_LEVEL, LOG_FILE_PATH)
        self.logger.info("Iniciando Crypto Arbitrage V3")
        
        # Inicializar componentes
        self.sebo_connector = SeboConnector()
        self.ui_broadcaster = UIBroadcaster()
        self.exchange_manager = ExchangeManager()
        self.data_persistence = DataPersistence()
        self.ai_model = ArbitrageAIModel()
        self.trading_logic = TradingLogic(self.exchange_manager, self.data_persistence, self.ai_model)
        self.simulation_engine = SimulationEngine(self.ai_model, self.data_persistence)
        
        # Estado de la aplicación
        self.is_running = False
        self.shutdown_event = asyncio.Event()
        
        # Configurar callbacks
        self._setup_callbacks()
    
    def _setup_callbacks(self):
        """Configura los callbacks entre componentes."""
        
        # Callbacks de SeboConnector
        self.sebo_connector.set_spot_arb_callback(self._on_spot_arb_data)
        self.sebo_connector.set_balances_update_callback(self._on_balances_update)
        self.sebo_connector.set_top20_data_callback(self._on_top20_data)
        
        # Callbacks de UIBroadcaster
        self.ui_broadcaster.set_trading_start_callback(self._on_trading_start_request)
        self.ui_broadcaster.set_trading_stop_callback(self._on_trading_stop_request)
        self.ui_broadcaster.set_ui_message_callback(self._on_ui_message)
        
        # Callbacks de TradingLogic
        self.trading_logic.set_operation_complete_callback(self._on_operation_complete)
        self.trading_logic.set_trading_status_change_callback(self._on_trading_status_change)
    
    async def initialize(self):
        """Inicializa todos los componentes."""
        try:
            self.logger.info("Inicializando componentes...")
            
            # Inicializar en orden de dependencias
            await self.sebo_connector.initialize()
            await self.exchange_manager.initialize()
            await self.trading_logic.initialize()
            
            # Iniciar servidor UI
            await self.ui_broadcaster.start_server()
            
            self.logger.info("Todos los componentes inicializados correctamente")
            
        except Exception as e:
            self.logger.error(f"Error inicializando componentes: {e}")
            raise
    
    async def start(self):
        """Inicia la aplicación."""
        try:
            self.is_running = True
            self.logger.info("Iniciando Crypto Arbitrage V3...")
            
            # Conectar a Sebo
            connected = await self.sebo_connector.connect_to_sebo()
            if not connected:
                self.logger.error("No se pudo conectar a Sebo")
                return False
            
            self.logger.info("V3 iniciado correctamente")
            
            # Configurar manejo de señales para shutdown graceful
            self._setup_signal_handlers()
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error iniciando V3: {e}")
            return False
    
    async def run(self):
        """Ejecuta el bucle principal de la aplicación."""
        try:
            self.logger.info("Ejecutando bucle principal...")
            
            # Crear tareas principales
            tasks = [
                asyncio.create_task(self.sebo_connector.wait_for_connection()),
                asyncio.create_task(self._monitor_system_health()),
                asyncio.create_task(self._wait_for_shutdown())
            ]
            
            # Ejecutar hasta que se reciba señal de shutdown
            await asyncio.gather(*tasks, return_exceptions=True)
            
        except Exception as e:
            self.logger.error(f"Error en bucle principal: {e}")
        finally:
            await self.shutdown()
    
    async def shutdown(self):
        """Realiza un shutdown graceful de la aplicación."""
        if not self.is_running:
            return
        
        self.logger.info("Iniciando shutdown de V3...")
        self.is_running = False
        
        try:
            # Detener trading si está activo
            if self.trading_logic.is_trading_active():
                await self.trading_logic.stop_trading()
            
            # Cerrar componentes en orden inverso
            await self.ui_broadcaster.stop_server()
            await self.sebo_connector.disconnect_from_sebo()
            await self.trading_logic.cleanup()
            await self.exchange_manager.cleanup()
            await self.sebo_connector.cleanup()
            
            self.logger.info("Shutdown completado")
            
        except Exception as e:
            self.logger.error(f"Error durante shutdown: {e}")
    
    def _setup_signal_handlers(self):
        """Configura los manejadores de señales para shutdown graceful."""
        def signal_handler(signum, frame):
            self.logger.info(f"Señal recibida: {signum}")
            self.shutdown_event.set()
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    async def _wait_for_shutdown(self):
        """Espera la señal de shutdown."""
        await self.shutdown_event.wait()
        self.logger.info("Señal de shutdown recibida")
    
    async def _monitor_system_health(self):
        """Monitorea la salud del sistema."""
        while self.is_running:
            try:
                # Verificar conexiones
                if not self.sebo_connector.is_connected:
                    self.logger.warning("Conexión con Sebo perdida, intentando reconectar...")
                    await self.sebo_connector.connect_to_sebo()
                
                # Verificar estado de exchanges
                active_exchanges = self.exchange_manager.get_active_exchanges()
                self.logger.debug(f"Exchanges activos: {len(active_exchanges)}")
                
                # Enviar estadísticas a UI
                stats = await self.data_persistence.get_operation_statistics()
                await self.ui_broadcaster.broadcast_message({
                    "type": "system_health",
                    "payload": {
                        "sebo_connected": self.sebo_connector.is_connected,
                        "ui_clients": self.ui_broadcaster.get_connected_clients_count(),
                        "active_exchanges": len(active_exchanges),
                        "trading_active": self.trading_logic.is_trading_active(),
                        "operation_stats": stats
                    }
                })
                
                await asyncio.sleep(30)  # Verificar cada 30 segundos
                
            except Exception as e:
                self.logger.error(f"Error en monitoreo de salud: {e}")
                await asyncio.sleep(60)  # Esperar más tiempo si hay error
    
    # Callbacks de eventos
    
    async def _on_spot_arb_data(self, data: Dict):
        """Maneja datos de arbitraje spot recibidos de Sebo."""
        try:
            # Si el trading está activo, procesar la oportunidad
            if self.trading_logic.is_trading_active():
                # Procesar en background para no bloquear
                asyncio.create_task(self._process_arbitrage_opportunity(data))
            
            # Enviar datos a UI para visualización
            await self.ui_broadcaster.broadcast_message({
                "type": "spot_arb_data",
                "payload": data
            })
            
        except Exception as e:
            self.logger.error(f"Error procesando spot-arb data: {e}")
    
    async def _process_arbitrage_opportunity(self, data: Dict):
        """Procesa una oportunidad de arbitraje en background."""
        try:
            result = await self.trading_logic.process_arbitrage_opportunity(data)
            
            # Enviar resultado a UI
            await self.ui_broadcaster.broadcast_operation_result(result)
            
        except Exception as e:
            self.logger.error(f"Error procesando oportunidad de arbitraje: {e}")
    
    async def _on_balances_update(self, data: Dict):
        """Maneja actualizaciones de balance de Sebo."""
        try:
            # Retransmitir a UI
            await self.ui_broadcaster.broadcast_balance_update(data)
            
            # Guardar en cache
            await self.data_persistence.save_balance_cache(data)
            
        except Exception as e:
            self.logger.error(f"Error procesando balance update: {e}")
    
    async def _on_top20_data(self, data: list):
        """Maneja datos del top 20 de Sebo."""
        try:
            # Retransmitir a UI
            await self.ui_broadcaster.broadcast_top20_data(data)
            
        except Exception as e:
            self.logger.error(f"Error procesando top 20 data: {e}")
    
    async def _on_trading_start_request(self, payload: Dict):
        """Maneja solicitud de inicio de trading desde UI."""
        try:
            self.logger.info("Solicitud de inicio de trading recibida desde UI")
            
            # Extraer configuración si se proporciona
            config = payload.get('config', {})
            
            await self.trading_logic.start_trading(config)
            
        except Exception as e:
            self.logger.error(f"Error iniciando trading: {e}")
            await self.ui_broadcaster.broadcast_log_message(
                "ERROR", f"Error iniciando trading: {e}"
            )
    
    async def _on_trading_stop_request(self, payload: Dict):
        """Maneja solicitud de detención de trading desde UI."""
        try:
            self.logger.info("Solicitud de detención de trading recibida desde UI")
            
            await self.trading_logic.stop_trading()
            
        except Exception as e:
            self.logger.error(f"Error deteniendo trading: {e}")
            await self.ui_broadcaster.broadcast_log_message(
                "ERROR", f"Error deteniendo trading: {e}"
            )
    
    async def _on_ui_message(self, message_type: str, payload: Dict):
        """Maneja mensajes genéricos de la UI."""
        try:
            self.logger.debug(f"Mensaje UI recibido: {message_type}")
            
            if message_type == 'get_system_status':
                await self._send_system_status()
            elif message_type == 'get_trading_stats':
                await self._send_trading_stats()
            elif message_type == 'export_data':
                await self._handle_data_export(payload)
            else:
                self.logger.warning(f"Tipo de mensaje UI no reconocido: {message_type}")
                
        except Exception as e:
            self.logger.error(f"Error procesando mensaje UI: {e}")
    
    async def _send_system_status(self):
        """Envía el estado del sistema a la UI."""
        try:
            status = {
                "sebo_connected": self.sebo_connector.is_connected,
                "ui_clients": self.ui_broadcaster.get_connected_clients_count(),
                "active_exchanges": self.exchange_manager.get_active_exchanges(),
                "trading_active": self.trading_logic.is_trading_active(),
                "current_operation": self.trading_logic.get_current_operation()
            }
            
            await self.ui_broadcaster.broadcast_message({
                "type": "system_status",
                "payload": status
            })
            
        except Exception as e:
            self.logger.error(f"Error enviando estado del sistema: {e}")
    
    async def _send_trading_stats(self):
        """Envía las estadísticas de trading a la UI."""
        try:
            stats = self.trading_logic.get_trading_stats()
            operation_stats = await self.data_persistence.get_operation_statistics()
            
            combined_stats = {**stats, **operation_stats}
            
            await self.ui_broadcaster.broadcast_message({
                "type": "trading_stats",
                "payload": combined_stats
            })
            
        except Exception as e:
            self.logger.error(f"Error enviando estadísticas de trading: {e}")
    
    async def _handle_data_export(self, payload: Dict):
        """Maneja solicitudes de exportación de datos."""
        try:
            export_type = payload.get('type', 'operations')
            export_path = payload.get('path', f'export_{export_type}.csv')
            
            success = await self.data_persistence.export_data(export_path, export_type)
            
            await self.ui_broadcaster.broadcast_message({
                "type": "data_export_result",
                "payload": {
                    "success": success,
                    "export_type": export_type,
                    "export_path": export_path if success else None
                }
            })
            
        except Exception as e:
            self.logger.error(f"Error exportando datos: {e}")
    
    async def _on_operation_complete(self, operation_result: Dict):
        """Maneja la finalización de una operación."""
        try:
            # Actualizar estadísticas en UI
            self.ui_broadcaster.update_trading_stats(operation_result)
            
            # Log de la operación
            symbol = operation_result.get('symbol', 'N/A')
            decision = operation_result.get('decision_outcome', 'N/A')
            profit = operation_result.get('net_profit_usdt', 0)
            
            self.logger.info(f"Operación completada: {symbol} | {decision} | Profit: {profit:.4f} USDT")
            
        except Exception as e:
            self.logger.error(f"Error procesando operación completada: {e}")
    
    async def _on_trading_status_change(self, is_active: bool):
        """Maneja cambios en el estado del trading."""
        try:
            status = "ACTIVO" if is_active else "INACTIVO"
            self.logger.info(f"Estado de trading cambiado: {status}")
            
            # Notificar a UI
            await self.ui_broadcaster.broadcast_trading_status_change(is_active)
            
        except Exception as e:
            self.logger.error(f"Error procesando cambio de estado de trading: {e}")

async def main():
    """Función principal."""
    app = None
    try:
        # Crear aplicación
        app = CryptoArbitrageV3()
        
        # Inicializar
        await app.initialize()
        
        # Iniciar
        started = await app.start()
        if not started:
            print("Error: No se pudo iniciar la aplicación")
            return 1
        
        # Ejecutar
        await app.run()
        
        return 0
        
    except KeyboardInterrupt:
        print("\nInterrupción recibida, cerrando aplicación...")
        return 0
    except Exception as e:
        print(f"Error fatal: {e}")
        return 1
    finally:
        if app:
            await app.shutdown()

if __name__ == "__main__":
    # Configurar política de eventos para Windows
    if sys.platform.startswith('win'):
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    # Ejecutar aplicación
    exit_code = asyncio.run(main())
    sys.exit(exit_code)

