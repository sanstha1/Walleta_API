const jwt   = require("jsonwebtoken");
const admin = require("firebase-admin");
const User  = require("../models/user.js");

exports.protect = async (req, res, next) => {
  let token;

  // 1. Extract Bearer token
  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      status:  "fail",
      message: "Access denied. No token provided.",
    });
  }

  try {
    // 2. Detect token type — Firebase tokens have iss = securetoken.google.com
    let isFirebaseToken = false;
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
      isFirebaseToken = !!payload.iss?.includes("securetoken.google.com");
    } catch {
      return res.status(401).json({ message: "Invalid token format" });
    }

    let currentUser;

    if (isFirebaseToken) {
      // 3a. Firebase / Google token
      const decoded = await admin.auth().verifyIdToken(token);
      const email   = decoded.email.toLowerCase().trim();

      currentUser = await User.findOne({ email }).select("-passwordHash");

      if (!currentUser) {
        currentUser = await User.create({
          name:         decoded.name    || "User",
          email,
          profileImage: decoded.picture || null,
          firebaseUid:  decoded.uid,
          authProvider: "google",
          isVerified:   true,
          plan:         "none",
          isPremium:    false,
        });
      } else if (!currentUser.firebaseUid || currentUser.authProvider === "email") {
        currentUser.firebaseUid  = decoded.uid;
        currentUser.authProvider = currentUser.authProvider === "email" ? "both" : currentUser.authProvider;
        await currentUser.save();
      }

    } else {
      // 3b. Internal JWT — sets req.user._id (MongoDB ObjectId)
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      currentUser   = await User.findById(decoded.userId).select("-passwordHash");
    }

    // 4. Guard
    if (!currentUser) {
      return res.status(401).json({ message: "The user belonging to this token no longer exists." });
    }

    // 5. Attach full user object — downstream code uses req.user._id / req.user.firebaseUid
    req.user = currentUser;
    next();

  } catch (error) {
    console.error("[AUTH MIDDLEWARE ERROR]:", error.name, error.message);

    if (error.name === "TokenExpiredError")
      return res.status(401).json({ message: "Your session has expired. Please login again." });

    if (error.name === "JsonWebTokenError")
      return res.status(401).json({ message: "Invalid token. Please login again." });

    return res.status(401).json({ status: "error", message: "Not authorized", error: error.message });
  }
};