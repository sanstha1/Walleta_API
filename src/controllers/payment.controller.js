const axios            = require('axios');
const User             = require('../models/user');
const { sendNotification } = require('../utils/notification');
const { buildPlanInfo }    = require('./auth.controller.js'); 


// canonical plan keys: free, trial, monthly, quarterly, lifetime
const PLAN_CONFIG = {
  free:      { label: 'Free',         days: 0,    price: 0,    free: true  },
  trial:     { label: '7-Day Trial',  days: 7,    price: 0,    free: true  },
  monthly:   { label: '1-Month',      days: 30,   price: 299,  free: false },
  quarterly: { label: '3-Months',     days: 90,   price: 799,  free: false },
  lifetime:  { label: 'Lifetime',     days: null, price: 1499, free: false },
};

const PLAN_ALIASES = {
  elite:     'monthly',
  royal:     'quarterly',
  unlimited: 'lifetime',
};

 
const notifyUser = async (user, title, body, type = 'payment', metadata = {}) => {
  if (!user) return;
  try {
    await sendNotification({
      token:    user.fcmToken ?? null,
      userId:   user.firebaseUid ?? null,  
      type,
      title,
      body,
      metadata,
    });
  } catch (e) {
    console.warn('[FCM] Non-critical failure:', e.message);
  }
};


exports.activateTrial = async (req, res, next) => {
  try {
    const user = req.user;

    if (user.plan !== 'none') {
      return res.status(400).json({
        message: user.plan === 'trial'
          ? 'You already have an active trial.'
          : 'Trial is only available for accounts with no current plan.',
      });
    }
 const hasActivePlan =
      user.plan !== 'none' &&
      user.plan !== 'free' &&
      user.isPremium &&
      (user.planExpiryDate === null || new Date() < new Date(user.planExpiryDate));

    if (hasActivePlan) {
      return res.status(400).json({
        message: user.plan === 'trial'
          ? 'You already have an active trial.'
          : `You already have an active ${user.plan} plan. Trial is only available once it expires.`,
      });
    }

    
    const alreadyUsedTrial = user.paymentHistory?.some(p => p.plan === 'trial');
    if (alreadyUsedTrial) {
      return res.status(400).json({
        message: 'You have already used your free trial. Please choose a paid plan.',
      });
    }
    const now        = new Date();
    const expiryDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const updated = await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          plan:          'trial',
          planStartDate:  now,
          planExpiryDate: expiryDate,
          isPremium:      true,
        },
        $push: {
          paymentHistory: {
            transactionId: `TRIAL-${Date.now()}-${user._id}`,
            plan:   'trial',
            amount: 0,
            status: 'success',
            date:   now,
          },
        },
      },
      { new: true }
    );

    console.log(`[TRIAL] ✅ Activated for ${user.email} — expires ${expiryDate.toDateString()}`);
    await notifyUser(updated, '🎉 Trial Started!', 'Your 7-day free trial is now active. Enjoy Spensr Premium!');

    return res.status(200).json({
      status:  'success',
      message: '7-day trial activated!',
      data:    buildPlanInfo(updated),
    });
  } catch (e) {
    next(e);
  }
};

// ─── POST /api/payment/initiate ───────────────────────────────────────────────
exports.initiate = async (req, res, next) => {
  try {
    const planKey = String(req.body.plan || '').toLowerCase();
    const config  = PLAN_CONFIG[planKey];

    if (!config)
      return res.status(400).json({ message: `Invalid plan. Choose: ${Object.keys(PLAN_CONFIG).join(', ')}` });
    if (config.free)
      return res.status(400).json({ message: 'Trial is free — use /activate-trial instead.' });

    const user = req.user;
     const hasActivePlan = user.isPremium &&
      user.plan !== 'none' &&
      user.plan !== 'free' &&
      (user.planExpiryDate === null || new Date() < new Date(user.planExpiryDate));

    if (hasActivePlan) {
      return res.status(400).json({
        message: `You already have an active ${user.plan} plan. You can upgrade once it expires.`,
      });
    }
    if (user.plan === planKey && user.isPremium)
      return res.status(400).json({ message: `You already have an active ${config.label} plan.` });

    const txnId = `TXN-${Date.now()}-${user._id}`;

    await User.findByIdAndUpdate(user._id, {
      $push: {
        paymentHistory: {
          transactionId: txnId,
          plan:   planKey,
          amount: config.price,
          status: 'pending',
          date:   new Date(),
        },
      },
    });

    return res.status(200).json({
      status: 'success',
      data:   { txnId, productName: config.label, amount: config.price.toString(), plan: planKey },
    });
  } catch (e) {
    next(e);
  }
};

