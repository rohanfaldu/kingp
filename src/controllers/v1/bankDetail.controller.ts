import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import response from "../../utils/response";
import { IUserBankDetails } from "../../interfaces/bankDetail.interface";
import { encrypt, decrypt } from "../../utils/encryption";
import { validate as isUuid } from 'uuid';
import { calculateProfileCompletion, calculateBusinessProfileCompletion } from '../../utils/calculateProfileCompletion';

const prisma = new PrismaClient();


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

    if (existingBank) {
      return response.error(res, "Bank details already exist for this account number and user.");
    }

    // Step 1: Create bank details + update bankDetails flag
    const [newBankDetails] = await prisma.$transaction([
      prisma.userBankDetails.create({
        data: {
          userId: data.userId,
          accountId: data.accountId || null,
          accountNumber: encrypt(data.accountNumber.toString()),
          ifscCode: data.ifscCode,
          accountHolderName: data.accountHolderName,
          status: true,
        },
      }),
      prisma.user.update({
        where: { id: data.userId },
        data: {
          bankDetails: true,
        },
      }),
    ]);

    // Step 2: Fetch updated user including userSubCategories and socialMediaPlatforms
    const userData = await prisma.user.findFirst({
      where: { id: data.userId }
    });

    const userSubCategories = await prisma.userSubCategory.findMany({
      where: {
        userId: data.userId
      }
    })

    const socialMediaPlatforms = await prisma.socialMediaPlatform.findMany({
      where: {
        userId: data.userId
      }
    })

    // Step 3: Prepare user for profile calculation
    const profileCompletion = calculateProfileCompletion({
      ...userData,
      userSubCategories,
      socialMediaPlatforms
    });

    // Step 4: Update user's profileCompletion %
    await prisma.user.update({
      where: { id: data.userId },
      data: {
        profileCompletion,
      },
    });

    return response.success(res, "Bank details saved successfully.", newBankDetails);
  } catch (error: any) {
    return response.error(res, error.message || "Something went wrong.");
  }
};


export const getUserBankDetailsByUserId = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return response.error(res, "userId is required.");
    }

    // Fetch all active bank‑detail records for this user
    const bankDetailsList = await prisma.userBankDetails.findMany({
      where: { userId, status: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!bankDetailsList || bankDetailsList.length === 0) {
      return response.error(res, "No bank details found for this user.");
    }

    // Decrypt sensitive fields for each record
    const decryptedList = bankDetailsList.map((bd) => ({
      ...bd,
      accountNumber: bd.accountNumber
        ? parseInt(decrypt(bd.accountNumber), 10)
        : null,
      accountId: bd.accountId || null,
    }));

    return response.success(
      res,
      "Bank details fetched successfully.",
      decryptedList
    );
  } catch (error: any) {
    return response.error(res, error.message || "Something went wrong.");
  }
};


//  Edit Bank Details
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

    if (data.accountId) {
      updateData.accountId = data.accountId; // now stored as plain string
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

    const userData = await prisma.user.findFirst({
      where: { id: data.userId }
    });

    const userSubCategories = await prisma.userSubCategory.findMany({
      where: {
        userId: data.userId
      }
    })

    const socialMediaPlatforms = await prisma.socialMediaPlatform.findMany({
      where: {
        userId: data.userId
      }
    })

    // Step 3: Prepare user for profile calculation
    const profileCompletion = calculateProfileCompletion({
      ...userData,
      userSubCategories,
      socialMediaPlatforms
    });

    // Step 4: Update user's profileCompletion %
    await prisma.user.update({
      where: { id: data.userId },
      data: {
        bankDetails: true,
      },
    });

    return response.success(res, "Bank details updated successfully.", updated);
  } catch (error: any) {
    return response.error(res, error.message || "Something went wrong.");
  }
};



// Delete (Soft Delete) Bank Details
export const deleteUserBankDetails = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.body;

    if (!isUuid(id)) return response.error(res, "Invalid UUID format.");

    const existing = await prisma.userBankDetails.findUnique({ where: { id } });
    if (!existing) return response.error(res, "Bank detail not found for the given ID.");

    if (!existing.userId) {
      throw new Error("User ID is missing");
    }
    const [updatedBank, updatedUser] = await prisma.$transaction([
      prisma.userBankDetails.update({
        where: { id },
        data: { status: false },
      }),
      prisma.user.update({
        where: { id: existing.userId },
        data: { bankDetails: false },
      }),
    ]);

    return response.success(res, "Bank details deleted successfully.", updatedBank);
  } catch (error: any) {
    return response.error(res, error.message || "Something went wrong.");
  }
};

