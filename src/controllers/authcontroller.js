const bcrypt       = require("bcrypt");
const jwt          = require("jsonwebtoken");
const admin        = require("firebase-admin");
const path         = require("path");
const fs           = require("fs");
const User         = require("../models/user.js");
const Otp          = require("../models/otp.js");
const sendOtpEmail = require("../utils/mailer.js");

const {
  signupSchema,
  loginSchema,
  verifyOtpSchema,
  forgotSchema,
  resetPasswordSchema,
} = require("../validators/auth.validator.js");

const db = admin.firestore();

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const makeOtp        = () => String(Math.floor(100000 + Math.random() * 900000));
const signToken      = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

const zodError = (res, e) => {
  const messages = Array.isArray(e.errors)
    ? e.errors.map((err) => err.message)
    : Object.values(e.errors).map((err) => err.message || err);
  return res.status(400).json({ errors: messages });
};

const upsertFirestoreUser = async (docId, payload) => {
  try {
    await db.collection("users").doc(docId).set(payload, { merge: true });
  } catch (err) {
    console.error("[FIRESTORE UPSERT ERROR]", err);
  }
};

exports.signup = async (req, res) => {
  let newUser;
  try {
    const parsed = signupSchema.parse(req.body);
    const email  = normalizeEmail(parsed.email);
    const { name, password } = parsed;

    if (await User.findOne({ email })) {
      return res.status(400).json({ message: "Email already used" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    newUser = await User.create({
      name,
      email,
      passwordHash,
      authProvider: "email",
      isVerified:   false,
    });

    await upsertFirestoreUser(newUser._id.toString(), {
      email,
      name,
      fcmToken:  null,
      mongoId:   newUser._id.toString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const otp       = makeOtp();
    const otpHash   = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await Otp.deleteMany({ email, purpose: "verify" });
    await Otp.create({ email, otpHash, purpose: "verify", expiresAt });

    try {
      await sendOtpEmail(email, otp, "signup");
    } catch (mailError) {
      console.error("[SIGNUP] Mail failed, rolling back:", mailError);
      if (newUser) {
        await User.deleteOne({ _id: newUser._id });
        await db.collection("users").doc(newUser._id.toString()).delete().catch(() => {});
      }
      await Otp.deleteMany({ email, purpose: "verify" });
      return res.status(500).json({
        message: "Failed to send OTP. Please check your email and try again.",
      });
    }

    return res.status(201).json({
      message: "Signup successful. Please check your email for the OTP.",
    });
  } catch (e) {
    if (e.errors) return zodError(res, e);
    console.error("[SIGNUP ERROR]", e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const email  = normalizeEmail(parsed.email);

    const user = await User.findOne({ email });

    if (!user)
      return res.status(404).json({ message: "No account found with this email" });

    if (!user.passwordHash)
      return res.status(400).json({ message: "This account uses Google Sign In" });

    const ok = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!ok)
      return res.status(401).json({ message: "Incorrect password" });

    if (!user.isVerified)
      return res.status(403).json({ message: "Account not verified" });

    await upsertFirestoreUser(user._id.toString(), {
      email:   user.email,
      name:    user.name,
      mongoId: user._id.toString(),
    });

    const token = signToken(user._id.toString());

    return res.status(200).json({
      status: "success",
      data: {
        accessToken: token,
        user: {
          id:           user._id,
          name:         user.name,
          email:        user.email,
          profileImage: user.profileImage,
        },
      },
    });
  } catch (e) {
    if (e.errors) return zodError(res, e);
    console.error("[LOGIN ERROR]", e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.googleSignIn = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken)
      return res.status(400).json({ message: "Firebase ID token required" });

    const decoded = await admin.auth().verifyIdToken(idToken);
    const email   = normalizeEmail(decoded.email);

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name:         decoded.name    || "User",
        email,
        profileImage: decoded.picture || "default-profile.png",
        firebaseUid:  decoded.uid,
        authProvider: "google",
        isVerified:   true,
      });
    } else {
      let dirty = false;
      if (!user.firebaseUid)             { user.firebaseUid  = decoded.uid; dirty = true; }
      if (user.authProvider === "email") { user.authProvider = "both";      dirty = true; }
      if (!user.isVerified)              { user.isVerified   = true;        dirty = true; }
      if (dirty) await user.save();
    }

    await upsertFirestoreUser(decoded.uid, {
      email,
      name:    decoded.name || user.name || "User",
      mongoId: user._id.toString(),
    });

    const accessToken = signToken(user._id.toString());

    return res.status(200).json({
      status: "success",
      data: {
        accessToken,
        user: {
          id:           user._id,
          name:         user.name,
          email:        user.email,
          profileImage: user.profileImage,
          authProvider: user.authProvider,
        },
      },
    });
  } catch (e) {
    console.error("[GOOGLE SIGN IN ERROR]", e);
    return res.status(401).json({ message: "Invalid Firebase token" });
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({
      status: "success",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "FCM Token is required",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { fcmToken },
      { new: true }
    );

    if (user) {
      const docId = user.firebaseUid || user._id.toString();
      await upsertFirestoreUser(docId, { fcmToken });
    }

    res.status(200).json({
      success: true,
      message: "Notification token updated successfully",
    });
  } catch (error) {
    console.error("FCM Update Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (
      user.profileImage &&
      user.profileImage !== "default-profile.png" &&
      !user.profileImage.startsWith("http")
    ) {
      const oldPath = path.join(__dirname, "../public/profile_pictures", user.profileImage);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const imageUrl = `${req.protocol}://${req.get("host")}/profile_pictures/${req.file.filename}`;

    user.profileImage = imageUrl;
    await user.save();

    return res.status(200).json({
      status: "success",
      message: "Profile picture updated successfully",
      data: {
        profileImage: imageUrl,
      },
    });
  } catch (error) {
    console.error("[UPLOAD PROFILE PICTURE ERROR]", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const parsed = verifyOtpSchema.parse(req.body);
    const email  = normalizeEmail(parsed.email);
    const otp    = String(parsed.otp).trim();

    const otpDoc = await Otp.findOne({ email, purpose: "verify" }).sort({ _id: -1 });

    if (!otpDoc)
      return res.status(400).json({ message: "OTP expired or not found" });

    if (otpDoc.expiresAt.getTime() < Date.now()) {
      await Otp.deleteMany({ email, purpose: "verify" });
      return res.status(400).json({ message: "OTP expired" });
    }

    const isMatch = await bcrypt.compare(otp, otpDoc.otpHash);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid OTP" });

    await User.updateOne({ email }, { $set: { isVerified: true } });
    await Otp.deleteMany({ email, purpose: "verify" });

    return res.json({ message: "Account verified successfully" });
  } catch (e) {
    if (e.errors) return zodError(res, e);
    console.error("[VERIFY OTP ERROR]", e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: "No user found with this email" });
    }

    const otp       = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash   = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await Otp.deleteMany({ email, purpose: "reset" });
    await Otp.create({ email, otpHash, purpose: "reset", expiresAt });

    await sendOtpEmail(email, otp, "reset");

    return res.status(200).json({ status: 200, message: "Reset OTP sent to email" });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const parsed = resetPasswordSchema.parse(req.body);
    const email  = normalizeEmail(parsed.email);
    const otp    = String(parsed.otp).trim();

    const otpDoc = await Otp.findOne({ email, purpose: "reset" }).sort({ _id: -1 });

    if (!otpDoc) return res.status(400).json({ message: "OTP not found" });
    if (otpDoc.expiresAt < new Date()) {
      await Otp.deleteMany({ email, purpose: "reset" });
      return res.status(400).json({ message: "OTP expired" });
    }

    const ok = await bcrypt.compare(otp, otpDoc.otpHash);
    if (!ok) return res.status(400).json({ message: "Invalid OTP" });

    const passwordHash = await bcrypt.hash(parsed.newPassword, 10);
    await User.updateOne({ email }, { $set: { passwordHash } });
    await Otp.deleteMany({ email, purpose: "reset" });

    const updatedUser = await User.findOne({ email });
    const accessToken = signToken(updatedUser._id.toString());

    return res.json({
      status: "success",
      message: "Password updated successfully",
      data: {
        accessToken,
        user: {
          id:           updatedUser._id,
          name:         updatedUser.name,
          email:        updatedUser.email,
          profileImage: updatedUser.profileImage,
        },
      },
    });
  } catch (e) {
    if (e.errors) return zodError(res, e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.checkOtpStatus = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Email required" });

    const normalizedEmail = normalizeEmail(email);
    const otps = await Otp.find({ email: normalizedEmail }).sort({ _id: -1 });
    const now  = Date.now();

    return res.json({
      email:       normalizedEmail,
      currentTime: new Date(now).toISOString(),
      totalOtps:   otps.length,
      otps: otps.map((otp) => ({
        purpose:    otp.purpose,
        createdAt:  otp.createdAt,
        expiresAt:  otp.expiresAt,
        timeLeftMs: otp.expiresAt.getTime() - now,
        isExpired:  otp.expiresAt.getTime() < now,
      })),
    });
  } catch (e) {
    console.error("[CHECK OTP STATUS ERROR]", e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name: name.trim() },
      { new: true }
    );

    res.status(200).json({ message: "Profile updated", data: user });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};