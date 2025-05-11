import nodemailer from 'nodemailer';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Define the structure of the email options
type EmailOptions = {
  to: string;
  subject: string;
  html: string;
};

// Configure the transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// General-purpose email sender
export async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  const mailOptions = {
    from: `"KringP App" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    return (info.accepted.length > 0) ? true : false;
    //return info.response;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}