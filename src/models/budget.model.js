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
    
    category: {
      type: String,
      default: null,
    },
    
    limitAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    
    period: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'monthly',
    },
    
    periodKey: {
      type: String,
      required: true,
    },
    
    alertThreshold: {
      type: Number,
      default: 80,
      min: 1,
      max: 100,
    },
    
    alertsEnabled: {
      type: Boolean,
      default: true,
    },
    
    spent: {
      type: Number,
      default: 0,
      min: 0,
    },
   
    alertSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);


budgetSchema.index({ email: 1, period: 1, periodKey: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);
