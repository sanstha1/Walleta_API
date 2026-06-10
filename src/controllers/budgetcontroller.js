const Budget = require('../models/budget.model.js');
const Transaction = require('../models/transaction.model.js');
const { sendNotification } = require('../utils/notification.js');
const User = require('../models/user.js');

// ── HELPERS ───────────────────────────────────────────────────────────────

const getCurrentMonthYear = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const getCurrentPeriodKey = (period) => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  switch (period) {
    case 'daily':
      return `${year}-${month}-${day}`;

    case 'weekly': {
      const tempDate = new Date(date);
      tempDate.setHours(0, 0, 0, 0);
      tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
      const week1 = new Date(tempDate.getFullYear(), 0, 4);
      const weekNum = 1 + Math.round(
        ((tempDate - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7
      );
      return `${year}-W${String(weekNum).padStart(2, '0')}`;
    }

    case 'monthly':
    default:
      return `${year}-${month}`;
  }
};

const getPeriodDateRange = (periodKey, period) => {
  const parts = periodKey.split('-');

  switch (period) {
    case 'daily': {
      const [y, m, d] = parts.map(Number);
      const startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
      const endDate   = new Date(y, m - 1, d, 23, 59, 59, 999);
      return { startDate, endDate };
    }

    case 'weekly': {
      const yearNum = parseInt(parts[0]);
      const weekNum = parseInt(parts[1].substring(1)); // strip 'W'
      const jan4 = new Date(yearNum, 0, 4);
      const week1Monday = new Date(jan4);
      week1Monday.setDate(jan4.getDate() - (jan4.getDay() + 6) % 7);
      const startDate = new Date(week1Monday);
      startDate.setDate(week1Monday.getDate() + (weekNum - 1) * 7);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      return { startDate, endDate };
    }

    case 'monthly':
    default: {
      const year  = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const endDate   = new Date(year, month, 0, 23, 59, 59, 999);
      return { startDate, endDate };
    }
  }
};

const calculateSpent = async (email, category, periodKey, period) => {
  const { startDate, endDate } = getPeriodDateRange(periodKey, period);

  const query = {
    email: email.toLowerCase().trim(),
    isIncome: false,
    createdAt: { $gte: startDate, $lte: endDate },
  };

  if (category) query.category = category;

  const transactions = await Transaction.find(query);
  return transactions.reduce((sum, t) => sum + t.amount, 0);
};

const getUserFcmToken = async (email) => {
  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    return user?.fcmToken || null;
  } catch (err) {
    console.error('Error fetching user FCM token:', err);
    return null;
  }
};

const checkAndSendAlert = async (budget, email) => {
  if (!budget.alertsEnabled || budget.alertSent) return;

  const spent = budget.spent || 0;
  const threshold = (budget.alertThreshold / 100) * budget.limitAmount;

  if (spent >= threshold) {
    const budgetType     = budget.category ? `${budget.category} category` : 'overall';
    const percentageUsed = Math.round((spent / budget.limitAmount) * 100);

    const fcmToken = await getUserFcmToken(email);
    if (fcmToken) {
      await sendNotification({
        token: fcmToken,
        type: 'budget_alert',
        title: '💰 Budget Alert!',
        body: `You've used ${percentageUsed}% of your ${budgetType} budget (Rs. ${spent.toFixed(2)} of Rs. ${budget.limitAmount})`,
        metadata: {
          budgetId: budget._id.toString(),
          category: budget.category || 'overall',
          spent:    String(spent),
          limit:    String(budget.limitAmount),
        },
      });
    }

    await Budget.updateOne({ _id: budget._id }, { alertSent: true });
  }
};

