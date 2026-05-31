require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not set');
  process.exit(1);
}

const reset = async () => {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB, resetting usage counters...');

  const res = await User.updateMany({}, {
    $set: {
      'usage.voiceCallsThisPeriod': 0,
      'usage.aiCallsThisPeriod': 0,
    }
  });

  console.log('Reset complete:', res.modifiedCount, 'documents updated');
  await mongoose.disconnect();
};

reset().catch(err => {
  console.error('Reset failed:', err);
  process.exit(1);
});
