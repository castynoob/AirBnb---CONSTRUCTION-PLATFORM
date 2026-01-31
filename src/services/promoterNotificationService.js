import nodemailer from 'nodemailer';
import db from '../config/db.js';
import { Promoter, PromoCodeRedemption } from '../models/promoterModel.js';

/**
 * Create email transporter
 */
const createTransporter = () => {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER_URGENT,
            pass: process.env.EMAIL_PASS_URGENT,
        },
    });
};

/**
 * Notify promoter when someone uses their referral code
 */
export const notifyPromoterOfReferral = async (promoter, newCustomer, redemptionId) => {
    try {
        const transporter = createTransporter();

        // Get total referral count
        const referralCount = await Promoter.getReferralCount(promoter.id);

        const mailOptions = {
            from: `Intervos Platform <${process.env.EMAIL_USER_URGENT}>`,
            to: promoter.promoter_email,
            subject: `New referral: Someone used your code ${promoter.referral_code}!`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">New Referral!</h2>

                    <p>Hi ${promoter.promoter_name},</p>

                    <p>Great news! Someone just signed up using your referral code <strong>${promoter.referral_code}</strong>.</p>

                    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0;"><strong>New Customer:</strong> ${newCustomer.first_name} ${newCustomer.last_name}</p>
                        <p style="margin: 10px 0 0 0;"><strong>Your Total Referrals:</strong> ${referralCount}</p>
                    </div>

                    <p>Keep sharing your code to grow your audience!</p>

                    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                        - The Intervos Team
                    </p>
                </div>
            `,
        };

        await transporter.sendMail(mailOptions);

        // Mark as notified
        if (redemptionId) {
            await PromoCodeRedemption.markNotified(redemptionId);
        }

        console.log(`📧 Notification sent to promoter: ${promoter.promoter_email}`);
        return true;

    } catch (error) {
        console.error('❌ Failed to send promoter notification:', error.message);
        return false;
    }
};

/**
 * Send welcome email to new promoter
 */
export const sendPromoterWelcomeEmail = async (promoter) => {
    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: `Intervos Platform <${process.env.EMAIL_USER_URGENT}>`,
            to: promoter.promoter_email,
            subject: 'Welcome to the Intervos Promoter Program!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Welcome, ${promoter.promoter_name}!</h2>

                    <p>You've been added to the Intervos Promoter Program.</p>

                    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">Your Codes</h3>
                        <p><strong>Activation Code:</strong> <code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px;">${promoter.activation_code}</code></p>
                        <p style="color: #6b7280; font-size: 14px;">Use this code when subscribing to get FREE platform access.</p>

                        <hr style="border: none; border-top: 1px solid #d1d5db; margin: 15px 0;">

                        <p><strong>Referral Code:</strong> <code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px;">${promoter.referral_code}</code></p>
                        <p style="color: #6b7280; font-size: 14px;">Share this code with your audience. They'll get ${promoter.discount_percent}% off their first month!</p>
                    </div>

                    <h3>Getting Started</h3>
                    <ol>
                        <li>Sign up as an entrepreneur on Intervos</li>
                        <li>When prompted for subscription, enter your activation code</li>
                        <li>Start promoting and share your referral code!</li>
                    </ol>

                    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                        - The Intervos Team
                    </p>
                </div>
            `,
        };

        await transporter.sendMail(mailOptions);
        console.log(`📧 Welcome email sent to promoter: ${promoter.promoter_email}`);
        return true;

    } catch (error) {
        console.error('❌ Failed to send promoter welcome email:', error.message);
        return false;
    }
};

export default {
    notifyPromoterOfReferral,
    sendPromoterWelcomeEmail
};
