/**
 * crea una funcion para agregar los exchage desde el json de exchages_cofig.json
 * reorno la cantidad de exchanges agregados
 * cuanto fallaron al agregarse
 * y listo de id de los que fallaron
 */const Exchange = require('../models/Exchange');
const exchangesConfig = require('../config/exchanges_config.json');

const addExchanges = async () => {
  let addedCount = 0;
  let failedCount = 0;
  const failedIds = [];

  for (const exchangeConfig of exchangesConfig) {
    try {
      const newExchange = new Exchange(exchangeConfig);
      await newExchange.save();
      addedCount++;
    } catch (error) {
      failedCount++;
      failedIds.push(exchangeConfig.id);
      console.error(`Error adding exchange ${exchangeConfig.id}:`, error);
    }
  }

  return {
    addedCount,
    failedCount,
    failedIds,
  };
};

module.exports = {
  addExchanges,
};
