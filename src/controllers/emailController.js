import nodemailer from "nodemailer";
import pool from '../config/db.js'

export const sendEmailToAllEntrepreneurs = async (req, res) => {
  const { subject, message } = req.body;

  try {
    // 1️⃣ Fetch all entrepreneur emails
    const result = await pool.query(`
      SELECT u.email
      FROM users u
      JOIN entrepreneur_profiles e ON e.user_id = u.id
      WHERE u.email_verified = true;
    `);

    const entrepreneurs = result.rows;
    if (entrepreneurs.length === 0) {
      return res.status(404).json({ message: "No entrepreneurs found." });
    }

    // 2️⃣ Configure email transport
    const transporter = nodemailer.createTransport({
      service: "gmail", // can replace with your mail provider
      auth: {
        user: process.env.EMAIL_USER_URGENT,
        pass: process.env.EMAIL_PASS_URGENT,
      },
    });

    // 3️⃣ Send emails
    for (const e of entrepreneurs) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER_URGENT,
        to: e.email,
        subject,
        text: message,
      });
    }

    res.status(200).json({
      message: `Email sent to ${entrepreneurs.length} entrepreneurs.`,
    });
  } catch (error) {
    console.error("Email send error:", error);
    res.status(500).json({ message: "Error sending emails", error });
  }
};
