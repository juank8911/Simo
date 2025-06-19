const Balance = require('../data/dataBase/modelosBD/balance.model');

// Crear un nuevo registro de balance
exports.createBalance = async (req, res) => {
  try {
    // Opcional: Verificar si ya existe un balance para este exchange y actualizarlo en lugar de crear uno nuevo,
    // o permitir múltiples registros si se quiere un historial. Por ahora, creamos uno nuevo.
    // Si se quiere 'upsert' o 'update if exists, else create':
    // const { id_exchange, balance_usdt } = req.body;
    // const updatedBalance = await Balance.findOneAndUpdate(
    //   { id_exchange },
    //   { balance_usdt, timestamp: new Date() },
    //   { new: true, upsert: true, runValidators: true }
    // );
    // return res.status(201).json(updatedBalance);

    const newBalance = new Balance(req.body);
    await newBalance.save();
    res.status(201).json(newBalance);
  } catch (error) {
    res.status(400).json({ message: "Error creating balance record", error: error.message });
  }
};

// Obtener todos los registros de balance
exports.getAllBalances = async (req, res) => {
  try {
    const balances = await Balance.find().sort({ timestamp: -1 });
    res.status(200).json(balances);
  } catch (error) {
    res.status(500).json({ message: "Error fetching balance records", error: error.message });
  }
};

// Obtener un balance por id_exchange (más útil que por _id de MongoDB)
exports.getBalanceByExchange = async (req, res) => {
  try {
    const { exchangeId } = req.params;
    // Si se quiere el más reciente para un exchange:
    const balance = await Balance.findOne({ id_exchange: exchangeId }).sort({ timestamp: -1 });
    // Si se quieren todos los registros para un exchange:
    // const balance = await Balance.find({ id_exchange: exchangeId }).sort({ timestamp: -1 });

    if (!balance) {
      return res.status(404).json({ message: "Balance record not found for this exchange." });
    }
    res.status(200).json(balance);
  } catch (error) {
    res.status(500).json({ message: "Error fetching balance record", error: error.message });
  }
};

// Actualizar un registro de balance (identificado por su _id de MongoDB)
exports.updateBalanceById = async (req, res) => {
  try {
    const { balanceId } = req.params;
    // Asegurarse de actualizar el timestamp
    const balanceData = { ...req.body, timestamp: new Date() };
    const updatedBalance = await Balance.findByIdAndUpdate(balanceId, balanceData, { new: true, runValidators: true });
    if (!updatedBalance) {
      return res.status(404).json({ message: "Balance record not found." });
    }
    res.status(200).json(updatedBalance);
  } catch (error) {
    res.status(400).json({ message: "Error updating balance record", error: error.message });
  }
};

// Actualizar balance por id_exchange (upsert: actualiza si existe, o crea si no existe)
exports.updateBalanceByExchange = async (req, res) => {
  try {
    const { exchangeId } = req.params;
    const { balance_usdt } = req.body;

    if (balance_usdt == null) {
        return res.status(400).json({ message: "balance_usdt is required in the body." });
    }

    const updatedBalance = await Balance.findOneAndUpdate(
      { id_exchange: exchangeId },
      { balance_usdt, id_exchange: exchangeId, timestamp: new Date() }, // Asegurar que id_exchange se incluya en el update si es upsert
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.status(200).json(updatedBalance);
  } catch (error) {
    res.status(400).json({ message: "Error upserting balance record for exchange", error: error.message });
  }
};


// Eliminar un registro de balance (por _id de MongoDB)
exports.deleteBalanceById = async (req, res) => {
  try {
    const { balanceId } = req.params;
    const deletedBalance = await Balance.findByIdAndDelete(balanceId);
    if (!deletedBalance) {
      return res.status(404).json({ message: "Balance record not found." });
    }
    res.status(200).json({ message: "Balance record deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Error deleting balance record", error: error.message });
  }
};
