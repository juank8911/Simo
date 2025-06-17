const mongoose = require('mongoose');

const exchangeSymbolSchema = new mongoose.Schema({
  symbolId: { type: mongoose.Schema.Types.ObjectId, ref: 'Symbol', required: true },
  exchangeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exchange', required: true },
  Val_buy: { type: Number, default: 0 },
  Val_sell: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now }
});

const ExchangeSymbol = mongoose.model('ExchangeSymbol', exchangeSymbolSchema);

module.exports = ExchangeSymbol;