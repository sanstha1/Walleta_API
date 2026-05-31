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

    // ✅ Firebase Google UID — used as Firestore doc key for Google users
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

    // ✅ FCM push token — synced to Firestore via updateFcmToken endpoint
    fcmToken: { type: String, default: null },

    // ✅ Subscription / Plan fields
    plan: {
      type: String,
      enum: ["free", "trial", "monthly", "quarterly", "lifetime"],
      default: "free",
    },

    planStartDate:  { type: Date, default: null },
    planExpiryDate: { type: Date, default: null }, // null = never expires (lifetime)

    isPremium: { type: Boolean, default: false },

    // Feature flags derived from plan (stored for quick checks)
    features: {
      aiAccess: { type: Boolean, default: false },
      alerts: { type: Boolean, default: false },
      analytics: { type: Boolean, default: false },
      export: { type: Boolean, default: false },
      unlimitedVoice: { type: Boolean, default: false },
    },

    // Usage limits (reset logic to be enforced elsewhere)
    usage: {
      voiceCallsThisPeriod: { type: Number, default: 0 },
      voiceLimitPerMonth: { type: Number, default: 20 },
      aiCallsThisPeriod: { type: Number, default: 0 },
      aiLimitPerMonth: { type: Number, default: 0 },
    },

    paymentHistory: [
      {
        transactionId: { type: String },
        esewaRefId:    { type: String },
        plan:          { type: String },
        amount:        { type: Number },
        status: {
          type: String,
          enum: ["success", "failed", "pending"],
          default: "pending",
        },
        date: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// ─── Virtuals ────────────────────────────────────────────────────────────────

userSchema.virtual("isPlanActive").get(function () {
  if (this.plan === "none") return false;
  if (this.planExpiryDate === null) return true;
  return new Date() < this.planExpiryDate;
});

userSchema.virtual("secondsRemaining").get(function () {
  if (this.plan === "none") return 0;
  if (this.planExpiryDate === null) return null;
  return Math.max(0, Math.floor((this.planExpiryDate - new Date()) / 1000));
});

// ─── Pre-save hook ───────────────────────────────────────────────────────────

userSchema.pre("save", async function () {
  // compute active state
  if (this.plan === "free") {
    this.isPremium = false;
  } else if (this.planExpiryDate === null) {
    this.isPremium = true;
  } else {
    this.isPremium = new Date() < this.planExpiryDate;
  }

  // derive features & limits from plan
  switch (this.plan) {
    case "trial":
      // 7-day full trial
      this.features = {
        aiAccess: true,
        alerts: true,
        analytics: true,
        export: true,
        unlimitedVoice: true,
      };
      this.usage.voiceLimitPerMonth = 1000000; // effectively unlimited for trial
      this.usage.aiLimitPerMonth = 1000000;
      break;
    case "monthly":
      this.features = {
        aiAccess: true,
        alerts: true,
        analytics: false,
        export: false,
        unlimitedVoice: true,
      };
      this.usage.voiceLimitPerMonth = 1000000;
      this.usage.aiLimitPerMonth = 1000000;
      break;
    case "quarterly":
      this.features = {
        aiAccess: true,
        alerts: true,
        analytics: true,
        export: true,
        unlimitedVoice: true,
      };
      this.usage.voiceLimitPerMonth = 1000000;
      this.usage.aiLimitPerMonth = 1000000;
      break;
    case "lifetime":
      this.features = {
        aiAccess: true,
        alerts: true,
        analytics: true,
        export: true,
        unlimitedVoice: true,
      };
      this.planExpiryDate = null;
      this.usage.voiceLimitPerMonth = 1000000;
      this.usage.aiLimitPerMonth = 1000000;
      break;
    case "free":
    default:
      // free plan: limited voice + basic features
      this.features = {
        aiAccess: false,
        alerts: false,
        analytics: false,
        export: false,
        unlimitedVoice: false,
      };
      this.usage.voiceLimitPerMonth = 20;
      this.usage.aiLimitPerMonth = 0;
      break;
  }
});

module.exports = mongoose.model("User", userSchema);