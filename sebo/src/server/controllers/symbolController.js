/** crea todo el crud para symbol */
const Symbol = require('../data/dataBase/modelosBD/symbol.model'); // Asegúrate de tener el modelo Symbolº
const exchangeController = require('./exchangeController'); // Asegúrate de tener el controlador de exchange
const ccxt = require('ccxt'); // Asegúrate de tener ccxt instalado*
const spotController = require('./spotController'); // Asegúrate de tener el controlador de spot
const { Exchange } = require('../data/dataBase/connectio');
// Obtener todos los símbolos
exports.getSymbols = async (req, res) => {
  try {
    const symbols = await Symbol.find();
    res.json(symbols);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Obtener un símbolo por ID
exports.getSymbolById = async (req, res) => {
  try {
    const symbol = await Symbol.findById(req.params.id);
    if (symbol == null) {
      return res.status(404).json({ message: 'No se encontró el símbolo' });
    }
    res.json(symbol);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addSymbolsForExchange = async (req, res) => {
  try {
    console.log(`Agregando símbolos para el exchange...`);
    const exchanges = ccxt.exchanges; // Obtiene la configuración de los exchanges activos
    for (const ex of exchanges) {
      // Itera sobre cada exchange
      if(exc = await Exchange.findOne({ id_ex: ex.id_ex })) {
        if(exc.isActive) {
          console.log(`Exchange ${ex.id_ex} ya existe, omitiendo...`);
          symbols = exchange.symbols; // Obtiene los símbolos del exchange
          for (const symbol of symbols) {
            if (await Symbol.findById(symbol.id_sy) ) continue;
            if(!symbol.spot || !symbol.active || !symbol.symbol.match(/\/USDT$/)) continue; // Solo agregar símbolos de tipo spot
            const symbolAdd = new Symbol({
              id_sy: symbol.id_sy,
              name: symbol.name,
              // Agrega más símbolos según sea necesario
            });
            await symbolAdd.save();
          }   
        }
      }

  }
    console.log(`Símbolos agregados para el exchange`);
    res.status(200).json({ message: `Símbolos agregados para los exchanges` });
  } catch (err) {
    console.error(`Error al agregar símbolos para el exchange:`, err);
}

// Crear un nuevo símbolo
exports.createSymbol = async (req, res) => {
  const symbol = new Symbol({
    name: req.body.name,
    description: req.body.description,
    // Agrega aquí otros campos del modelo Symbol
  });

  try {
    const newSymbol = await symbol.save();
    res.status(201).json(newSymbol);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Actualizar un símbolo
exports.updateSymbol = async (req, res) => {
  try {
    const symbol = await Symbol.findById(req.params.id);
    if (symbol == null) {
      return res.status(404).json({ message: 'No se encontró el símbolo' });
    }

    if (req.body.name != null) {
      symbol.name = req.body.name;
    }
    if (req.body.description != null) {
      symbol.description = req.body.description;
    }
    // Actualiza otros campos según sea necesario

    const updatedSymbol = await symbol.save();
    res.json(updatedSymbol);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Eliminar un símbolo
exports.deleteSymbol = async (req, res) => {
  try {
    const symbol = await Symbol.findById(req.params.id);
    if (symbol == null) {
      return res.status(404).json({ message: 'No se encontró el símbolo' });
    }

    await symbol.remove();
    res.json({ message: 'Símbolo eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}};
