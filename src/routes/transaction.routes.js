const express = require("express");
const router = express.Router();
const Transaction = require("../models/transaction.model.js");
const User = require("../models/user.js");
const Category = require("../models/category.model.js");
const { protect } = require('../middleware/auth.middleware.js');
const payment = require('../controllers/payment.controller.js');
const categoryController = require('../controllers/categorycontroller.js');
const transactionController = require('../controllers/transaction.controller.js');

// ── PREMIUM ACTIVATION ────────────────────────────────────────────────────────
router.post('/transactions/activate-premium', protect, payment.activatePremium);

router.get("/categories", categoryController.getAllCategories);

// Create a new custom category
router.post("/categories", async (req, res) => {
  try {
    const { title, emoji, email } = req.body;
    // We mark manually created categories as isCustom: true
    const newCategory = new Category({ 
      title, 
      emoji, 
      email: email.trim().toLowerCase(), 
      isCustom: true 
    });
    await newCategory.save();
    res.status(201).json(newCategory);
  } catch (error) {
    res.status(500).json({ message: "Error saving category" });
  }
});

// Delete a custom category
router.delete("/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.query; 
    
    // Only allow deleting if it belongs to the user (security check)
    const deleted = await Category.findOneAndDelete({ 
      _id: id, 
      email: email.trim().toLowerCase() 
    });
    
    if (!deleted) return res.status(404).json({ message: "Category not found or unauthorized" });
    
    res.json({ message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting category" });
  }
});

// ── TRANSACTION ROUTES ────────────────────────────────────────────────────────

router.get("/transactions", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Email is required" });
    const cleanEmail = email.trim().toLowerCase();
    const transactions = await Transaction.find({ email: cleanEmail }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/transactions", transactionController.addTransaction);


// // Create new transaction
// router.post("/transactions", async (req, res) => {
//   try {
//     const { title, amount, category, emoji, isIncome, email } = req.body;
    
//     if (!email) return res.status(400).json({ message: "Email is required" });

//     const newTransaction = new Transaction({ 
//       title, 
//       amount, 
//       category, 
//       emoji, 
//       isIncome, 
//       email: email.trim().toLowerCase() 
//     });
    
//     await newTransaction.save();
//     res.status(201).json(newTransaction);
//   } catch (error) {
//     console.error("Save Error:", error.message);
//     res.status(500).json({ error: error.message });
//   }
// });

router.delete("/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.query;

    if (!id) {
      return res.status(400).json({ message: "Transaction ID is required" });
    }

    // ✅ Delete by ID only — email mismatch was causing 404
    const deletedTransaction = await Transaction.findByIdAndDelete(id);

    if (!deletedTransaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.status(200).json({ success: true, message: "Transaction deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error during deletion" });
  }
});

// Update a transaction
router.put("/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.query;
    const updateData = req.body;

    const updatedTransaction = await Transaction.findOneAndUpdate(
      { _id: id, email: email.trim().toLowerCase() },
      { $set: updateData },
      { new: true } 
    );

    if (!updatedTransaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.status(200).json(updatedTransaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;