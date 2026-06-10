const nodemailer = require("nodemailer");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((error) => {
  if (error) {
    console.error("[Mailer] Connection Error:", error);
  } else {
    console.log("[Mailer] Server is ready to deliver messages");
  }
});

const sendOtpEmail = async (email, otp, type = "signup") => {
  const isReset = type === "reset";

  const subject = isReset
    ? "Reset Your Walleta Password"
    : "Verify Your Walleta Account";

  const title = isReset
    ? "Password Reset Request"
    : "Welcome to Walleta!";

  const messageWording = isReset
    ? "We received a request to reset your password. Use the code below to proceed:"
    : "Thank you for joining Walleta! Please use the following code to verify your identity:";

  const mailOptions = {
    from: `"Walleta App" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: subject,
    text: `Your OTP is: ${otp}. It expires in 10 minutes.`,
    html: `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; padding: 40px; background-color: #ffffff; border: 1px solid #f0f0f0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1A73E8; margin: 0; font-size: 28px;">Walleta</h1>
        <p style="color: #666; font-size: 14px; margin-top: 5px;">Your Smart Wallet Companion</p>
      </div>

      <h2 style="color: #333; font-size: 20px; text-align: center;">${title}</h2>
      <p style="color: #555; font-size: 16px; line-height: 1.6; text-align: center;">
        ${messageWording}
      </p>

      <div style="text-align: center; margin: 40px 0;">
        <div style="display: inline-block; letter-spacing: 8px; font-size: 36px; font-weight: bold; color: #1A73E8; background: #E8F0FE; padding: 15px 30px; border-radius: 8px; border: 2px dashed #1A73E8;">
          ${otp}
        </div>
      </div>

      <p style="color: #888; font-size: 13px; text-align: center; line-height: 1.5;">
        This code is valid for <b>10 minutes</b>.<br/>
        If you did not request this email, you can safely ignore it.
      </p>

      <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />

      <p style="color: #bbb; font-size: 11px; text-align: center;">
        &copy; 2026 Walleta App. All rights reserved.
      </p>
    </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email Success] ${type.toUpperCase()} OTP sent to ${email}`);
    return info;
  } catch (error) {
    console.error(`[Email Error] Failed to send ${type}:`, error.message);
    throw new Error("Email delivery failed");
  }
};

module.exports = sendOtpEmail;