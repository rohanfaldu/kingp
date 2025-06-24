import express, { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import bodyParser from 'body-parser';
import { PrismaClient, Prisma } from "@prisma/client";
import { Resend } from 'resend';
import response from '../utils/response';

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Configure your transporter
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', 
    port: 587,
    secure: false,
    auth: {
        user: 'your-email@gmail.com',        
        pass: 'your-app-password-or-token',  
    },
});


export const sendMail = async (req: Request, res: Response): Promise<any> => {
    const resend = new Resend('re_FKsFJzvk_4L1x2111AwnSDMqGCYGsLJeH');
    try {
        const { name, emailAddress, phone, inquiry_type, message } = req.body;

        if (!emailAddress) {
            return res.status(400).json({ success: false, message: 'Missing required fields.' });
        }

        const htmlContent = `
            <p>Hello ${name || emailAddress},</p>
            <p><strong>Email:</strong> ${emailAddress}</p>
            <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
            <p><strong>Inquiry Type:</strong> ${inquiry_type}</p>
            <p><strong>Message:</strong><br/>${message.replace(/\n/g, '<br/>')}</p>
            <p><strong>Thank You !!!!!!!!!!!!!</strong></p>
            `;

        const sendEmail = await resend.emails.send({
            from: 'KringP <info@kringp.com>',
            to: 'info@kringp.com',
            subject: 'Hello from KringP',
            html: htmlContent,
        });
        console.log(sendEmail, ' >>>>> sendEmail')
         return response.success(res, 'Message sent successfully.',null);

    } catch (error) {
        console.error('Email send error:', error);
        return response.error(res, 'Failed to send message.');
    }
}


