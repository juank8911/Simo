const mongoose = require('mongoose');

const balanceSchema = new mongoose.Schema({
  balance_usdt: { type: Number, required: true, default: 0 },
  id_exchange: { type: String, required: true }, // CCXT id of the exchange
  timestamp: { type: Date, default: Date.now }
});

// Index to quickly find balance by exchange
balanceSchema.index({ id_exchange: 1 });

const Balance = mongoose.model('Balance', balanceSchema);

module.exports = Balance;
