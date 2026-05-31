const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budget.controller.js');
const { protect } = require('../middleware/auth.middleware.js');

// ── CREATE BUDGET ─────────────────────────────────────────────────────────
// POST /api/budgets
// Body: { email, category?, limitAmount, monthYear?, alertThreshold?, alertsEnabled? }
router.post('/budgets', budgetController.createBudget);

// ── GET BUDGETS ─────────────────────────────────────────────────────────
// GET /api/budgets?email=user@email.com&monthYear=YYYY-MM
router.get('/budgets', budgetController.getBudgets);

// ── GET BUDGET SUMMARY ─────────────────────────────────────────────────────
// GET /api/budgets/summary?email=user@email.com&monthYear=YYYY-MM
router.get('/budgets/summary', budgetController.getBudgetSummary);

// ── UPDATE BUDGET ─────────────────────────────────────────────────────────
// PUT /api/budgets/:id
// Body: { limitAmount?, alertThreshold?, alertsEnabled? }
router.put('/budgets/:id', budgetController.updateBudget);

// ── DELETE BUDGET ─────────────────────────────────────────────────────────
// DELETE /api/budgets/:id?email=user@email.com
router.delete('/budgets/:id', budgetController.deleteBudget);

// ── CHECK BUDGET LIMIT ─────────────────────────────────────────────────────
// POST /api/budgets/check
// Body: { email, category, amount }
router.post('/budgets/check', budgetController.checkBudgetLimit);

module.exports = router;
