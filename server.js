require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./src/config/db.js");
// const admin = require("firebase-admin");

// const serviceAccount = require("./firebase-service-account.json");
// if (!admin.apps.length) {
//   admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
//   console.log("Firebase Admin SDK Initialized");
// } else {
//   admin.app();
// }

const authRoutes = require("./src/routes/auth.routes.js");
const transactionRoutes = require("./src/routes/transaction.routes.js");
const paymentRoutes = require("./src/routes/payment.routes.js");
const budgetRoutes = require("./src/routes/budget.routes.js");
const featureRoutes = require("./src/routes/feature.routes.js");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} | ${req.method} ${req.url}`);
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api", transactionRoutes);
app.use("/api", budgetRoutes);
app.use("/api", featureRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.url} not found` });
});

app.use((err, req, res, next) => {
  console.error("[GLOBAL ERROR]", err.stack);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    console.log("MongoDB Connected");
    app.listen(PORT, "127.0.0.1", () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Startup Failed:", error.message);
    process.exit(1);
  }
};

startServer();