import express, { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import bodyParser from 'body-parser';
import { PrismaClient, Prisma, EmailTemplateType } from '@prisma/client';
import { Resend } from 'resend';
import response from '../utils/response';
import { generateSlug } from '../utils/commonFunction';
import { calculateProfileCompletion, calculateBusinessProfileCompletion } from '../utils/calculateProfileCompletion';
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';

const prisma = new PrismaClient();
const MIN_POINTS = 3500;
const resend = new Resend(process.env.RESEND_API_KEY);

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

// Send welcome email to a specific user (for signup)
export const sendWelcomeEmailToUser = async (userId: string, otp: string): Promise<void> => {
  try {
    // 1️⃣ Fetch user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        emailAddress: true,
        type: true,
      },
    });

    if (!user?.emailAddress) {
      console.error(`User ${userId} has no email address`);
      return;
    }

    // 2️⃣ Fetch the email template
    const template = await prisma.emailTemplate.findFirst({
      where: {
        type: EmailTemplateType.WELCOME_EMAIL,
        isActive: true,
      },
    });

    if (!template) {
      console.error('WELCOME_EMAIL template not found or inactive');
      return;
    }

    // 3️⃣ Prepare email body with replacements
    const htmlBody = template.body
      .replace(/{{userName}}/g, user.name || 'User')
      .replace(/{{emailAddress}}/g, user.emailAddress || '')
      .replace(/{{otp}}/g, otp || '');

    // 4️⃣ Send email
    // await resend.emails.send({
    //   from: 'KringP <info@kringp.com>',
    //   to: user.emailAddress,
    //   subject: template.subject,
    //   html: htmlBody,
    // });

    // console.log(`✅ Sent WELCOME_EMAIL to ${user.emailAddress} with OTP`);

     const response = await resend.emails.send({
      from: 'KringP <info@kringp.com>', // must be verified
      to: user.emailAddress,
      subject: template.subject,
      html: htmlBody,
    });

    console.log('✅ Resend email queued:', response);
    console.log(`✅ Sent WELCOME_EMAIL to ${user.emailAddress} with OTP`);
  } catch (err) {
    console.error(`Error sending welcome email to user ${userId}:`, err);
  }
};

// Send redeem points email to a specific user (for signup)
export const sendRedeemPointsEmailToUser = async (userId: string): Promise<void> => {
  try {
    // 1️⃣ Fetch user's referral coin summary
    const summary = await prisma.referralCoinSummary.findUnique({
      where: { userId },
      include: { userReferralCoinSummary: true },
    });

    if (!summary) return;

    // 2️⃣ Check if user qualifies (totalAmount >= 3500) and email not sent yet
    const totalAmount = Number(summary.totalAmount) || 0;
    const netAmount = Number(summary.netAmount) || 0;

    if (summary.redeemEmailSent || (totalAmount < MIN_POINTS && netAmount < MIN_POINTS)) {
      return;
    }

    const user = summary.userReferralCoinSummary;
    if (!user?.emailAddress) {
      console.error(`User ${userId} has no email address`);
      return;
    }

    // 3️⃣ Fetch the email template
    const template = await prisma.emailTemplate.findFirst({
      where: {
        type: EmailTemplateType.REDEEM_POINTS_3500,
        isActive: true,
      },
    });

    if (!template) {
      console.error('REDEEM_POINTS_3500 email template not found or inactive');
      return;
    }

    // 4️⃣ Prepare email body with replacements
    const htmlBody = template.body
      .replace(/{{userName}}/g, user.name || 'User')
      .replace(/{{totalAmount}}/g, totalAmount.toString())
      .replace(/{{netAmount}}/g, netAmount.toString());

    // 5️⃣ Send email
    await resend.emails.send({
      from: 'KringP <info@kringp.com>',
      to: user.emailAddress,
      subject: template.subject,
      html: htmlBody,
    });

    // 6️⃣ Mark as sent
    await prisma.referralCoinSummary.update({
      where: { id: summary.id },
      data: { redeemEmailSent: true },
    });

    console.log(`✅ Sent REDEEM_POINTS_3500 email to ${user.emailAddress} (Total: ${totalAmount}, Net: ${netAmount})`);
  } catch (err) {
    console.error(`Error sending redeem points email to user ${userId}:`, err);
  }
};