// ── CREATE BUDGET ─────────────────────────────────────────────────────────
exports.createBudget = async (req, res) => {
  try {
    const { upgradePrompt } = require('../utils/subscription');
    const {
      email, category, limitAmount,
      period = 'monthly', monthYear,
      alertThreshold, alertsEnabled,
    } = req.body;

    const normalizedEmail = email.toLowerCase().trim();

    if (!limitAmount || limitAmount <= 0) {
      return res.status(400).json({ message: 'Invalid budget limit amount' });
    }

    const periodKey = period === 'monthly'
      ? monthYear || getCurrentMonthYear()
      : getCurrentPeriodKey(period);

    // 1. Duplicate check
    const existing = await Budget.findOne({
      email: normalizedEmail,
      period,
      periodKey,
      category: category || null,
    });

    if (existing) {
      return res.status(409).json({
        message: `A ${period} budget for "${category || 'overall'}" already exists.`,
        code: 'DUPLICATE_BUDGET',
        existingBudgetId: existing._id,
      });
    }

    
    if (alertsEnabled) {
      const user = await User.findOne({ email: normalizedEmail });
      if (!user || !user.isPremium) {
        const prompt = upgradePrompt(user);
        return res.status(402).json({ ok: false, upgrade: true, message: prompt.message });
      }
    }

    // 3. Calculate spent after all checks pass
    const spent = await calculateSpent(normalizedEmail, category, periodKey, period);

    // 4. Create and save
    const newBudget = new Budget({
      email: normalizedEmail,
      category: category || null,
      limitAmount,
      period,
      periodKey,
      monthYear: monthYear || getCurrentMonthYear(),
      alertThreshold: alertThreshold || 80,
      alertsEnabled:  alertsEnabled || false,
      spent,
      alertSent: false,
    });

    const savedBudget = await newBudget.save();
    await checkAndSendAlert(savedBudget, normalizedEmail);

    res.status(201).json({ message: 'Budget created successfully', budget: savedBudget });

  } catch (error) {
    console.error('Error creating budget:', error);
    res.status(500).json({ message: 'Error creating budget', error: error.message });
  }
};

// ── GET BUDGETS ───────────────────────────────────────────────────────────
exports.getBudgets = async (req, res) => {
  try {
    const { email, monthYear, period } = req.query;
    const normalizedEmail = email.toLowerCase().trim();

    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const query = { email: normalizedEmail };
    if (monthYear) query.monthYear = monthYear;
    if (period)    query.period    = period;

    const budgets = await Budget.find(query).sort({ createdAt: -1 });

    const updatedBudgets = await Promise.all(
      budgets.map(async (budget) => {
        const budgetPeriod    = budget.period    || 'monthly';
        const budgetMonthYear = budget.monthYear || getCurrentMonthYear();

        // Backfill periodKey if missing (old records)
        if (!budget.periodKey) {
          budget.periodKey = budgetPeriod === 'monthly'
            ? budgetMonthYear
            : getCurrentPeriodKey(budgetPeriod);
        }

        const spent = await calculateSpent(
          normalizedEmail, budget.category, budget.periodKey, budgetPeriod
        );

        budget.spent = spent;
        if (!budget.monthYear) budget.monthYear = budgetMonthYear;
        await budget.save();

        // Fire alerts on every fetch
        await checkAndSendAlert(budget, normalizedEmail);

        return budget;
      })
    );

    res.json(updatedBudgets);

  } catch (error) {
    console.error('Error fetching budgets:', error);
    res.status(500).json({ message: 'Error fetching budgets', error: error.message });
  }
};

// ── UPDATE BUDGET ─────────────────────────────────────────────────────────
exports.updateBudget = async (req, res) => {
  try {
    const { upgradePrompt } = require('../utils/subscription');
    const { id } = req.params;
    const { limitAmount, alertThreshold, alertsEnabled, period } = req.body;

    const budget = await Budget.findById(id);
    if (!budget) return res.status(404).json({ message: 'Budget not found' });

    if (limitAmount    !== undefined) budget.limitAmount    = limitAmount;
    if (alertThreshold !== undefined) budget.alertThreshold = alertThreshold;

    // Period update — recalculate periodKey and spent
    if (period !== undefined && period !== budget.period) {
      budget.period    = period;
      budget.periodKey = period === 'monthly'
        ? budget.monthYear || getCurrentMonthYear()
        : getCurrentPeriodKey(period);
      budget.alertSent = false;
      budget.spent = await calculateSpent(
        budget.email, budget.category, budget.periodKey, period
      );
    }

    if (alertsEnabled !== undefined) {
      if (alertsEnabled) {
        const user = await User.findOne({ email: budget.email });
        if (!user || !user.isPremium) {
          const prompt = upgradePrompt(user);
          return res.status(402).json({ ok: false, upgrade: true, message: prompt.message });
        }
      }
      budget.alertsEnabled = alertsEnabled;
      if (alertsEnabled) budget.alertSent = false;
    }

    const updated = await budget.save();
    await checkAndSendAlert(updated, budget.email);

    res.json({ message: 'Budget updated successfully', budget: updated });

  } catch (error) {
    console.error('Error updating budget:', error);
    res.status(500).json({ message: 'Error updating budget', error: error.message });
  }
};