// ----------------- Paypal Details ------------------- //

export const createUserPaypalDetails = async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      userId,
      paypalId,
      paypalEmail,
      paypalPayerId,
      paypalMerchantId,
      accountHolderName
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }
    if (!paypalEmail) {
      return res.status(400).json({
        success: false,
        message: "paypal Email is required",
      });
    }

    // 1️⃣ Check if user exists
    const userExists = await prisma.user.findUnique({
      where: { id: userId },  
      select: { id: true },
    });

    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 2️⃣ Check if Paypal details already exist for this user
    const existingPaypal = await prisma.userPaypalDetails.findFirst({
      where: { userId },
    });

    if (existingPaypal) {
      return res.status(409).json({
        success: false,
        message: "Paypal details already exist for this user",
      });
    }

    // 3️⃣ Insert data + Update user record to set paypalDetails to true
    const [paypalData] = await prisma.$transaction([
      prisma.userPaypalDetails.create({
        data: {
          userId,
          paypalId: paypalId || null,
          paypalEmail: paypalEmail || null,
          paypalPayerId: paypalPayerId || null,
          paypalMerchantId: paypalMerchantId || null,
          accountHolderName: accountHolderName || null,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { paypalDetails: true },
      }),
    ]);

    // 4️⃣ Fetch updated user including userSubCategories and socialMediaPlatforms
    const userData = await prisma.user.findFirst({
      where: { id: userId }
    });

    const userSubCategories = await prisma.userSubCategory.findMany({
      where: {
        userId: userId
      }
    })

    const socialMediaPlatforms = await prisma.socialMediaPlatform.findMany({
      where: {
        userId: userId
      }
    })

    // 5️⃣ Calculate profile completion
    const profileCompletion = calculateProfileCompletion({
      ...userData,
      userSubCategories,
      socialMediaPlatforms
    });

    // 6️⃣ Update user's profileCompletion %
    await prisma.user.update({
      where: { id: userId },
      data: {
        profileCompletion,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Paypal details successfully stored",
      data: paypalData,
    });

  } catch (error: any) {
    console.error("Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const updateUserPaypalDetails = async (req: Request, res: Response): Promise<any> => {
  try {
    const paypalRecordId = req.params.id; // this is UserPaypalDetails.id

    const {
      paypalId,
      paypalEmail,
      paypalPayerId,
      paypalMerchantId,
      accountHolderName
    } = req.body;

    // 1️⃣ Check if record exists
    const existingRecord = await prisma.userPaypalDetails.findUnique({
      where: { id: paypalRecordId },
      select: { id: true, userId: true },
    });

    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        message: "Paypal record not found",
      });
    }

    // 2️⃣ Perform update (userId NOT editable)
    const updatedData = await prisma.userPaypalDetails.update({
      where: { id: paypalRecordId },
      data: {
        paypalId: paypalId ?? undefined,
        paypalEmail: paypalEmail ?? undefined,
        paypalPayerId: paypalPayerId ?? undefined,
        paypalMerchantId: paypalMerchantId ?? undefined,
        accountHolderName: accountHolderName ?? undefined,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Paypal details updated successfully",
      data: updatedData,
    });

  } catch (error: any) {
    console.error("Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const getUserPaypalDetails = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    // 1️⃣ Check if user exists
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 2️⃣ Fetch PayPal details
    const paypalDetails = await prisma.userPaypalDetails.findFirst({
      where: { userId },
    });

    if (!paypalDetails) {
      return res.status(200).json({
        success: false,
        message: "PayPal details not found for this user",
      });
    }

    return res.status(200).json({
      success: true,
      message: "PayPal details fetched successfully",
      data: paypalDetails,
    });

  } catch (error: any) {
    console.error("Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const deleteUserPaypalDetails = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params; // UserPaypalDetails.id

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "PayPal record ID is required",
      });
    }

    // 1️⃣ Check if PayPal record exists
    const existingRecord = await prisma.userPaypalDetails.findUnique({
      where: { id },
    });

    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        message: "PayPal details not found",
      });
    }
    console.log(existingRecord, '>>>>>>>>>>> existingRecord');

    // 2️⃣ Delete record
    await prisma.userPaypalDetails.delete({
      where: { id },
    });

    await prisma.user.update({
      where: { id: existingRecord.userId },
      data: { paypalDetails: false },
    });

    return res.status(200).json({
      success: true,
      message: "PayPal details deleted successfully",
    });

  } catch (error: any) {
    console.error("Delete Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};