// Send redeem points emails to all qualifying users (batch process)
export const sendRedeemPointsEmails = async () => {
  try {
    // 1️⃣ Fetch users who qualify
    const users = await prisma.referralCoinSummary.findMany({
      where: {
        redeemEmailSent: false,
        OR: [
          { totalAmount: { gte: MIN_POINTS } },
          { netAmount: { gte: MIN_POINTS } },
        ],
      },
      include: { userReferralCoinSummary: true },
    });

    if (!users.length) {
      console.log('No users qualify for redeem points email');
      return;
    }

    // 2️⃣ Fetch the email template
    const template = await prisma.emailTemplate.findFirst({
      where: {
        type: EmailTemplateType.REDEEM_POINTS_3500,
        isActive: true,
      },
    });

    if (!template) {
      console.error('REDEEM_POINTS_3500 email template not found or inactive');
      return;
    }

    // 3️⃣ Send emails
    for (const summary of users) {
      const user = summary.userReferralCoinSummary;
      if (!user?.emailAddress) {
        console.warn(`Skipping user ${summary.userId} - no email address`);
        continue;
      }

      const totalAmount = Number(summary.totalAmount) || 0;
      const netAmount = Number(summary.netAmount) || 0;

      const htmlBody = template.body
        .replace(/{{userName}}/g, user.name || 'User')
        .replace(/{{totalAmount}}/g, totalAmount.toString())
        .replace(/{{netAmount}}/g, netAmount.toString());

      try {
        await resend.emails.send({
          from: 'KringP <info@kringp.com>',
          to: user.emailAddress,
          subject: template.subject,
          html: htmlBody,
        });

        // 4️⃣ Mark as sent
        await prisma.referralCoinSummary.update({
          where: { id: summary.id },
          data: { redeemEmailSent: true },
        });

        console.log(`✅ Sent REDEEM_POINTS_3500 email to ${user.emailAddress} (Total: ${totalAmount}, Net: ${netAmount})`);
      } catch (emailError) {
        console.error(`Failed to send email to ${user.emailAddress}:`, emailError);
      }
    }
  } catch (err) {
    console.error('Error sending redeem points emails:', err);
  }
};

// Send profile incomplete email to a specific user
export const sendProfileIncompleteEmailToUser = async (userId: string): Promise<void> => {
  try {
    // 1️⃣ Fetch user data with all necessary fields for profile completion calculation
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        socialMediaPlatforms: true,
        subCategories: {
          include: {
            subCategory: true,
            categoryInfo: true,
          },
        },
      },
    });

    if (!user?.emailAddress) {
      console.error(`User ${userId} has no email address`);
      return;
    }

    // 2️⃣ Check if user signed up exactly 1 day ago (within 23-25 hour window to ensure we only send once)
    if (!user.createsAt) {
      console.error(`User ${userId} has no signup date`);
      return;
    }

    const now = new Date();
    const oneDayAgo = new Date(now);
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    oneDayAgo.setHours(0, 0, 0, 0); // Start of day 1 day ago

    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    twoDaysAgo.setHours(0, 0, 0, 0); // Start of day 2 days ago

    const userSignupDate = new Date(user.createsAt);
    userSignupDate.setHours(0, 0, 0, 0);

    // Only send if user signed up exactly 1 day ago (between 1 and 2 days ago)
    if (userSignupDate < twoDaysAgo || userSignupDate >= oneDayAgo) {
      console.log(`User ${userId} did not sign up exactly 1 day ago, skipping email`);
      return;
    }

    // 3️⃣ Calculate profile completion
    const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(userId);
    const userWithCategories = {
      ...user,
      categories: userCategoriesWithSubcategories,
    };

    const profileCompletion = user.type === 'BUSINESS'
      ? calculateBusinessProfileCompletion(userWithCategories, user.loginType || 'NONE')
      : calculateProfileCompletion(userWithCategories);

    // 4️⃣ Check if profile is less than 50% complete
    if (profileCompletion >= 50) {
      console.log(`User ${userId} has profile completion ${profileCompletion}%, skipping email`);
      return;
    }

    // 5️⃣ Check UserDetail - get or create if doesn't exist
    let userDetail = await prisma.userDetail.findFirst({
      where: { userId: userId },
    });
    
    if (!userDetail) {
      // Create UserDetail if it doesn't exist
      userDetail = await prisma.userDetail.create({
        data: {
          userId: userId,
        },
      });
    }

    // Check if email was already sent (profileCompleteMailSend must be false)
    if (userDetail.profileCompleteMailSend === true) {
      console.log(`User ${userId} - profile incomplete email already sent`);
      return;
    }

    // 6️⃣ Fetch the email template
    const template = await prisma.emailTemplate.findFirst({
      where: {
        type: EmailTemplateType.PROFILE_INCOMPLETE,
        isActive: true,
      },
    });

    if (!template) {
      console.error('PROFILE_INCOMPLETE email template not found or inactive');
      return;
    }

    // 7️⃣ Prepare email body with replacements
    const htmlBody = template.body
      .replace(/{{userName}}/g, user.name || 'User')
      .replace(/{{profileCompletion}}/g, profileCompletion.toString());

    // 8️⃣ Send email
    await resend.emails.send({
      from: 'KringP <info@kringp.com>',
      to: user.emailAddress,
      subject: template.subject,
      html: htmlBody,
    });

    // 9️⃣ Update UserDetail to mark email as sent
    await prisma.userDetail.update({
      where: { id: userDetail.id },
      data: { profileCompleteMailSend: true },
    });

    console.log(`✅ Sent PROFILE_INCOMPLETE email to ${user.emailAddress} (Profile: ${profileCompletion}%)`);
  } catch (err) {
    console.error(`Error sending profile incomplete email to user ${userId}:`, err);
  }
};

