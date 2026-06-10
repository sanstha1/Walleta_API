const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budgetcontroller.js');
const { protect } = require('../middleware/auth.middleware.js');


router.post('/budgets', budgetController.createBudget);


router.get('/budgets', budgetController.getBudgets);


router.get('/budgets/summary', budgetController.getBudgetSummary);


router.put('/budgets/:id', budgetController.updateBudget);

router.delete('/budgets/:id', budgetController.deleteBudget);


router.post('/budgets/check', budgetController.checkBudgetLimit);

module.exports = router;
