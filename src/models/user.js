const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },
    passwordHash: { type: String },

    firebaseUid: { type: String, default: null },

    authProvider: {
      type: String,
      enum: ["email", "google", "both"],
      default: "email",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    profileImage: { type: String, trim: true, default: "default-profile.png" },

    fcmToken: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);