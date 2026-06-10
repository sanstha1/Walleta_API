const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  title: { type: String, required: true },
  emoji: { type: String, default: "📁" },
  email: { type: String, required: true }, 
  isCustom: { type: Boolean, default: true } 
}, { timestamps: true });

module.exports = mongoose.model("Category", categorySchema);