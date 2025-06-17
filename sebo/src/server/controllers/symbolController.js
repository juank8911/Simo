/** crea todo el crud para symbol */
const Symbol = require('../models/symbol');

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
};
