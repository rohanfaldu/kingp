import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from 'bcryptjs';
import response from '../utils/response';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../utils/sendMail';
import { Resend } from 'resend';
import { resolveStatus } from '../utils/commonFunction'
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';



const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';


export const changePassword = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!userId) {
      return response.error(res, 'Unauthorized user.');
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      return response.error(res, 'Current password, new password, and confirm password are required.');
    }

    if (newPassword !== confirmPassword) {
      return response.error(res, 'New password and confirm password do not match.');
    }

    if (newPassword.length < 8) {
      return response.error(res, 'New password must be at least 8 characters long.');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return response.error(res, 'User not found.');
    }

    const isPasswordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordMatch) {
      return response.error(res, 'Current password is incorrect.');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return response.success(res, 'Password changed successfully.', null);
  } catch (error: any) {
    return response.serverError(res, error.message);
  }
};




export const forgotPassword = async (req: Request, res: Response): Promise<any> => {
  const { emailAddress } = req.body;

  if (!emailAddress) {
    return response.error(res, 'Email address is required.');
  }

  const user = await prisma.user.findUnique({
    where: { emailAddress },
    select: { name: true },
  });

  if (!user) {
    return response.error(res, 'Email not found. Please provide a valid email address.');
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expireAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes validity
  const resend = new Resend('re_FKsFJzvk_4L1x2111AwnSDMqGCYGsLJeH');

  try {
    const existingOtp = await prisma.otpVerify.findFirst({
      where: { emailAddress, otpType: 'RESETPASS' },
    });

    const now = new Date();

    if (existingOtp) {
      const timeSinceLastUpdate = now.getTime() - new Date(existingOtp.updatedAt).getTime();
      const thirtyMinutes = 30 * 60 * 1000;

      if (existingOtp.countMail >= 3 && timeSinceLastUpdate < thirtyMinutes) {
        return response.error(res, 'Too many attempts. Please try again after 30 minutes.');
      }

      // Reset count if 30 minutes have passed
      const newCount = timeSinceLastUpdate >= thirtyMinutes ? 1 : (existingOtp.countMail || 0) + 1;

      await prisma.otpVerify.update({
        where: { id: existingOtp.id },
        data: {
          otp,
          expireAt,
          verified: false,
          // otpType: 'RESETPASS',
          countMail: newCount,
          updatedAt: now,
        },
      });
    } else {
      await prisma.otpVerify.create({
        data: {
          emailAddress,
          otp,
          expireAt,
          verified: false,
          otpType: 'RESETPASS',
          countMail: 1,
          updatedAt: now,
        },
      });
    }

    const htmlContent = `
      <p>Hello ${user?.name || emailAddress},</p>
      <p>This is your KringP Reset Password email.</p>
      <p>We received a request to reset your password for your email address: ${emailAddress}.</p>
      <p>Your OTP is: <strong>${otp}</strong></p>
      <p>This OTP is valid for 10 minutes.</p>
      <p>If you did not request a password reset, please ignore this email or contact our support team.</p>
    `;

    await resend.emails.send({
      from: 'KringP <info@kringp.com>',
      to: emailAddress,
      subject: 'Reset Password OTP - KringP',
      html: htmlContent,
    });

    return response.success(res, 'OTP sent to your email.', otp);

  } catch (error: any) {
    return response.serverError(res, error.message);
  }
};





// export const verifyOtp = async (req: Request, res: Response): Promise<any> => {
//   const { emailAddress, otp } = req.body;

//   if (!emailAddress || !otp) {
//     return response.error(res, 'Email, and OTP are required.');
//   }

//   try {
//     const record = await prisma.otpVerify.findFirst({
//       where: {
//         emailAddress,
//       },
//     });

//     if (!record) {
//       return response.error(res, 'Invalid OTP or not found this OTP for given Email.');
//     }

//     const now = new Date();
//     const fifteenMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

//     const isBlocked = record.countMail >= 4 && record.updatedAt > fifteenMinutesAgo;

//     if (isBlocked) {
//       return response.error(res, 'Too many OTP attempts. Please try again after 30 minutes.');
//     }

//     const shouldResetCount = record.updatedAt <= fifteenMinutesAgo;

//     if (record.otp !== otp) {
//       const newCount = shouldResetCount ? 1 : (record.countMail ?? 0) + 1;

//       await prisma.otpVerify.update({
//         where: { id: record.id },
//         data: {
//           countMail: newCount,
//           updatedAt: now,
//         },
//       });

//       if (newCount >= 4) {
//         return response.error(res, 'Too many OTP attempts. Please try again after 15 minutes.');
//       }

//       return response.error(res, 'Invalid OTP.');
//     }

//     await prisma.otpVerify.update({
//       where: { id: record.id },
//       data: {
//         verified: true,
//         updatedAt: now,
//       },
//     });

//     const user = await prisma.user.findUnique({
//       where: { emailAddress },
//       include: {
//         socialMediaPlatforms: true,
//         brandData: true,
//         countryData: true,
//         stateData: true,
//         cityData: true,
//       },
//     });

//     if (!user) {
//       return response.error(res, 'User not found.');
//     }

//     const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

//     const token = jwt.sign(
//       { userId: user.id, email: user.emailAddress },
//       JWT_SECRET,
//       { expiresIn: '7d' }
//     );

//     const { password, socialMediaPlatform, ...userWithoutPassword } = user as any;

//     const userResponse = {
//       ...userWithoutPassword,
//       categories: userCategoriesWithSubcategories,
//       countryName: user.countryData?.name ?? null,
//       stateName: user.stateData?.name ?? null,
//       cityName: user.cityData?.name ?? null,
//     };

//     return response.success(res, 'OTP verified successfully.', {
//       user: userResponse,
//       token,
//     });
//   } catch (error: any) {
//     return response.serverError(res, error.message);
//   }
// };




export const verifyOtp = async (req: Request, res: Response): Promise<any> => {
  const { emailAddress, otp } = req.body;

  if (!emailAddress || !otp) {
    return response.error(res, 'Email, OTP, and OTP type are required.');
  }

  try {
    const record = await prisma.otpVerify.findFirst({
      where: {
        emailAddress,
        otp,
        verified: false,
      },
    });

    if (!record) {
      return response.error(res, 'Invalid OTP or not found.');
    }

    if (record.expireAt && new Date() > record.expireAt) {
      return response.error(res, 'OTP expired.');
    }

    await prisma.otpVerify.update({
      where: { id: record.id },
      data: {
        verified: true,
        updatedAt: new Date(),
      },
    });

    const user = await prisma.user.findUnique({
      where: { emailAddress },
      include: {
        socialMediaPlatforms: true,
        brandData: true,
        countryData: true,
        stateData: true,
        cityData: true,
      },
    });

    if (!user) {
      return response.error(res, 'User not found.');
    }

    const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

    const token = jwt.sign(
      { userId: user.id, email: user.emailAddress },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password, socialMediaPlatform, ...userWithoutPassword } = user as any;

    const userResponse = {
      ...userWithoutPassword,
      categories: userCategoriesWithSubcategories,
      countryName: user.countryData?.name ?? null,
      stateName: user.stateData?.name ?? null,
      cityName: user.cityData?.name ?? null,
    };

    return response.success(res, 'OTP verified successfully.', {
      user: userResponse,
      token,
    });

    // return response.success(res, 'OTP verified successfully.', null);
  } catch (error: any) {
    return response.serverError(res, error.message);
  }
};



export const resetPassword = async (req: Request, res: Response): Promise<any> => {
  const { emailAddress, newPassword, confirmPassword } = req.body;

  if (!emailAddress || !newPassword || !confirmPassword) {
    return response.error(res, 'Email, new password, and confirm password are required.');
  }

  try {
    if (newPassword !== confirmPassword) {
      return response.error(res, 'Password and confirm password do not match.');
    }

    const otpRecord = await prisma.otpVerify.findFirst({
      where: {
        emailAddress,
        otpType: 'RESETPASS',
        verified: true,
      },
    });

    if (!otpRecord) {
      return response.error(res, 'OTP not verified or email address is incorrect.');
    }

    await prisma.user.update({
      where: { emailAddress },
      data: {
        password: await bcrypt.hash(newPassword, 10),
      },
    });

    // // Delete OTP entry to prevent reuse
    // await prisma.otpVerify.delete({
    //   where: { id: otpRecord.id },
    // });

    return response.success(res, 'Password reset successfully.', null);
  } catch (error: any) {
    return response.serverError(res, error.message);
  }
};


