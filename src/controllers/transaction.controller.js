const User = require('../models/user');
const Transaction = require('../models/transaction.model.js');
const Budget = require('../models/budget.model.js');
const { sendNotification } = require("../utils/notification.js");
const admin = require('firebase-admin');
const db = admin.firestore();

const getCurrentMonthYear = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const getUserByEmail = async (email) => {
  try {
    const normalizedEmail = email?.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      console.warn('[getUserByEmail] No user found for:', normalizedEmail);
      return { uid: null, fcmToken: null };
    }
    console.log('[getUserByEmail] ✅ Found user, fcmToken:', user.fcmToken ? 'present' : 'missing');
    return {
      uid:      user.firebaseUid ?? null,
      fcmToken: user.fcmToken    ?? null,
    };
  } catch (err) {
    console.error('[getUserByEmail] ❌', err.message);
    return { uid: null, fcmToken: null };
  }
};


const checkAndSendBudgetAlert = async (budget, newSpent, email) => {
  console.log('[BudgetAlert] checking:', {
    id: budget._id,
    alertsEnabled: budget.alertsEnabled,
    alertSent: budget.alertSent,
    newSpent,
    limit: budget.limitAmount,
    threshold: budget.alertThreshold,
  });

  if (!budget.alertsEnabled) {
    console.log('[BudgetAlert] skipped — alerts disabled');
    return;
  }

  if (budget.alertSent) {
    console.log('[BudgetAlert] skipped — alert already sent this period');
    return;
  }

  const threshold = (budget.alertThreshold / 100) * budget.limitAmount;
  console.log('[BudgetAlert] newSpent:', newSpent, '| threshold:', threshold);

  if (newSpent >= threshold) {
    const budgetType = budget.category ? `${budget.category} category` : 'overall';
    const percentageUsed = Math.round((newSpent / budget.limitAmount) * 100);

    const { fcmToken } = await getUserByEmail(email);
    console.log('[BudgetAlert] fcmToken:', fcmToken ? 'found ✅' : 'missing ❌');

    if (fcmToken) {
      try {
        await sendNotification({
          token: fcmToken,
          type: 'budget_alert',
          title: '💰 Budget Alert!',
          body: `You've used ${percentageUsed}% of your ${budgetType} budget (Rs. ${newSpent.toFixed(2)} of Rs. ${budget.limitAmount})`,
          metadata: {
            budgetId: budget._id.toString(),
            category: budget.category || 'overall',
            spent:    String(newSpent),
            limit:    String(budget.limitAmount),
          },
        });
        console.log('[BudgetAlert] ✅ Notification sent');
      } catch (notifErr) {
        console.error('[BudgetAlert] ❌ sendNotification failed:', notifErr.message);
      }
    }

    // FIX: use findByIdAndUpdate to guarantee the write
    await Budget.findByIdAndUpdate(budget._id, { $set: { alertSent: true } });
    console.log('[BudgetAlert] alertSent marked true for', budget._id);
  }
};

// FIX: reset alertSent at the start of each new month
const resetAlertSentIfNewMonth = async (budget, currentMonthYear) => {
  if (budget.alertSentMonth && budget.alertSentMonth !== currentMonthYear) {
    await Budget.findByIdAndUpdate(budget._id, {
      $set: { alertSent: false, alertSentMonth: currentMonthYear },
    });
    return { ...budget.toObject(), alertSent: false };
  }
  return budget.toObject();
};

const updateBudgetsForTransaction = async (email, category, amount, isIncome) => {
  if (isIncome) return;

  const normalizedEmail = email.toLowerCase().trim();
  const budgetMonth = getCurrentMonthYear();

  try {
    
    const overallBudget = await Budget.findOne({
      email: normalizedEmail,
      monthYear: budgetMonth,
      category: null,
    });

    if (overallBudget) {
      const freshOverall = await resetAlertSentIfNewMonth(overallBudget, budgetMonth);

      const result = await Budget.findByIdAndUpdate(
        overallBudget._id,
        { 
          $inc: { spent: amount },
          $set: { alertSentMonth: budgetMonth },
        },
        { new: true } // FIX: get the updated doc back
      );

      console.log('[Transaction] overall budget spent after update:', result.spent);
      await checkAndSendBudgetAlert(freshOverall, result.spent, normalizedEmail);
    } else {
      console.log('[Transaction] no overall budget found for', budgetMonth);
    }

    // ── Category budget ─────────────────────────────────────────
    const categoryBudget = await Budget.findOne({
      email: normalizedEmail,
      monthYear: budgetMonth,
      category,
    });

    if (categoryBudget) {
      const freshCategory = await resetAlertSentIfNewMonth(categoryBudget, budgetMonth);

      const result = await Budget.findByIdAndUpdate(
        categoryBudget._id,
        {
          $inc: { spent: amount },
          $set: { alertSentMonth: budgetMonth },
        },
        { new: true }
      );

      console.log('[Transaction] category budget spent after update:', result.spent);
      await checkAndSendBudgetAlert(freshCategory, result.spent, normalizedEmail);
    } else {
      console.log('[Transaction] no category budget for', category, 'in', budgetMonth);
    }
  } catch (error) {
    console.error('[updateBudgets] ❌ Error:', error.message);
  }
};

exports.addTransaction = async (req, res) => {
  console.log('🔍 addTransaction called');
  try {
    const { title, amount, category, emoji, isIncome, email } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "User email is required" });
    }

    const newTransaction = new Transaction({
      title, amount, category, emoji, isIncome,
      email: normalizedEmail,
    });

    const savedTransaction = await newTransaction.save();

    const { uid, fcmToken } = await getUserByEmail(normalizedEmail);
    console.log('🔑 fcmToken found:', fcmToken ? 'YES ✅' : 'NO ❌');

    const prefix = isIncome ? '💰 Income' : '💸 Expense';
    const sign   = isIncome ? '+' : '-';

    try {
      await sendNotification({
        userId:   uid,
        token:    fcmToken,
        type:     'transaction',
        title:    `${prefix} Added`,
        body:     `${emoji ?? ''} ${title} — ${sign}Rs. ${amount}`.trim(),
        metadata: {
          transactionId: savedTransaction._id.toString(),
          category,
          amount:   String(amount),
          isIncome: String(isIncome),
        },
      });
    } catch (notifErr) {
      console.error('[addTransaction] transaction notification failed:', notifErr.message);
    }

    await updateBudgetsForTransaction(normalizedEmail, category, amount, isIncome);

    res.status(201).json(savedTransaction);
  } catch (error) {
    console.error("DATABASE SAVE ERROR:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ message: "Database Error", details: error.message });
    }
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: "Email parameter is required" });
    }

    const transactions = await Transaction.find({ email }).sort({ createdAt: -1 });
    console.log(`Success: Found ${transactions.length} items for ${email}`);
    res.status(200).json(transactions);
  } catch (error) {
    console.error("FETCH ERROR:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};