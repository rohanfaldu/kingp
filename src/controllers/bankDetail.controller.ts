import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import response from "../utils/response";
import { IUserBankDetails } from "../interfaces/bankDetail.interface";
import { encrypt, decrypt } from "../utils/encryption";
import { validate as isUuid } from 'uuid';

const prisma = new PrismaClient();

// ✅ Create Bank Details
export const createUserBankDetails = async (req: Request, res: Response): Promise<any> => {
  try {
    const data: IUserBankDetails = req.body;

    if (!data.userId) return response.error(res, "userId is required.");
    if (!data.accountNumber) return response.error(res, "accountNumber is required.");
    if (!data.ifscCode) return response.error(res, "IFSC Code is required.");

    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) return response.error(res, "Invalid userId: User not found.");

    const existingBank = await prisma.userBankDetails.findFirst({
      where: {
        userId: data.userId,
        accountNumber: encrypt(data.accountNumber.toString()),
      },
    });

    if (existingBank) return response.error(res, "Bank details already exist for this account number and user.");

    const newBankDetails = await prisma.userBankDetails.create({
      data: {
        userId: data.userId,
        accountId: data.accountId ? encrypt(data.accountId.toString()) : null,
        accountNumber: encrypt(data.accountNumber.toString()),
        ifscCode: data.ifscCode,
        accountHolderName: data.accountHolderName,
        status: true,
      },
    });

    return response.success(res, "Bank details saved successfully.", newBankDetails);
  } catch (error: any) {
    return response.error(res, error.message || "Something went wrong.");
  }
};

// ✅ Get Bank Details by UserId
export const getUserBankDetailsByUserId = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.body;

    if (!userId) return response.error(res, "userId is required.");

    const bankDetails = await prisma.userBankDetails.findFirst({
      where: { userId, status: true },
    });

    if (!bankDetails) return response.error(res, "No bank details found for this user.");

    const decryptedData = {
      ...bankDetails,
      accountNumber: bankDetails.accountNumber ? parseInt(decrypt(bankDetails.accountNumber)) : null,
      accountId: bankDetails.accountId ? parseInt(decrypt(bankDetails.accountId)) : null,
    };

    return response.success(res, "Bank details fetched successfully.", decryptedData);
  } catch (error: any) {
    return response.error(res, error.message || "Something went wrong.");
  }
};

// ✅ Edit Bank Details
export const editUserBankDetails = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const data: Partial<IUserBankDetails> = req.body;

    if (!isUuid(id)) return response.error(res, "Invalid UUID format.");

    const existingRecord = await prisma.userBankDetails.findUnique({ where: { id } });
    if (!existingRecord) return response.error(res, "No bank detail found for the given ID.");

    const updateData: any = {};

    if (data.accountHolderName && data.accountHolderName !== "") {
      updateData.accountHolderName = data.accountHolderName;
    }

    if (data.ifscCode && data.ifscCode !== "") {
      updateData.ifscCode = data.ifscCode;
    }

    if (data.accountNumber && data.accountNumber !== 0) {
      updateData.accountNumber = encrypt(data.accountNumber.toString());
    }

    if (data.accountId && data.accountId !== 0) {
      updateData.accountId = encrypt(data.accountId.toString());
    }

    if (typeof data.status === "boolean") {
      updateData.status = data.status;
    }

    if (Object.keys(updateData).length === 0) {
      return response.error(res, "No valid fields provided for update.");
    }

    const updated = await prisma.userBankDetails.update({
      where: { id },
      data: updateData,
    });

    return response.success(res, "Bank details updated successfully.", updated);
  } catch (error: any) {
    return response.error(res, error.message || "Something went wrong.");
  }
};

// ✅ Delete (Soft Delete) Bank Details
export const deleteUserBankDetails = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.body;

    if (!isUuid(id)) return response.error(res, "Invalid UUID format.");

    const existing = await prisma.userBankDetails.findUnique({ where: { id } });
    if (!existing) return response.error(res, "Bank detail not found for the given ID.");

    const updated = await prisma.userBankDetails.update({
      where: { id },
      data: { status: false },
    });

    return response.success(res, "Bank details deleted successfully.", updated);
  } catch (error: any) {
    return response.error(res, error.message || "Something went wrong.");
  }
};
