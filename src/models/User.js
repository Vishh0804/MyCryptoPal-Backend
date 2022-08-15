const mongoose = require('mongoose');

const transactionHistory = new mongoose.Schema({
  symbol: {type: String, required: true},
  amount: {type: Number, required: true},
  price: {type: Number, required: true},
  action: {type: String, required: true},
  date: {type: Date, required: true}
})
const userSchema = new mongoose.Schema({
  user_id: {type: Number, required: true},
  access: {type: Number, default: 1},
  username: {type: String, required: true},
  password: {type: String, requireSod: true},
  email: {type: String, required: true},
  firstName: String,
  lastName: String,
  assets: {type: Object, default: {}},
  assetsPrice: {type: Object, default: {}},
  lessonProgress: {type: Object, default: {}},
  balance: {type: Number, default: 10000},
  avatar: String,
  historys: [transactionHistory]
}, {
  minimize: false,
});

const User = mongoose.model('User', userSchema);

module.exports = User;