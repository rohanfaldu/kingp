import express, { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import bodyParser from 'body-parser';
import { PrismaClient, Prisma, EmailTemplateType } from '@prisma/client';
import { Resend } from 'resend';
import response from '../utils/response';
import { generateSlug } from '../utils/commonFunction';

const prisma = new PrismaClient();

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
      return res
        .status(400)
        .json({ success: false, message: 'Missing required fields.' });
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
    console.log(sendEmail, ' >>>>> sendEmail');
    return response.success(res, 'Message sent successfully.', null);
  } catch (error) {
    console.error('Email send error:', error);
    return response.error(res, 'Failed to send message.');
  }
};

//----------------- Email Templates -----------------//

export const createEmailTemplate = async (req: Request, res: Response): Promise<any> => {
  try {
    const { subject, body, type, isActive } = req.body;

    // generate slug from subject
    let slug = generateSlug(subject);

    // ensure slug is unique → if duplicate, append incremental number
    let counter = 1;
    let newSlug = slug;

    while (
      await prisma.emailTemplate.findUnique({ where: { slug: newSlug } })
    ) {
      newSlug = `${slug}-${counter++}`;
    }

    slug = newSlug;

    const template = await prisma.emailTemplate.create({
      data: {
        slug,
        subject,
        body,
        type,
        isActive: isActive ?? true,
      },
    });

    return res.json({
      status: true,
      message: 'Email template created',
      data: template,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: 'Server error' });
  }
};

export const getAllEmailTemplates = async (req: Request, res: Response): Promise<any> => {
  try {
    const page = Number(req.body.page) || 1;
    const limit = Number(req.body.limit) || 10;
    const skip = (page - 1) * limit;

    const type = req.body.type as EmailTemplateType | undefined;
    const search = req.body.search as string | undefined;

    const where: any = {};

    if (type) where.type = type;
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [templates, total] = await Promise.all([
      prisma.emailTemplate.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.emailTemplate.count({ where }),
    ]);

    return res.json({
      status: true,
      message: 'Email templates retrieved',
      data: {
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
        templates,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: 'Server error' });
  }
};

export const getEmailTemplate = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    const template = await prisma.emailTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return res.status(404).json({
        status: false,
        message: "Template not found",
      });
    }

    return res.json({
      status: true,
      message: "Email template retrieved successfully",
      data: template,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const updateEmailTemplate = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { subject, body, type, isActive } = req.body;

    const template = await prisma.emailTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return res.status(404).json({
        status: false,
        message: "Template not found",
      });
    }

    // Build dynamic update object
    const updateData: any = {};

    if (subject !== undefined && subject !== null) {
      updateData.subject = subject;
    }

    if (body !== undefined && body !== null) {
      updateData.body = body;
    }

    if (type !== undefined && type !== null) {
      updateData.type = type;
    }

    if (isActive !== undefined && isActive !== null) {
      updateData.isActive = isActive;
    }

    // ❌ Slug is never updated
    updateData.slug = template.slug;

    const updated = await prisma.emailTemplate.update({
      where: { id },
      data: updateData,
    });

    return res.json({
      status: true,
      message: "Email template updated successfully",
      data: updated,
    });

  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const deleteEmailTemplate = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    const template = await prisma.emailTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return res.status(404).json({
        status: false,
        message: "Template not found",
      });
    }

    await prisma.emailTemplate.delete({ where: { id } });

    return res.json({
      status: true,
      message: "Email template deleted successfully",
      data: null,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
