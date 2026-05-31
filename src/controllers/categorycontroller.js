
const Category = require('../models/category.model');

exports.getAllCategories = async (req, res) => {
  try {
    const userEmail = req.query.email ? req.query.email.trim().toLowerCase() : "";

    const categories = await Category.find({
      $or: [
        { email: "system" },
        { email: userEmail }
      ]
    }).sort({ isCustom: 1, title: 1 });

    console.log(`Querying for: "${userEmail}" | Found: ${categories.length}`);
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};