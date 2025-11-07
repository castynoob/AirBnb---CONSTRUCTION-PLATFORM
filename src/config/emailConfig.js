import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";

dotenv.config();

// Initialize SendGrid with API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Verify SendGrid is configured
if (process.env.SENDGRID_API_KEY) {
  console.log("✅ SendGrid API configured");
} else {
  console.log("❌ SendGrid API key missing");
}

export const sendVerificationEmail = async (email, token) => {
  // Use backend URL for verification (will redirect to frontend after verification)
  const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  const verificationUrl = `${backendUrl}/api/auth/verify-email?token=${token}`;

  const msg = {
    to: email,
    from: process.env.EMAIL_FROM, // Must be a verified sender in SendGrid
    subject: "Verify Your Email - Construction Platform",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3B82F6;">Email Verification</h1>
        <p>Click the button below to verify your email:</p>
        <a href="${verificationUrl}"
           style="display: inline-block; padding: 12px 24px; background-color: #3B82F6;
                  color: white; text-decoration: none; border-radius: 5px;">
          Verify Email
        </a>
        <p>Link: ${verificationUrl}</p>
        <p style="color: #999; font-size: 12px;">This link expires in 24 hours.</p>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ Verification email sent to ${email}`);
  } catch (error) {
    console.error("❌ SendGrid verification email error:", error.response?.body || error);
    throw error;
  }
};

export const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  const msg = {
    to: email,
    from: process.env.EMAIL_FROM, // Must be a verified sender in SendGrid
    subject: "Password Reset - Construction Platform",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3B82F6;">Password Reset</h1>
        <p>Click the button below to reset your password:</p>
        <a href="${resetUrl}"
           style="display: inline-block; padding: 12px 24px; background-color: #3B82F6;
                  color: white; text-decoration: none; border-radius: 5px;">
          Reset Password
        </a>
        <p>Link: ${resetUrl}</p>
        <p style="color: #999; font-size: 12px;">This link expires in 1 hour.</p>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ Password reset email sent to ${email}`);
  } catch (error) {
    console.error("❌ SendGrid password reset email error:", error.response?.body || error);
    throw error;
  }
};

export const sendMessageNotificationEmail = async (
  recipientEmail,
  recipientName,
  senderName,
  messagePreview
) => {
  const messagesUrl = `${process.env.FRONTEND_URL}/messages`;

  const msg = {
    to: recipientEmail,
    from: process.env.EMAIL_FROM,
    subject: `New message from ${senderName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h1 style="color: #00a5a9; margin-bottom: 20px;">💬 New Message</h1>
          <p style="font-size: 16px; color: #333;">Hi ${recipientName},</p>
          <p style="font-size: 16px; color: #333;">You have received a new message from <strong>${senderName}</strong>:</p>

          <div style="background-color: #f5f5f5; border-left: 4px solid #00a5a9; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; color: #666; font-style: italic;">"${messagePreview}"</p>
          </div>

          <a href="${messagesUrl}"
             style="display: inline-block; padding: 12px 30px; background-color: #00a5a9;
                    color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; font-weight: bold;">
            View Message
          </a>

          <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            You're receiving this email because you have message notifications enabled.
            <a href="${messagesUrl}" style="color: #00a5a9;">Manage your notification settings</a>
          </p>
        </div>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ Message notification email sent to ${recipientEmail}`);
  } catch (error) {
    console.error("❌ SendGrid message notification error:", error.response?.body || error);
    // Don't throw - email failure shouldn't break the message sending
  }
};

export default sgMail;