// This should be called once per day via cron job to send emails to users who signed up exactly 1 day ago
export const sendProfileIncompleteEmails = async () => {
  try {

    const now = new Date();
    const oneDayAgo = new Date(now);
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    oneDayAgo.setHours(0, 0, 0, 0);

    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    twoDaysAgo.setHours(0, 0, 0, 0);

    // 2️⃣ Fetch users who signed up exactly 1 day ago (between 1 and 2 days ago)
    const users = await prisma.user.findMany({
      where: {
        createsAt: {
          gte: twoDaysAgo,
          lt: oneDayAgo,
        },
        status: true,
      },
      include: {
        socialMediaPlatforms: true,
        subCategories: {
          include: {
            subCategory: true,
            categoryInfo: true,
          },
        },
      },
    });

    if (!users.length) {
      console.log('No users qualify for profile incomplete email');
      return;
    }

    // 3️⃣ Fetch the email template
    const template = await prisma.emailTemplate.findFirst({
      where: {
        type: EmailTemplateType.PROFILE_INCOMPLETE,
        isActive: true,
      },
    });

    if (!template) {
      console.error('PROFILE_INCOMPLETE email template not found or inactive');
      return;
    }

    // 4️⃣ Process each user
    for (const user of users) {
      try {
        // Use stored profileCompletion directly
        const profileCompletion = user.profileCompletion ?? 0;

        // Check if profile < 50%
        if (profileCompletion >= 50) {
          console.log(`Skipping user ${user.id} - profile completion is ${profileCompletion}%`);
          continue;
        }

        // Check UserDetail - get or create if doesn't exist
        let userDetail = await prisma.userDetail.findFirst({
          where: { userId: user.id },
        });
        
        if (!userDetail) {
          // Create UserDetail if it doesn't exist
          userDetail = await prisma.userDetail.create({
            data: {
              userId: user.id,
            },
          });
        }

        // Check if email was already sent (profileCompleteMailSend must be false)
        if (userDetail.profileCompleteMailSend === true) {
          console.log(`Skipping user ${user.id} - profile incomplete email already sent`);
          continue;
        }

        // Prepare email body with replacements
        const htmlBody = template.body
          .replace(/{{userName}}/g, user.name || 'User')
          .replace(/{{profileCompletion}}/g, profileCompletion.toString());

        // Send email
        await resend.emails.send({
          from: 'KringP <info@kringp.com>',
          to: user.emailAddress,
          subject: template.subject,
          html: htmlBody,
        });

        // Update UserDetail to mark email as sent
        await prisma.userDetail.update({
          where: { id: userDetail.id },
          data: { profileCompleteMailSend: true },
        });

        console.log(`✅ Sent PROFILE_INCOMPLETE email to ${user.emailAddress} (Profile: ${profileCompletion}%)`);

      } catch (emailError) {
        console.error(`Failed to send profile incomplete email to ${user.emailAddress}:`, emailError);
      }
    }
  } catch (err) {
    console.error('Error sending profile incomplete emails:', err);
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


//--------------------- End Email Template  ---------------------//

// export const sendEmailToSelectedUsers = async (req: Request, res: Response): Promise<any> => {
//   try {
//     const { templateId, userIds } = req.body;

//     if (!templateId || !Array.isArray(userIds) || userIds.length === 0) {
//       return response.error(res, "templateId and userIds are required");
//     }

//     // Fetch template
//     const template = await prisma.emailTemplate.findUnique({
//       where: { id: templateId },
//     });

//     if (!template) {
//       return response.error(res, "Email template not found");
//     }

//     // Fetch users
//     const users = await prisma.user.findMany({
//       where: {
//         id: { in: userIds },
//       },
//     });

//     if (users.length === 0) {
//       return response.error(res, "No users found for given userIds");
//     }

//     for (const user of users) {
//       try {
//         const htmlBody = template.body.replace(/{{userName}}/g, user.name || "User");

//         await resend.emails.send({
//           from: 'KringP <info@kringp.com>',
//           to: user.emailAddress,
//           subject: template.subject,
//           html: htmlBody,
//         });

//         console.log(`📩 Email sent to: ${user.emailAddress}`);
//       } catch (err) {
//         console.error(`❌ Failed to send email to ${user.emailAddress}:`, err);
//       }
//     }

//     return response.success(res, "Emails sent successfully");
//   } catch (error) {
//     console.error("sendEmailToSelectedUsers error:", error);
//     return response.error(res, "Something went wrong");
//   }
// };

export const sendEmailToSelectedUsers = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { templateId, userIds } = req.body;

    if (!templateId || !Array.isArray(userIds) || userIds.length === 0) {
      return response.error(res, "templateId and userIds are required");
    }

    // Fetch template
    const template = await prisma.emailTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return response.error(res, "Email template not found");
    }

    // Fetch users
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
    });

    if (users.length === 0) {
      return response.error(res, "No users found for given userIds");
    }

    // -------- CONFIG (IMPORTANT) --------
    const BATCH_SIZE = 1;        // send 10 emails at a time
    const DELAY_BETWEEN_BATCH = 1000; // 3 sec between batches
    // -----------------------------------

    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    let successCount = 0;
    let failedCount = 0;

    // Split users into batches
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (user) => {
          try {
            if (!user.emailAddress) return;

            const htmlBody = template.body.replace(
              /{{userName}}/g,
              user.name || "User"
            );

            const result = await resend.emails.send({
              from: "KringP <info@kringp.com>",
              to: user.emailAddress,
              subject: template.subject,
              html: htmlBody,
            });
            console.log(result, '>>>>>>>>>>> result');

            console.log(
              `📩 Sent to ${user.emailAddress} | Resend ID: ${result?.data?.id}`
            );

            successCount++;
            console.log(
              `✅ Success for ${user.emailAddress}`, 'count', successCount
            );
          } catch (err) {
            failedCount++;
            console.error(
              `❌ Failed for ${user.emailAddress}:`,
              err
            );
          }
        })
      );

      // Delay before next batch
      console.log(
        `⏳ Batch completed (${Math.min(i + BATCH_SIZE, users.length)}/${users.length})`
      );
      await delay(DELAY_BETWEEN_BATCH);
    }

    return response.success(res, "Emails sent successfully", {
      totalSelected: users.length,
      sent: successCount,
      failed: failedCount,
    });
  } catch (error) {
    console.error("sendEmailToSelectedUsers error:", error);
    return response.error(res, "Something went wrong");
  }
};
