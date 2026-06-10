// scripts/backfill-firestore-users.js
const mongoose = require('mongoose');
const admin    = require('firebase-admin');
const User     = require('../models/user');

async function backfill() {
  await mongoose.connect(process.env.MONGO_URI);
  const db    = admin.firestore();
  const users = await User.find({});

  console.log(`Backfilling ${users.length} users...`);

  for (const user of users) {
    try {
      
      const firebaseUser = await admin.auth().getUserByEmail(user.email);

      await db.collection('users').doc(firebaseUser.uid).set({
        email:    user.email,
        name:     user.name,
        mongoId:  user._id.toString(),
        fcmToken: user.fcmToken ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      
      if (!user.firebaseUid) {
        await User.findByIdAndUpdate(user._id, { firebaseUid: firebaseUser.uid });
      }

      console.log(`${user.email}`);
    } catch (err) {
      console.error(`${user.email}: ${err.message}`);
    }
  }

  console.log('Done.');
  process.exit(0);
}

backfill();
const mongoose = require('mongoose');
const admin    = require('firebase-admin');
const User     = require('../models/user');

async function backfill() {
  await mongoose.connect(process.env.MONGO_URI);
  const db    = admin.firestore();
  const users = await User.find({});

  console.log(`Backfilling ${users.length} users...`);

  for (const user of users) {
    try {
      
      const firebaseUser = await admin.auth().getUserByEmail(user.email);

      await db.collection('users').doc(firebaseUser.uid).set({
        email:    user.email,
        name:     user.name,
        mongoId:  user._id.toString(),
        fcmToken: user.fcmToken ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      
      if (!user.firebaseUid) {
        await User.findByIdAndUpdate(user._id, { firebaseUid: firebaseUser.uid });
      }

      console.log(`${user.email}`);
    } catch (err) {
      console.error(`${user.email}: ${err.message}`);
    }
  }

  console.log('Done.');
  process.exit(0);
}

backfill();