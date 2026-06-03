const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment');
  }

  try {
    const conn = await mongoose.connect(uri);
    isConnected = true;
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    if (err.code === 'ECONNREFUSED' && err.syscall === 'querySrv') {
      console.error('MongoDB SRV lookup failed. This usually means DNS SRV requests are blocked or unsupported in your environment.');
      console.error('Use a standard mongodb:// Atlas connection string or fix your DNS resolver settings.');
    }
    throw err;
  }
}

module.exports = connectDB;
