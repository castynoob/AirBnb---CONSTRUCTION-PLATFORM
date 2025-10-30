import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendEmail = async (to, subject, text, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"Intervos App" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`Email sent to ${to}:`, info.messageId);
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
  }
};
