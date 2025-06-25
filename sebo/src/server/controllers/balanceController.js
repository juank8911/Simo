const Balances = require('../data/dataBase/modelosBD/balance.model');


// Crear un nuevo registro de balance
exports.createBalance = async (req, res) => {
  try {
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
    const balances = await Balances.find().sort({ timestamp: -1 });
    res.status(200).json(balances);
  } catch (error) {
    res.status(500).json({ message: "Error fetching balance records", error: error.message });
  }
};

// Obtener el último balance registrado
exports.getLastBalance = async () => {
  await createRandomBalance();
  try {
    const lastBalance = await Balances.findOne().sort({ timestamp: -1 });
    if (!lastBalance) {
      return null;
    }
     return lastBalance;
  } catch (error) {
    res.status(500).json({ message: "Error fetching last balance record", error: error.message });
  }
};

// Obtener el balance más reciente por id_exchange
exports.getBalanceByExchange = async (req, res) => {
  try {
    const { exchangeId } = req.params;
    const balance = await Balance.findOne({ id_exchange: exchangeId }).sort({ timestamp: -1 });
    if (!balance) {
      return res.status(404).json({ message: "Balance record not found for this exchange." });
    }
    res.status(200).json(balance);
  } catch (error) {
    res.status(500).json({ message: "Error fetching balance record", error: error.message });
  }
};

// Actualizar un registro de balance por _id
exports.updateBalanceById = async (req, res) => {
  try {
    const { balanceId } = req.params;
    const balanceData = { ...req.body, timestamp: new Date() };
    delete balanceData._id;
    const updatedBalance = await Balance.findByIdAndUpdate(balanceId, balanceData, { new: true, runValidators: true });
    if (!updatedBalance) {
      return res.status(404).json({ message: "Balance record not found." });
    }
    res.status(200).json(updatedBalance);
  } catch (error) {
    res.status(400).json({ message: "Error updating balance record", error: error.message });
  }
};

// Actualizar o crear balance por id_exchange (upsert)
exports.updateBalanceByExchange = async (req, res) => {
  try {
    const { exchangeId } = req.params;
    const updateData = { ...req.body, timestamp: new Date() };
    delete updateData.id_exchange;
    delete updateData._id;
    const updatedBalance = await Balance.findOneAndUpdate(
      { id_exchange: exchangeId },
      { $set: updateData },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.status(200).json(updatedBalance);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: "Validation Error", errors: error.errors });
    }
    res.status(400).json({ message: "Error upserting balance record for exchange", error: error.message });
  }
};

// Eliminar un registro de balance por _id
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

// Crear un balance aleatorio para pruebas
exports.createRandomBalance = async () => {
  try {
    // Puedes ajustar los campos según tu modelo de Balance
    const randomBalance = new Balances({
      id_exchange: `ObjectId("6851cfc7980ca1adcd58330e")`,
      balance_usdt: (Math.random() * 10000).toFixed(2),
      timestamp: new Date(),
      // Agrega aquí otros campos requeridos por tu modelo
    });
    await randomBalance.save();

  } catch (error) {
    
  }
};


