const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Category = require('./models/category.model.js'); 

dotenv.config();

const defaultCategories = [
  { title: 'Food', emoji: '🍔', email: 'system', isCustom: false },
  { title: 'Transport', emoji: '🚗', email: 'system', isCustom: false },
  { title: 'Shopping', emoji: '🛍️', email: 'system', isCustom: false },
  { title: 'Salary', emoji: '💰', email: 'system', isCustom: false },
  { title: 'Health', emoji: '🏥', email: 'system', isCustom: false },
  { title: 'Rent', emoji: '🏠', email: 'system', isCustom: false },
  { title: 'Entertainment', emoji: '🎬', email: 'system', isCustom: false },
];

const seedDB = async () => {
  try {
    
    await mongoose.connect(process.env.MONGO_URI || 'your_fallback_mongodb_uri_here');
    console.log("Connected to MongoDB for seeding...");

    
    await Category.deleteMany({ isCustom: false });
    console.log("Old system categories cleared.");

    
    await Category.insertMany(defaultCategories);
    console.log("Success: Default categories seeded!");

    process.exit();
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
};

seedDB();