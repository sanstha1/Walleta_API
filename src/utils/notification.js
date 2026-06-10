const admin = require('firebase-admin');
const db    = admin.firestore();

const sendNotification = async ({ token, title, body, userId, type = 'system', metadata = {} }) => {
  
  if (userId) {
    try {
      const ref = db.collection('notifications').doc(userId).collection('items').doc();
      await ref.set({
        id:        ref.id,
        type,
        title,
        body,
        isRead:    false,
        metadata,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error('[NOTIFICATION]  Firestore write failed:', err.message);
    }
  }

  
  if (!token) {
    console.warn('[NOTIFICATION] No FCM token — skipping FCM push');
    return;
  }

  try {
    const response = await admin.messaging().send({
      token,
      notification: { title, body },
      android: { priority: 'high', notification: { sound: 'default' } },
      apns:    { payload: { aps: { sound: 'default' } } },
    });
    console.log('[NOTIFICATION]  Sent:', response);
    return response;
  } catch (err) {
    console.error('[NOTIFICATION]  FCM failed:', err.message);
  }
};

module.exports = { sendNotification };