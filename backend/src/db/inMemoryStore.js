/**
 * In-Memory Store - Fallback when MongoDB is unavailable
 * Uses simple JS objects/arrays to simulate a database
 */
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

let users = [];
let trades = [];

const createUser = async ({ username, email, password }) => {
  const salt = await bcrypt.genSalt(12);
  const hashed = await bcrypt.hash(password, salt);
  const user = {
    _id: uuidv4(),
    username,
    email: email.toLowerCase(),
    password: hashed,
    cashBalance: 10000,
    portfolio: [],
    totalDeposited: 10000,
    dailyRewardClaimed: null,
    createdAt: new Date(),
  };
  users.push(user);
  return user;
};

const findUserByEmail = (email) => users.find(u => u.email === email.toLowerCase());
const findUserById = (id) => users.find(u => u._id === id);
const findUserByEmailOrUsername = (email, username) =>
  users.find(u => u.email === email.toLowerCase() || u.username === username);

const saveUser = (user) => {
  const idx = users.findIndex(u => u._id === user._id);
  if (idx !== -1) users[idx] = user;
  return user;
};

const getAllUsers = () => users;

const createTrade = (tradeData) => {
  const trade = { _id: uuidv4(), timestamp: new Date(), ...tradeData };
  trades.push(trade);
  return trade;
};

const getTradesByUser = (userId, skip = 0, limit = 20) => {
  const userTrades = trades.filter(t => t.userId === userId).sort((a, b) => b.timestamp - a.timestamp);
  return {
    data: userTrades.slice(skip, skip + limit),
    total: userTrades.length,
  };
};

const getAllTradesByUser = (userId) => trades.filter(t => t.userId === userId);

const comparePassword = async (candidate, hashed) => bcrypt.compare(candidate, hashed);

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByEmailOrUsername,
  saveUser,
  getAllUsers,
  createTrade,
  getTradesByUser,
  getAllTradesByUser,
  comparePassword,
};
