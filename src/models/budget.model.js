const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // null = overall budget, string = category-specific budget
    category: {
      type: String,
      default: null,
    },
    // Budget limit amount
    limitAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Budget period: 'daily', 'weekly', 'monthly'
    period: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'monthly',
    },
    // Period identifier (format depends on period type)
    // daily: "YYYY-MM-DD", weekly: "YYYY-WW", monthly: "YYYY-MM"
    periodKey: {
      type: String,
      required: true,
    },
    // Alert threshold as percentage (e.g., 80 means alert at 80% of budget)
    alertThreshold: {
      type: Number,
      default: 80,
      min: 1,
      max: 100,
    },
    // Whether alerts are enabled
    alertsEnabled: {
      type: Boolean,
      default: true,
    },
    // Current spending in this period
    spent: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Whether alert has been sent for this budget
    alertSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Create compound index for efficient querying
budgetSchema.index({ email: 1, period: 1, periodKey: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);
