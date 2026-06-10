const express = require("express");
const router = express.Router();
const Transaction = require("../models/transaction.model.js");
const Category = require("../models/category.model.js");
const categoryController = require('../controllers/categorycontroller.js');
const transactionController = require('../controllers/transactioncontroller.js');

router.get("/categories", categoryController.getAllCategories);

router.post("/categories", async (req, res) => {
  try {
    const { title, emoji, email } = req.body;
    const newCategory = new Category({
      title,
      emoji,
      email: email.trim().toLowerCase(),
      isCustom: true,
    });
    await newCategory.save();
    res.status(201).json(newCategory);
  } catch (error) {
    res.status(500).json({ message: "Error saving category" });
  }
});

router.delete("/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.query;

    const deleted = await Category.findOneAndDelete({
      _id: id,
      email: email.trim().toLowerCase(),
    });

    if (!deleted) return res.status(404).json({ message: "Category not found or unauthorized" });

    res.json({ message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting category" });
  }
});

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

router.delete("/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Transaction ID is required" });
    }

    const deletedTransaction = await Transaction.findByIdAndDelete(id);

    if (!deletedTransaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.status(200).json({ success: true, message: "Transaction deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error during deletion" });
  }
});

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