// ─── POST /api/payment/verify-and-activate ────────────────────────────────────
exports.verifyAndActivate = async (req, res, next) => {
  try {
    const { refId, txnId, totalAmount, plan } = req.body;
    let planKey = String(plan || '').toLowerCase();
    if (!PLAN_CONFIG[planKey]) planKey = PLAN_ALIASES[planKey] || planKey;
    const config  = PLAN_CONFIG[planKey];

    if (!config)
      return res.status(400).json({ message: 'Invalid plan' });

    // 1. eSewa verification (sandbox fallback for non-production)
    let verified = false;
    try {
      const r = await axios.get('https://rc.esewa.com.np/mobile/transaction', {
        params: { txnRefId: refId, amount: totalAmount, productId: txnId, scd: 'EPAYTEST' },
      });
      verified = r.data?.TransactionDetails?.Status === 'COMPLETE';
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') verified = true; // sandbox bypass
    }

    if (!verified)
      return res.status(400).json({ message: 'Payment verification failed' });

    // 2. Activate plan
    const expiry = config.days ? new Date(Date.now() + config.days * 24 * 60 * 60 * 1000) : null;

    const now = new Date();
    console.log('[VERIFY_AND_ACTIVATE] incoming', { userId: req.user._id.toString(), planKey, txnId, refId, totalAmount });

    // Use findById + save to ensure pre-save hooks run and features are derived
    const userRecord = await User.findById(req.user._id);
    if (!userRecord) {
      console.error('[VERIFY_AND_ACTIVATE] User not found', { userId: req.user._id.toString() });
      return res.status(404).json({ message: 'User not found' });
    }

    userRecord.plan = planKey;
    userRecord.isPremium = true;
    userRecord.planStartDate = now;
    userRecord.planExpiryDate = expiry;
    userRecord.paymentHistory.push({ transactionId: txnId, plan: planKey, amount: totalAmount || config.price, status: 'success', date: now });

    const updatedUser = await userRecord.save();

    console.log('[VERIFY_AND_ACTIVATE] saved user', { userId: req.user._id.toString(), plan: planKey });

    await notifyUser(updatedUser, '💎 Plan Activated!', `Welcome to ${config.label}!`);

    return res.status(200).json({
      status:  'success',
      message: `${config.label} activated!`,
      data:    buildPlanInfo(updatedUser),
    });
  } catch (e) {
    next(e);
  }
};

// ─── GET /api/payment/plan ────────────────────────────────────────────────────
exports.getPlan = async (req, res, next) => {
  try {
    return res.status(200).json({ status: 'success', data: buildPlanInfo(req.user) });
  } catch (e) {
    next(e);
  }
};

// ─── LEGACY: POST /api/transactions/activate-premium ─────────────────────────
exports.activatePremium = async (req, res, next) => {
  try {
    let planKey = String(req.body.plan || '').toLowerCase();
    if (!PLAN_CONFIG[planKey]) planKey = PLAN_ALIASES[planKey] || planKey;
    const config  = PLAN_CONFIG[planKey];

    if (!config) return res.status(400).json({ message: 'Invalid plan' });

    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const now        = new Date();
    const expiryDate = config.days ? new Date(now.getTime() + config.days * 24 * 60 * 60 * 1000) : null;

    const user = await User.findById(userId);
    if (!user) {
      console.warn('[ACTIVATE_PREMIUM] User not found for id', userId);
      return res.status(404).json({ message: 'User not found' });
    }

    user.isPremium = true;
    user.plan = planKey;
    user.planStartDate = now;
    user.planExpiryDate = expiryDate;
    user.paymentHistory.push({ transactionId: `MANUAL-${Date.now()}-${userId}`, plan: planKey, amount: config.price, status: 'success', date: now });

    await user.save();

    console.log(`[ACTIVATE_PREMIUM] Activated ${planKey} for ${user.email} (id: ${userId}) — expiry: ${expiryDate}`);
    await notifyUser(user, '💎 Premium Active!', `Welcome to ${config.label}!`);
    return res.status(200).json({ success: true, plan: user.plan, expiry: user.planExpiryDate });
  } catch (e) {
    next(e);
  }
};