import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { ICountry } from './../interfaces/country.interface';
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';
import { resolveStatus } from '../utils/commonFunction'

const prisma = new PrismaClient();


export const createUserBankDetails = async (req: Request, res: Response) => {
  try {
    const {
      userId,
      accountId,
      accountNumber,
      ifscCode,
      razorpayAccountNo,
      accountHolderName
    } = req.body;

    const userBankDetails = await prisma.userBankDetails.create({
      data: {
        userId,
        accountId,
        accountNumber,
        ifscCode,
        razorpayAccountNo,
        accountHolderName,
        status: true // default, optional
      }
    });

    return res.status(201).json({
      success: true,
      message: "User bank details saved successfully",
      data: userBankDetails
    });

  } catch (error) {
    console.error("Error saving user bank details:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message || error
    });
  }
};
