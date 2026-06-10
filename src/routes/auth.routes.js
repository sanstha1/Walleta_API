const express             = require("express");
const router              = express.Router();
const auth                = require("../controllers/authcontroller");
const { protect }         = require("../middleware/auth.middleware");
const { uploadProfilePicture } = require("../config/multer");

// ── Public routes ─────────────────────────────────────────────────────────────
router.post("/signup",          auth.signup);
router.post("/verify-otp",      auth.verifyOtp);
router.post("/login",           auth.login);
router.post("/forgot-password", auth.forgotPassword);
router.post("/reset-password",  auth.resetPassword);
router.post("/google",          auth.googleSignIn);

// ── Protected routes ──────────────────────────────────────────────────────────
router.get("/profile",                                                    protect, auth.getProfile);
router.patch("/update-profile", protect, auth.updateProfile);
router.post("/fcm-token",                                                 protect, auth.updateFcmToken);
router.post("/upload-profile-picture", protect, uploadProfilePicture.single("profileImage"), auth.uploadProfilePicture);

module.exports = router;