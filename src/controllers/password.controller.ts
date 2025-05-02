import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from 'bcryptjs';
import response from '../utils/response';
import jwt from 'jsonwebtoken';


import { resolveStatus } from '../utils/commonFunction'

const prisma = new PrismaClient();


export const changePassword = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      return response.error(res, 'Unauthorized user.');
    }

    if (!currentPassword || !newPassword) {
      return response.error(res, 'Current and new password required.');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
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

  const otp = Math.floor(100000 + Math.random() * 999999).toString();
  const expireAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins from now

  try {
    const existing = await prisma.paswordReset.findFirst({
      where: { emailAddress: emailAddress },
    });

    if (existing) {
      await prisma.paswordReset.update({
        where: { id: existing.id },
        data: {
          otp,
          expireAt,
          verified: false,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.paswordReset.create({
        data: {
          emailAddress: emailAddress,
          otp,
          expireAt,
          updatedAt: new Date(),
        },
      });
    }
    return response.success(res, 'OTP sent to your email.', otp);

  } catch (error: any) {
    return response.serverError(res, error.message);
  }
}


export const verifyOtp = async (req: Request, res: Response): Promise<any> => {
  const { emailAddress, otp } = req.body;

  try {
    const record = await prisma.paswordReset.findFirst({
      where: { emailAddress },
    });

    if (!record || record.otp !== otp) {
      return response.error(res, 'Invalid OTP.');
    }

    if (record.expireAt && new Date() > record.expireAt) {
      return response.error(res, 'OTP expired.');

    }

    await prisma.paswordReset.update({
      where: { id: record.id },
      data: {
        verified: true,
        updatedAt: new Date(),
      },
    });
    return response.success(res, 'OTP verified Succesfully.', null);
  } catch (error: any) {
    return response.serverError(res, error.message);
  }
};



export const resetPassword = async (req: Request, res: Response): Promise<any> => {
  const { emailAddress, newPassword, confirmPassword } = req.body;

  try {
    if (newPassword !== confirmPassword) {
      return response.error(res, 'Password and confirm password do not match.');
    }

    const reset = await prisma.paswordReset.findFirst({
      where: { emailAddress: emailAddress },
    });

    if (!reset || !reset.verified) {
      return response.error(res, 'Email Address is incoreect or OTP not verified.');
    }

    await prisma.user.update({
      where: { emailAddress: emailAddress },
      data: {
        password: await bcrypt.hash(newPassword, 10),
      },
    });

    await prisma.paswordReset.delete({
      where: { id: reset.id },
    });
    return response.success(res, 'Password reset successfully.', null);
  } catch (error: any) {
    return response.serverError(res, error.message);
  }
}