// ── DELETE BUDGET ─────────────────────────────────────────────────────────
exports.deleteBudget = async (req, res) => {
  try {
    const { id }    = req.params;
    const { email } = req.query;

    const deleted = await Budget.findOneAndDelete({
      _id: id,
      email: email.toLowerCase().trim(),
    });

    if (!deleted) return res.status(404).json({ message: 'Budget not found or unauthorized' });

    res.json({ message: 'Budget deleted successfully' });

  } catch (error) {
    console.error('Error deleting budget:', error);
    res.status(500).json({ message: 'Error deleting budget', error: error.message });
  }
};

// ── GET BUDGET SUMMARY ────────────────────────────────────────────────────
exports.getBudgetSummary = async (req, res) => {
  try {
    const { email, monthYear } = req.query;
    const normalizedEmail = email.toLowerCase().trim();

    if (!normalizedEmail) return res.status(400).json({ message: 'Email is required' });

    const budgetMonth = monthYear || getCurrentMonthYear();
    const budgets = await Budget.find({ email: normalizedEmail, monthYear: budgetMonth });

    const summary = await Promise.all(
      budgets.map(async (budget) => {
        const budgetPeriod = budget.period    || 'monthly';
        const periodKey    = budget.periodKey || budgetMonth;
        const spent = await calculateSpent(normalizedEmail, budget.category, periodKey, budgetPeriod);

        budget.spent = spent;
        await budget.save();

        const percentageUsed = (spent / budget.limitAmount) * 100;
        const remaining      = Math.max(0, budget.limitAmount - spent);
        const isExceeded     = spent > budget.limitAmount;

        return {
          id:             budget._id,
          category:       budget.category || 'Overall',
          limitAmount:    budget.limitAmount,
          spent,
          remaining,
          percentageUsed: Math.round(percentageUsed),
          isExceeded,
          alertThreshold: budget.alertThreshold,
          alertsEnabled:  budget.alertsEnabled,
        };
      })
    );

    res.json({ monthYear: budgetMonth, budgets: summary });

  } catch (error) {
    console.error('Error fetching budget summary:', error);
    res.status(500).json({ message: 'Error fetching budget summary', error: error.message });
  }
};

// ── CHECK BUDGET BEFORE TRANSACTION ──────────────────────────────────────
exports.checkBudgetLimit = async (req, res) => {
  try {
    const { email, category, amount } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    if (!normalizedEmail || !category || !amount) {
      return res.status(400).json({ message: 'Email, category, and amount are required' });
    }

    const issues = [];

    // Check ALL active budgets that could be affected (any period)
    const allBudgets = await Budget.find({
      email: normalizedEmail,
      $or: [{ category: null }, { category }],
    });

    for (const budget of allBudgets) {
      const budgetPeriod = budget.period    || 'monthly';
      const periodKey    = budget.periodKey || getCurrentPeriodKey(budgetPeriod);
      const currentSpent = await calculateSpent(normalizedEmail, budget.category, periodKey, budgetPeriod);
      const projected    = currentSpent + amount;

      if (projected > budget.limitAmount) {
        issues.push({
          type:      budget.category ? 'category_exceeded' : 'overall_exceeded',
          category:  budget.category || 'overall',
          message:   `This transaction will exceed your ${budget.category || 'overall'} (${budgetPeriod}) budget. Current: Rs. ${currentSpent}, Limit: Rs. ${budget.limitAmount}`,
          limit:     budget.limitAmount,
          current:   currentSpent,
          projected,
        });
      }
    }

    res.json({ canProceed: issues.length === 0, issues });

  } catch (error) {
    console.error('Error checking budget limit:', error);
    res.status(500).json({ message: 'Error checking budget limit', error: error.message });
  }
};