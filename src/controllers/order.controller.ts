import { Badges } from './../../node_modules/.prisma/client/index.d';
import { Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import response from '../utils/response';
import { getStatusName } from '../utils/commonFunction';
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { IOrder, EditIOrder } from './../interfaces/order.interface';
import { addDays } from 'date-fns';
import {
  OfferStatus,
  PaymentStatus,
  RequestStatus,
  Role,
} from '@prisma/client';
import {
  formatEarningToTransaction,
  formatWithdrawToTransaction,
  TransactionHistoryItem,
} from './../interfaces/responseInterface/history.interface';
import { formatBirthDate } from '../controllers/auth.controller';
import { UserType } from '../enums/userType.enum';
import { sendFCMNotificationToUsers } from '../utils/notification';
import { CoinType, CoinStatus } from '@prisma/client';
import { paginate } from '../utils/pagination';
import {
  paymentRefund,
  getBageData,
  initiateTransfer,
} from '../utils/commonFunction';
import {
  sendEmailWithOptionalPdf,
  generateInvoicePdf,
} from '../utils/sendMail';
import fs from 'fs';
import path from 'path';
import { isDate } from 'util/types';

const prisma = new PrismaClient();

export const createOrder = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const orderData: IOrder = req.body;
    const { businessId, influencerId, completionDate, ...restFields } =
      orderData;

    if (!businessId) {
      return res.status(400).json({ error: 'businessId is required' });
    }

    if (orderData.groupId) {
      const groupUsersList = await prisma.groupUsersList.findMany({
        where: { groupId: orderData.groupId, status: true },
        select: {
          invitedUserId: true,
          adminUserId: true,
          requestAccept: true,
        },
      });

      if (groupUsersList.length === 0) {
        return response.error(res, 'No group members found.');
      }

      // ===== ADMIN USER VALIDATION =====
      const adminUserId = groupUsersList[0].adminUserId;

      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        select: { countryData: { select: { name: true } } },
      });

      if (!adminUser) {
        return response.error(res, 'Admin user not found.');
      }

      const adminCountry = adminUser.countryData?.name;

      // Admin → India or Non-India validation
      if (adminCountry === 'India') {
        const adminBank = await prisma.userBankDetails.findFirst({
          where: { userId: adminUserId, status: true },
        });

        if (!adminBank) {
          return response.error(
            res,
            'Admin must add bank details (India) before proceeding.'
          );
        }
      } else {
        const adminPayPal = await prisma.userPaypalDetails.findFirst({
          where: { userId: adminUserId, status: true },
        });

        if (!adminPayPal) {
          return response.error(
            res,
            'Admin must add PayPal details (non-India) before proceeding.'
          );
        }
      }

      // ===== INVITED USERS VALIDATION =====
      const acceptedInvitedUserIds = groupUsersList
        .filter((u) => u.requestAccept === RequestStatus.ACCEPTED)
        .map((u) => u.invitedUserId);

      if (acceptedInvitedUserIds.length > 0) {
        const invitedUsers = await prisma.user.findMany({
          where: { id: { in: acceptedInvitedUserIds } },
          select: {
            id: true,
            countryData: { select: { name: true } },
          },
        });

        for (const user of invitedUsers) {
          const country = user.countryData?.name;

          if (country === 'India') {
            const bank = await prisma.userBankDetails.findFirst({
              where: { userId: user.id, status: true },
            });

            if (!bank) {
              return response.error(
                res,
                `User ${user.id} must add bank details (India) before proceeding.`
              );
            }
          } else {
            const paypal = await prisma.userPaypalDetails.findFirst({
              where: { userId: user.id, status: true },
            });

            if (!paypal) {
              return response.error(
                res,
                `User ${user.id} must add PayPal details (non-India) before proceeding.`
              );
            }
          }
        }
      }
    }

    // -------- SINGLE INFLUENCER PAYMENT VALIDATION --------
    let influencerUser = null;
    if (influencerId) {
      influencerUser = await prisma.user.findUnique({
        where: { id: influencerId },
        select: { gstNumber: true, countryData: { select: { name: true } } },
      });

      const country = influencerUser?.countryData?.name;

      if (country === 'India') {
        const bankDetails = await prisma.userBankDetails.findFirst({
          where: { userId: influencerId, status: true },
        });
        if (!bankDetails) {
          return response.error(
            res,
            'Influencer must add bank details (India) before creating orders.'
          );
        }
      } else {
        const paypalDetails = await prisma.userPaypalDetails.findFirst({
          where: { userId: influencerId, status: true },
        });
        if (!paypalDetails) {
          return response.error(
            res,
            'Influencer must add PayPal details (non-India) before creating orders.'
          );
        }
      }
    }

    const baseAmount = restFields.finalAmount ?? 0;
    let finalAmount = baseAmount;
    let gst = 0,
      tcs = 0,
      tds = 0;

    const commission = baseAmount * 0.2;
    const commissionGst = commission * 0.18;
    const commissionTotal = commission + commissionGst;

    let isGstRegistered = false;

    if (restFields.groupId) {
      // 👉 Fetch admin and accepted invited users
      const groupUsers = await prisma.groupUsersList.findMany({
        where: {
          groupId: restFields.groupId,
          status: true,
        },
        select: {
          adminUserId: true,
          invitedUserId: true,
          requestAccept: true,
        },
      });

      const adminUserId = groupUsers[0]?.adminUserId;
      const acceptedUserIds = groupUsers
        .filter((u) => u.requestAccept === RequestStatus.ACCEPTED)
        .map((u) => u.invitedUserId);

      // 👉 Include admin in check
      const userIdsToCheck = [...acceptedUserIds, adminUserId];

      // 👉 Check GST for all of them
      const gstUsers = await prisma.user.findMany({
        where: {
          id: { in: userIdsToCheck },
          AND: [{ gstNumber: { not: null } }, { gstNumber: { not: '' } }],
        },
        select: { id: true },
      });

      if (gstUsers.length > 0) {
        isGstRegistered = true;
      }
    } else {
      isGstRegistered = !!influencerUser?.gstNumber;
    }

    // const isGstRegistered = !!influencerUser?.gstNumber;

    if (isGstRegistered) {
      gst = baseAmount * 0.18;
      tcs = baseAmount * 0.01;
      tds = baseAmount * 0.01;

      finalAmount = baseAmount + gst;
    } else {
      const commission = baseAmount * 0.2;
      const commissionGst = commission * 0.18;
      const commissionTotal = commission + commissionGst;

      gst = commissionGst;
      tcs = 0;
      tds = baseAmount * 0.01;

      finalAmount = baseAmount;
    }

    let parsedCompletionDate: Date | undefined = undefined;
    const statusEnumValue = getStatusName(restFields.status ?? 0);

    if (completionDate && typeof completionDate === 'number') {
      parsedCompletionDate = addDays(new Date(), completionDate);
    } else {
      parsedCompletionDate = completionDate;
    }

    const generateOrderId = (): string => {
      const random1 = Math.floor(100 + Math.random() * 900); // 3-digit
      const random2 = Math.floor(10000 + Math.random() * 90000); // 5-digit
      return `ORD-${random1}-${random2}`;
    };

    const generateUniqueOrderId = async (): Promise<string> => {
      let unique = false;
      let orderId = '';

      while (!unique) {
        orderId = generateOrderId();

        const existingOrder = await prisma.orders.findUnique({
          where: { orderId },
        });

        if (!existingOrder) {
          unique = true;
        }
      }

      return orderId;
    };

    const orderId = await generateUniqueOrderId();

    const newOrder = await prisma.orders.create({
      data: {
        orderId,
        ...restFields,
        businessId,
        influencerId,
        finalAmount,
        completionDate: parsedCompletionDate,
        status: statusEnumValue,
        paymentStatus: restFields.paymentStatus ?? 'PENDING',
      },
      include: {
        groupOrderData: {},
        influencerOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
        businessOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
      },
    });

    await prisma.userGstDetails.create({
      data: {
        orderId: newOrder.id,
        basicAmount: baseAmount,
        gst,
        tds,
        tcs: isGstRegistered ? tcs : 0, // store null if not applicable
        totalPayableAmt: finalAmount,
      },
    });

    const formatUser = async (user: any) => {
      if (!user) return null;
      const userCategoriesWithSubcategories =
        await getUserCategoriesWithSubcategories(user.id);
      return {
        ...user,
        categories: userCategoriesWithSubcategories,
        countryName: user.countryData?.name ?? null,
        stateName: user.stateData?.name ?? null,
        cityName: user.cityData?.name ?? null,
      };
    };

    const responseData = {
      ...newOrder,
      influencerOrderData: await formatUser(newOrder.influencerOrderData),
      businessOrderData: await formatUser(newOrder.businessOrderData),
      groupOrderData: await formatUser(newOrder.groupOrderData),
    };

    const businessUser = await prisma.user.findUnique({
      where: { id: newOrder.businessId },
    });

    if (businessUser?.fcmToken) {
      const recipientId = businessUser.id;
      const fcmToken = businessUser.fcmToken;

      let senderName = '';
      let senderType = '';

      if (newOrder.influencerOrderData) {
        senderName = newOrder.influencerOrderData?.name || 'an influencer';
        senderType = 'Influencer';
      } else if (newOrder.groupOrderData) {
        const groupAdminId = newOrder.groupOrderData?.userId;

        if (groupAdminId) {
          const groupAdminUser = await prisma.user.findUnique({
            where: { id: groupAdminId },
          });

          senderName = groupAdminUser?.name || 'a group';
          senderType = 'Group';
        } else {
          senderName = 'a group';
          senderType = 'Group';
        }
      }

      await sendFCMNotificationToUsers(
        [{ id: recipientId, fcmToken }],
        'New Offer Received',
        `You have received a new Offer from ${senderName}`,
        'ORDER_CREATED',
        responseData.id
      );
    }

    return response.success(res, 'Order created successfully!', responseData);
  } catch (error: any) {
    return response.error(res, error.message);
  }
};

export const getByIdOrder = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id } = req.body;
    if (!id) return response.error(res, 'Order ID is required');

    const gstPercentage = 18; // can be dynamic if needed
    let isGstRegistered = false;

    const formattedOrder = await prisma.orders.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        groupId: true,
        influencerId: true,
        businessId: true,
        title: true,
        description: true,
        completionDate: true,
        attachment: true,
        status: true,
        reason: true,
        transactionId: true,
        totalAmount: true,
        discountAmount: true,
        finalAmount: true,
        paymentStatus: true,
        submittedDescription: true,
        submittedAttachment: true,
        socialMediaLink: true,
        businessReviewStatus: true,
        influencerReviewStatus: true,
        createdAt: true,
        updatedAt: true,

        groupOrderData: true,
        influencerOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
        businessOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
      },
    });

    const totalAmount = Number(formattedOrder?.totalAmount || 0);
    const discountAmount = Number(formattedOrder?.discountAmount || 0);
    const mainAmount = totalAmount - discountAmount;

    // Step 2: Check GST registration
    if (formattedOrder.groupId) {
      const groupUsers = await prisma.groupUsersList.findMany({
        where: {
          groupId: formattedOrder.groupId,
          status: true,
        },
        select: {
          adminUserId: true,
          invitedUserId: true,
          requestAccept: true,
        },
      });

      const adminUserId = groupUsers[0]?.adminUserId;
      const acceptedUserIds = groupUsers
        .filter((u) => u.requestAccept === RequestStatus.ACCEPTED)
        .map((u) => u.invitedUserId);

      const userIdsToCheck = [...acceptedUserIds, adminUserId].filter(Boolean);

      const gstUsers = await prisma.user.findMany({
        where: {
          id: { in: userIdsToCheck },
          gstNumber: { not: null },
        },
        select: { id: true },
      });

      if (gstUsers.length > 0) {
        isGstRegistered = true;
      }
    } else {
      // Influencer case
      const influencerUser = await prisma.user.findUnique({
        where: { id: formattedOrder.influencerId || undefined },
        select: { gstNumber: true },
      });

      isGstRegistered = !!influencerUser?.gstNumber;
    }

    // Step 3: GST calculation based on registration
    const gstAmount = isGstRegistered ? (mainAmount * gstPercentage) / 100 : 0;
    const calculatedFinalAmount = mainAmount + gstAmount;

    // Step 4: Final formatted object
    const order = {
      ...formattedOrder,
      gstPercentage,
      gstAmount,
    };

    let businessReview = null;
    if (order?.businessId) {
      businessReview = await prisma.ratings.findFirst({
        where: {
          ratedToUserId: order.businessId,
          orderId: order.id,
        },
        include: {
          ratedByUserData: {
            select: {
              id: true,
              type: true,
              name: true,
              emailAddress: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      order.businessReviews = businessReview ?? null;
    } else {
      order.businessReviews = null;
    }

    let influencerReview = null;
    if (order?.influencerId) {
      influencerReview = await prisma.ratings.findFirst({
        where: {
          ratedToUserId: order.influencerId,
          orderId: order.id,
        },
        include: {
          ratedByUserData: {
            select: {
              id: true,
              type: true,
              name: true,
              emailAddress: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      order.influencerReviews = influencerReview ?? null;
    } else {
      order.influencerReviews = null;
    }

    let groupReview = null;
    if (order?.groupId) {
      groupReview = await prisma.ratings.findFirst({
        where: {
          groupId: order.groupId,
          orderId: order.id,
        },
        include: {
          ratedByUserData: {
            select: {
              id: true,
              type: true,
              name: true,
              emailAddress: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      order.groupReviews = groupReview ?? null;
    } else {
      order.groupReviews = null;
    }

    let submittedMediaDetail = null;
    if (order?.id) {
      const submittedMedia = await prisma.orders.findFirst({
        where: {
          id: order.id,
        },
        select: {
          id: true,
          submittedDescription: true,
          socialMediaLink: true,
          submittedAttachment: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      submittedMediaDetail = submittedMedia;
      order.submittedMediaDetails = submittedMediaDetail ?? null;
    } else {
      order.submittedMediaDetails = null;
    }

    if (!order) {
      return response.error(res, 'Order not found');
    }

    if (order?.influencerOrderData?.id) {
      const businessBageData = await getBageData(
        order?.influencerOrderData?.id
      );
      order.influencerOrderData.badges = businessBageData;
    }

    //  Remove viewCount from influencerOrderData
    if (order.influencerOrderData?.socialMediaPlatforms) {
      order.influencerOrderData.socialMediaPlatforms =
        order.influencerOrderData.socialMediaPlatforms.map(
          ({ viewCount, ...rest }) => rest
        );
    }

    //  Remove viewCount from businessOrderData
    if (order.businessOrderData?.socialMediaPlatforms) {
      order.businessOrderData.socialMediaPlatforms =
        order.businessOrderData.socialMediaPlatforms.map(
          ({ viewCount, ...rest }) => rest
        );
    }

    if (order?.businessOrderData?.id) {
      const businessBageData = await getBageData(order?.businessOrderData?.id);
      order.businessOrderData.badges = businessBageData;
    }

    if (!order?.groupOrderData) {
      return response.success(res, 'Order fetched', order);
    }

    const group = order.groupOrderData;

    const formatUserData = async (user: any) => {
      const usersBadges = await prisma.userBadges.findMany({
        where: { userId: user.id },
        include: {
          userBadgeTitleData: true,
        },
      });
      const userCategoriesWithSubcategories =
        await getUserCategoriesWithSubcategories(user.id);
      const country = user.countryId
        ? await prisma.country.findUnique({
            where: { id: user.countryId },
            select: { name: true },
          })
        : null;
      const state = user.stateId
        ? await prisma.state.findUnique({
            where: { id: user.stateId },
            select: { name: true },
          })
        : null;
      const city = user.cityId
        ? await prisma.city.findUnique({
            where: { id: user.cityId },
            select: { name: true },
          })
        : null;
      const { password: _, socialMediaPlatform: __, ...userData } = user;
      return {
        ...userData,
        categories: userCategoriesWithSubcategories,
        countryName: country?.name ?? null,
        stateName: state?.name ?? null,
        cityName: city?.name ?? null,
        badges: usersBadges.map((b) => b.userBadgeTitleData),
      };
    };

    const subCategoriesWithCategory = await prisma.subCategory.findMany({
      where: { id: { in: group.subCategoryId } },
      include: { categoryInformation: true },
    });

    const groupUsers = await prisma.groupUsers.findMany({
      where: { groupId: group.id },
    });

    const groupMap = new Map<string, any>();

    for (const groupUser of groupUsers) {
      const key = `${groupUser.groupId}-${groupUser.id}`;

      const adminUser = await prisma.user.findUnique({
        where: { id: groupUser.userId },
        include: {
          UserDetail: true,
          socialMediaPlatforms: true,
          brandData: true,
          countryData: true,
          stateData: true,
          cityData: true,
        },
      });

      const formattedAdmin = adminUser ? await formatUserData(adminUser) : null;

      const invitedEntries = await prisma.groupUsersList.findMany({
        where: {
          groupId: group.id,
          groupUserId: groupUser.id,
          requestAccept: 'ACCEPTED',
        },
        include: {
          invitedUser: {
            include: {
              UserDetail: true,
              socialMediaPlatforms: true,
              brandData: true,
              countryData: true,
              stateData: true,
              cityData: true,
            },
          },
        },
      });

      const formattedInvitedUsers = await Promise.all(
        invitedEntries.map(async (entry) => {
          if (!entry.invitedUser) return null;
          const formatted = await formatUserData(entry.invitedUser);
          return {
            ...formatted,
            requestStatus:
              entry.requestAccept === 'ACCEPTED'
                ? 1
                : entry.requestAccept === 'REJECTED'
                  ? 2
                  : 0,
          };
        })
      );

      groupMap.set(key, {
        id: groupUser.id,
        userId: groupUser.userId,
        groupId: groupUser.groupId,
        status: groupUser.status,
        createdAt: groupUser.createsAt,
        updatedAt: groupUser.updatedAt,
        adminUser: formattedAdmin,
        invitedUsers: formattedInvitedUsers.filter(Boolean),
      });
    }

    // Replace raw groupOrderData with formatted one
    const formattedGroup = {
      ...group,
      subCategoryId: subCategoriesWithCategory,
      groupData: Array.from(groupMap.values())[0] || null,
    };
    const finalResponse = {
      ...order,
      groupOrderData: formattedGroup,
    };

    return response.success(
      res,
      'Order fetched with group data',
      finalResponse
    );
  } catch (error: any) {
    return response.error(res, error.message);
  }
};

export const updateOrderStatus = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const orderData: EditIOrder = req.body;

    if (
      typeof orderData.id !== 'string' ||
      typeof orderData.status !== 'number'
    ) {
      return response.error(
        res,
        'Both id (string) and status (number) are required'
      );
    }

    const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return response.error(res, 'Razorpay credentials are missing');
    }

    const {
      id,
      status,
      completionDate,
      groupId,
      influencerId,
      businessId,
      paymentStatus,
      ...safeUpdateFields
    } = orderData;

    const statusEnumValue = getStatusName(status ?? 0);

    // Get current order details for notifications
    const currentOrder = await prisma.orders.findUnique({
      where: { id },
      select: {
        influencerId: true,
        groupId: true,
        businessId: true,
        completionDate: true,
        status: true,
        finalAmount: true,
        totalAmount: true,
        transactionId: true,
      },
    });

    if (!currentOrder) return response.error(res, 'Order not found');

    if (status === 3 && statusEnumValue === OfferStatus.ACTIVATED) {
      await prisma.orders.update({
        where: { id },
        data: {
          paymentStatus: PaymentStatus.COMPLETED,
        },
      });

      const user = await prisma.user.findUnique({
        where: { id: currentOrder?.businessId },
        select: { name: true, emailAddress: true },
      });

      const htmlContent = `
            <p>Hello ${user?.name || 'User'},</p>
            <p>Your order has been <strong>activated</strong> and payment is completed.</p>
            <p>Please find the attached invoice for your reference.</p>
            <p>Thank you for using <strong>KringP</strong>.</p>
            `;

      const fullOrder = await prisma.orders.findUnique({
        where: { id },
        include: {
          businessOrderData: {
            select: {
              name: true,
              emailAddress: true,
              contactPersonPhoneNumber: true,
              cityData: { select: { name: true } },
              stateData: { select: { name: true } },
            },
          },
          influencerOrderData: {
            select: {
              name: true,
              emailAddress: true,
              contactPersonPhoneNumber: true,
              cityData: { select: { name: true } },
              stateData: { select: { name: true } },
            },
          },
          // groupOrderData: { select: { groupName: true } },
          groupOrderData: {
            select: {
              groupName: true,
              groupData: {
                select: {
                  userId: true, // Get userId from GroupUsers (will be an array)
                },
              },
            },
          },
          orderUserGstData: true,
        },
      });
      console.log(fullOrder, '>>>>>>>>>>>>>>>>>> fullOrder');

      let adminUser = null;
      if (!fullOrder) {
        return response.error(res, 'Order not found');
      }

      const adminUserId = fullOrder.groupOrderData?.groupData?.[0]?.userId;
      if (adminUserId) {
        adminUser = await prisma.user.findUnique({
          where: { id: adminUserId },
          select: {
            name: true,
            emailAddress: true,
            contactPersonPhoneNumber: true,
            cityData: { select: { name: true } },
            stateData: { select: { name: true } },
          },
        });
      }

      if (!fullOrder?.businessOrderData) {
        return response.error(res, 'Business user not found');
      }
      //  Generate invoice ID before using it
      const generateInvoiceId = (): string => {
        const part1 = Math.floor(1000 + Math.random() * 9000);
        const part2 = Math.floor(1000 + Math.random() * 9000);
        return `INV-${part1}-${part2}`;
      };

      const generateUniqueInvoiceId = async (): Promise<string> => {
        let unique = false;
        let invoiceId = '';

        while (!unique) {
          invoiceId = generateInvoiceId();
          const existing = await prisma.orderInvoice.findFirst({
            where: { invoiceId },
          });
          if (!existing) unique = true;
        }

        return invoiceId;
      };

      //  Get the unique invoice ID
      const invoiceId = await generateUniqueInvoiceId();

      //  Store invoice record in DB
      await prisma.orderInvoice.create({
        data: {
          orderId: id,
          invoiceId,
        },
      });

      //  Generate invoice PDF (pass invoiceId for filename/content)
      // const invoicePath = await generateInvoicePdf({ ...fullOrder, invoiceId });

      const invoicePath = await generateInvoicePdf(
        { ...fullOrder, invoiceId },
        fullOrder.orderUserGstData,
        adminUser
      );

      await sendEmailWithOptionalPdf(
        user.emailAddress,
        'Invoice for your Order - KringP',
        htmlContent,
        invoicePath
      );
    }

    // // REFUND LOGIC FOR CANCELED ORDERS
    if (status === 6 && statusEnumValue === OfferStatus.DECLINED) {
      try {
        if (currentOrder.finalAmount) {
          const refundAmountInPaise = currentOrder.finalAmount;
          //const refundAmountInPaise = 1;
          const razorpayPaymentId = currentOrder.transactionId;

          const paymentRefundResponse = await paymentRefund(
            razorpayPaymentId,
            refundAmountInPaise
          );
          if (paymentRefundResponse) {
            await prisma.orders.update({
              where: { id },
              data: {
                status: OfferStatus.DECLINED,
                paymentStatus: PaymentStatus.REFUND,
              },
            });

            return response.success(
              res,
              'Order and Payment Refund Successfully',
              null
            );
          } else {
            return response.error(res, `Payment was not Decline`);
          }
        }
      } catch (refundError: any) {
        return response.error(
          res,
          `Failed to process refund: ${refundError.message}`
        );
      }
    }

    // Handle COMPLETED status - update totalDeals, averageValue, onTimeDelivery, and repeatClient
    if (statusEnumValue === OfferStatus.COMPLETED) {
      const eligibleUserIds: string[] = [];

      if (currentOrder.influencerId) {
        eligibleUserIds.push(currentOrder.influencerId);
      }

      if (currentOrder.groupId) {
        // Get accepted users from group
        const acceptedUsers = await prisma.groupUsersList.findMany({
          where: { groupId: currentOrder.groupId, requestAccept: 'ACCEPTED' },
          select: { invitedUserId: true },
        });
        acceptedUsers.forEach(({ invitedUserId }) => {
          if (invitedUserId) eligibleUserIds.push(invitedUserId);
        });

        // Get group admins
        const groupAdmins = await prisma.groupUsers.findMany({
          where: { groupId: currentOrder.groupId },
          select: { userId: true },
        });
        groupAdmins.forEach(({ userId }) => eligibleUserIds.push(userId));
      }

      // Update UserStats for each eligible user
      for (const userId of eligibleUserIds) {
        const existingUserStats = await prisma.userStats.findFirst({
          where: { userId },
          select: {
            id: true,
            totalDeals: true,
            onTimeDelivery: true,
            totalEarnings: true,
            repeatClient: true,
            totalExpenses: true,
          },
        });

        // Check if delivery is on time (completionDate should be within the order completion timeline)
        const isOnTime = currentOrder.completionDate
          ? new Date(currentOrder.completionDate) >= new Date()
          : true;

        // Check for repeat client - check if this is the first time working with this business
        let isNewRepeatBusiness = false;
        if (currentOrder.businessId) {
          const previousOrdersCount = await prisma.orders.count({
            where: {
              businessId: currentOrder.businessId,
              status: OfferStatus.COMPLETED,
              id: { not: id }, // Exclude current order
              OR: [
                { influencerId: userId },
                {
                  groupId: {
                    in: await prisma.groupUsersList
                      .findMany({
                        where: {
                          invitedUserId: userId,
                          requestAccept: 'ACCEPTED',
                        },
                        select: { groupId: true },
                      })
                      .then((results) =>
                        results.map((r) => r.groupId).filter(Boolean)
                      ),
                  },
                },
                {
                  groupId: {
                    in: await prisma.groupUsers
                      .findMany({
                        where: { userId },
                        select: { groupId: true },
                      })
                      .then((results) => results.map((r) => r.groupId)),
                  },
                },
              ],
            },
          });

          // This is a new repeat business if there's exactly 1 previous order (making this the 2nd order)
          isNewRepeatBusiness = previousOrdersCount === 1;
        }

        let newTotalDeals = 1;
        if (existingUserStats) {
          // Update existing UserStats record
          const currentDeals = existingUserStats.totalDeals ?? 0;
          const currentOnTime = existingUserStats.onTimeDelivery ?? 0;
          const totalEarnings = existingUserStats.totalEarnings ?? 0;
          const currentRepeatClient = existingUserStats.repeatClient ?? 0;

          // Calculate average value after incrementing totalDeals
          const newTotalDeals = currentDeals;
          const averageValue =
            newTotalDeals > 0 ? Math.floor(totalEarnings / newTotalDeals) : 0;

          await prisma.userStats.update({
            where: { id: existingUserStats.id },
            data: {
              totalDeals: newTotalDeals + 1,
              onTimeDelivery: isOnTime ? currentOnTime + 1 : currentOnTime,
              repeatClient: isNewRepeatBusiness
                ? currentRepeatClient + 1
                : currentRepeatClient,
              averageValue,
            },
          });
        } else {
          await prisma.userStats.create({
            data: {
              userId,
              totalDeals: 1,
              onTimeDelivery: isOnTime ? 1 : 0,
              repeatClient: 0,
              averageValue: 0,
            },
          });
        }

        // ******  BADGE : 2 START Count total completed orders by the user *********//
        const completedOrders = await prisma.orders.count({
          where: {
            influencerId: userId,
            status: 'COMPLETED',
          },
        });

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { ratings: true },
        });

        const hasMinOrders = completedOrders >= 3;
        const hasHighRating = (user?.ratings?.toNumber?.() ?? 0) >= 4.5;

        if (hasMinOrders && hasHighRating) {
          const badge = await prisma.badges.findFirst({
            where: { type: '2' },
            select: { id: true },
          });

          const alreadyAssigned = await prisma.userBadges.findFirst({
            where: {
              userId,
              badgeId: badge?.id,
            },
          });

          if (badge && !alreadyAssigned) {
            await prisma.userBadges.create({
              data: {
                userId,
                badgeId: badge.id,
              },
            });
          }
        }
        // ******  BADGE : 2 END Count total completed orders by the user *********//

        // ******  BADGE : 3 Start Count total completed orders by the user *********//
        const userStats = await prisma.userStats.findFirst({
          where: { userId },
          select: { totalEarnings: true },
        });

        //  Count completed orders
        const completedOrder = await prisma.orders.count({
          where: {
            influencerId: userId,
            status: 'COMPLETED',
          },
        });

        const users = await prisma.user.findUnique({
          where: { id: userId },
          select: { ratings: true },
        });

        //  Check both conditions: ₹1L+ earnings AND 10+ completed orders
        const hasMinEarnings =
          (userStats?.totalEarnings?.toNumber?.() ?? 0) >= 100000;
        const hasMinOrder = completedOrder >= 10;
        const hasHighRatings = (users?.ratings?.toNumber?.() ?? 0) >= 4.7;

        if (hasMinEarnings && hasMinOrder && hasHighRatings) {
          const badge = await prisma.badges.findFirst({
            where: { type: '3' },
            select: { id: true },
          });

          const alreadyAssigned = await prisma.userBadges.findFirst({
            where: {
              userId,
              badgeId: badge?.id,
            },
          });

          if (badge && !alreadyAssigned) {
            await prisma.userBadges.create({
              data: {
                userId,
                badgeId: badge.id,
              },
            });
          }
        }
        // ******  BADGE : 3 END Count total completed orders by the user *********//

        // ******  BADGE : 4 START Count total completed orders by the user *********//
        const totalRatingsReceived = await prisma.ratings.count({
          where: {
            ratedToUserId: userId,
          },
        });

        const hasHighRatingNew = (user?.ratings?.toNumber?.() ?? 0) >= 5;
        const hasMinReceivedRatings = totalRatingsReceived >= 20;

        if (hasHighRatingNew && hasMinReceivedRatings) {
          const badge = await prisma.badges.findFirst({
            where: { type: '4' },
            select: { id: true },
          });

          const alreadyAssigned = await prisma.userBadges.findFirst({
            where: {
              userId,
              badgeId: badge?.id,
            },
          });

          if (badge && !alreadyAssigned) {
            await prisma.userBadges.create({
              data: {
                userId,
                badgeId: badge.id,
              },
            });
          }
        }
        // ******  BADGE : 4  END Count total completed orders by the user *********//

        // ******  BADGE : 5 START Count total completed orders by the user *********//
        const completedOnTimeOrders = await prisma.orders.findMany({
          where: {
            influencerId: userId,
            status: 'COMPLETED',
          },
          select: {
            id: true,
            updatedAt: true,
            completionDate: true,
          },
        });

        // Filter orders where updatedAt is on or before completionDate
        const onTimeCount = completedOnTimeOrders.filter(
          (order) => order.updatedAt <= order.completionDate
        ).length;

        // If at least 10 on-time completed orders, assign badge 5
        if (onTimeCount >= 10) {
          const badge = await prisma.badges.findFirst({
            where: { type: '5' },
            select: { id: true },
          });

          const alreadyAssigned = await prisma.userBadges.findFirst({
            where: {
              userId,
              badgeId: badge?.id,
            },
          });

          if (badge && !alreadyAssigned) {
            await prisma.userBadges.create({
              data: {
                userId,
                badgeId: badge.id,
              },
            });
          }
        }
        // ******  BADGE : 5 END Count total completed orders by the user *********//
      }
    }

    if (status === 5 && statusEnumValue === OfferStatus.COMPLETED) {
      if (!currentOrder) return response.error(res, 'Order not found');
      if (currentOrder.status === OfferStatus.COMPLETED) {
        const existingEarnings = await prisma.earnings.findFirst({
          where: { orderId: id },
        });
        if (existingEarnings) {
          return response.error(
            res,
            'Order is already completed and earnings have been distributed'
          );
        } else {
          return response.error(res, 'Order is already completed');
        }
      }
      if (currentOrder.status !== OfferStatus.ORDERSUBMITTED) {
        return response.error(
          res,
          'Order must be in ORDERSUBMITTED status before it can be marked as COMPLETED'
        );
      }
    }

    const updated = await prisma.orders.update({
      where: { id },
      data: { ...safeUpdateFields, status: statusEnumValue },
    });

    // FCM NOTIFICATION LOGIC WITH DATABASE STORAGE
    try {
      if ([1, 2, 5].includes(status)) {
        const influencerUsers: any[] = [];

        if (currentOrder.influencerId) {
          const influencer = await prisma.user.findUnique({
            where: { id: currentOrder.influencerId },
            select: { id: true, fcmToken: true, name: true },
          });
          if (influencer) {
            influencerUsers.push(influencer);
          }
        }

        if (currentOrder.groupId) {
          const acceptedUsers = await prisma.groupUsersList.findMany({
            where: {
              groupId: currentOrder.groupId,
              requestAccept: 'ACCEPTED',
            },
            include: {
              invitedUser: {
                select: { id: true, fcmToken: true, name: true },
              },
            },
          });

          acceptedUsers.forEach(({ invitedUser }) => {
            if (invitedUser) {
              influencerUsers.push(invitedUser);
            }
          });

          // Get group admins
          const groupAdmins = await prisma.groupUsers.findMany({
            where: { groupId: currentOrder.groupId },
            include: {
              groupUserData: {
                select: { id: true, fcmToken: true, name: true },
              },
            },
          });

          groupAdmins.forEach(({ groupUserData }) => {
            if (groupUserData) {
              influencerUsers.push(groupUserData);
            }
          });
        }

        // Send notification to influencers
        if (influencerUsers.length > 0) {
          let notificationTitle = '';
          let notificationBody = '';
          let notificationType = '';
          const orderId = updated.id;

          switch (status) {
            case 1: // ACCEPTED
              notificationTitle = 'Order Accepted!';
              notificationBody = `Your order has been accepted and is now in progress.`;
              notificationType = 'ORDER_ACCEPTED';
              break;
            case 2: // CANCELED
              notificationTitle = 'Order Canceled';
              notificationBody = `Your order has been canceled.`;
              notificationType = 'ORDER_CANCELED';
              break;
            case 5: // COMPLETED
              const amount =
                currentOrder.finalAmount ?? currentOrder.totalAmount;
              notificationTitle = 'Order Completed!';
              notificationBody = `Congratulations! Your order has been completed${amount ? ` and earnings of ${amount} have been distributed.` : '.'}`;
              notificationType = 'ORDER_COMPLETED';
              break;
          }

          // Store notifications in database and send FCM
          const notificationPromises = influencerUsers.map(async (user) => {
            try {
              // Send FCM if user has token
              if (user.fcmToken) {
                await sendFCMNotificationToUsers(
                  [user],
                  notificationTitle,
                  notificationBody,
                  notificationType,
                  orderId
                );
              }
            } catch (error: any) {
              console.error(
                `Failed to send notification to user ${user.id}:`,
                error
              );
              // Update notification status to ERROR in database
              await prisma.notification.create({
                data: {
                  userId: user.id,
                  title: notificationTitle,
                  message: notificationBody,
                  type: notificationType,
                  status: 'ERROR',
                  error: error.message || 'FCM notification failed',
                  orderId,
                },
              });
            }
          });

          await Promise.allSettled(notificationPromises);
        }
      }
    } catch (notificationError) {
      console.error('FCM notification process failed:', notificationError);
    }

    const order = await prisma.orders.findUnique({
      where: { id },
      include: {
        groupOrderData: true,
        influencerOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
        businessOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
      },
    });

    if (!order) return response.error(res, 'Order not found after update');

    const formatUserData = async (user: any) => {
      const userCategoriesWithSubcategories =
        await getUserCategoriesWithSubcategories(user.id);
      const { password: _, socialMediaPlatform: __, ...userData } = user;
      return {
        ...userData,
        socialMediaPlatforms:
          userData.socialMediaPlatforms?.map(
            ({ viewCount, ...rest }) => rest
          ) ?? [],
        categories: userCategoriesWithSubcategories,
        countryName: user.countryData?.name ?? null,
        stateName: user.stateData?.name ?? null,
        cityName: user.cityData?.name ?? null,
      };
    };

    let formattedGroup: any = null;

    if (order.groupOrderData) {
      const group = order.groupOrderData;

      const subCategoriesWithCategory = await prisma.subCategory.findMany({
        where: { id: { in: group.subCategoryId } },
        include: { categoryInformation: true },
      });

      const groupUsers = await prisma.groupUsers.findMany({
        where: { groupId: group.id },
      });

      const groupMap = new Map<string, any>();

      for (const groupUser of groupUsers) {
        const adminUser = await prisma.user.findUnique({
          where: { id: groupUser.userId },
          include: {
            UserDetail: true,
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        });

        const formattedAdmin = adminUser
          ? await formatUserData(adminUser)
          : null;

        const invitedEntries = await prisma.groupUsersList.findMany({
          where: {
            groupId: group.id,
            groupUserId: groupUser.id,
            requestAccept: 'ACCEPTED',
          },
          include: {
            invitedUser: {
              include: {
                UserDetail: true,
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
              },
            },
          },
        });

        const formattedInvitedUsers = await Promise.all(
          invitedEntries.map(async (entry) => {
            if (!entry.invitedUser) return null;
            const formatted = await formatUserData(entry.invitedUser);
            return {
              ...formatted,
              requestStatus: 1,
            };
          })
        );

        groupMap.set(`${groupUser.groupId}-${groupUser.id}`, {
          id: groupUser.id,
          userId: groupUser.userId,
          groupId: groupUser.groupId,
          status: groupUser.status,
          createdAt: groupUser.createsAt,
          updatedAt: groupUser.updatedAt,
          adminUser: formattedAdmin,
          invitedUsers: formattedInvitedUsers.filter(Boolean),
        });
      }

      formattedGroup = {
        ...group,
        subCategoryId: subCategoriesWithCategory,
        groupData: Array.from(groupMap.values())[0] || null,
      };
    }

    ////////////////// Earning logic with GST ///////////////////
    let isGstRegistered = false;

    if (updated.groupId) {
      const groupUsers = await prisma.groupUsersList.findMany({
        where: { groupId: updated.groupId, status: true },
        select: { invitedUserId: true, requestAccept: true, adminUserId: true },
      });

      const adminUserId = groupUsers[0]?.adminUserId;
      const acceptedUserIds = groupUsers
        .filter((u) => u.requestAccept === 'ACCEPTED')
        .map((u) => u.invitedUserId);

      const usersToCheck = [...acceptedUserIds, adminUserId];

      const gstUsers = await prisma.user.findMany({
        where: {
          id: { in: usersToCheck },
          gstNumber: { not: null },
        },
        select: { id: true },
      });

      if (gstUsers.length > 0) isGstRegistered = true;
    } else if (updated.influencerId) {
      const influencer = await prisma.user.findUnique({
        where: { id: updated.influencerId },
        select: { gstNumber: true },
      });
      isGstRegistered = !!influencer?.gstNumber;
    }

    // Earnings logic if COMPLETED
    if (status === 5 && statusEnumValue === OfferStatus.COMPLETED) {
      const amount = updated.totalAmount ?? updated.totalAmount;

      if (!amount) return response.error(res, 'Order amount is missing');

      const baseEarning = {
        orderId: updated.id,
        groupId: updated.groupId ?? null,
        businessId: updated.businessId,
        paymentStatus: PaymentStatus.COMPLETED,
      };

      const earningsData: any[] = [];

      // Admin user required in both influencer and group logic
      const adminUser = await prisma.user.findFirst({
        where: { type: 'ADMIN' },
        select: { id: true },
      });
      if (!adminUser) return response.error(res, 'Admin user not found');

      // Global TDS and TCS
      const globalTds = amount * 0.001;
      const globalTcs = isGstRegistered ? amount * 0.01 : 0;

      // Admin Commission (Always calculated, pushed only for non-group orders)
      const adminCommission = amount * 0.2;
      const adminCommissionGst = adminCommission * 0.18;
      const adminFinalEarning = adminCommission + adminCommissionGst;

      // ------------------- Influencer Order -------------------
      if (updated.influencerId && !updated.groupId) {
        const influencerId = updated.influencerId;
        const userShareBase = amount * 0.8;

        const userGstData = await prisma.user.findUnique({
          where: { id: influencerId },
          select: { gstNumber: true },
        });

        const userHasGst = !!userGstData?.gstNumber;
        const userGstAmount = userHasGst ? userShareBase * 0.18 : 0;
        const adminGstAmount = adminCommissionGst;

        let userNetEarning =
          userShareBase - globalTds - globalTcs + userGstAmount;
        if (!userHasGst) {
          userNetEarning -= adminGstAmount;
        }

        // Total GST breakdown for influencer
        await prisma.totalGstData.create({
          data: {
            orderId: updated.id,
            userId: influencerId,
            basicAmount: new Prisma.Decimal(userShareBase),
            gst: new Prisma.Decimal(userGstAmount),
            tds: new Prisma.Decimal(globalTds),
            tcs: new Prisma.Decimal(globalTcs),
            otherAmount: new Prisma.Decimal(0),
            totalAmt: new Prisma.Decimal(userNetEarning),
          },
        });

        earningsData.push({
          ...baseEarning,
          userId: influencerId,
          amount,
          earningAmount: userNetEarning,
        });

        // Admin earns 20% in influencer order
        earningsData.push({
          ...baseEarning,
          userId: adminUser.id,
          amount,
          earningAmount: adminFinalEarning,
        });

        await prisma.totalGstData.create({
          data: {
            orderId: updated.id,
            userId: adminUser.id,
            basicAmount: new Prisma.Decimal(adminCommission),
            gst: new Prisma.Decimal(adminCommissionGst),
            tds: new Prisma.Decimal(0),
            tcs: new Prisma.Decimal(0),
            otherAmount: new Prisma.Decimal(globalTds + globalTcs),
            totalAmt: new Prisma.Decimal(adminFinalEarning),
          },
        });

        console.log(
          `✅ Influencer earnings processed for user ${influencerId}`
        );
      }

      // ------------------- Group Order -------------------
      if (updated.groupId && !updated.influencerId) {
        const eligibleUserIds: string[] = [];

        const acceptedUsers = await prisma.groupUsersList.findMany({
          where: { groupId: updated.groupId, requestAccept: 'ACCEPTED' },
          select: { invitedUserId: true },
        });
        const groupAdmins = await prisma.groupUsers.findMany({
          where: { groupId: updated.groupId },
          select: { userId: true },
        });

        acceptedUsers.forEach(({ invitedUserId }) =>
          eligibleUserIds.push(invitedUserId)
        );
        groupAdmins.forEach(({ userId }) => eligibleUserIds.push(userId));

        if (eligibleUserIds.length > 0) {
          const orderBase = Number(amount); // Convert to number first
          const gstRate = 0.18;

          const totalGstAmount = orderBase * gstRate;
          const totalAmountWithGst = orderBase + totalGstAmount;

          console.log(orderBase, '>>orderBase', gstRate, '>>gstRate');
          const platformShareBase = orderBase * 0.2; // 200
          const platformGst = platformShareBase * gstRate; // 36
          const totalPlatformAmount = platformShareBase + platformGst; // 236

          const userShareBase = orderBase - platformShareBase; // 800
          const perUserShare = userShareBase / eligibleUserIds.length;
          const perUserTds = perUserShare * 0.1;

          // console.log(userShareBase, '>>>>>>>>>>>> userShareBase');
          // console.log(perUserShare, '>>>>>>>>>>>> perUserShare');
          // console.log(perUserTds, '>>>>>>>>>>>> perUserTds');

          const usersWithGstStatus = await prisma.user.findMany({
            where: { id: { in: eligibleUserIds } },
            select: { id: true, gstNumber: true },
          });

          const userGstMap = new Map<string, boolean>();
          usersWithGstStatus.forEach((user) => {
            // userGstMap.set(user.id, !!user.gstNumber);
            userGstMap.set(
              user.id,
              !!(user.gstNumber && user.gstNumber.trim() !== '')
            );
          });

          let totalEarningsDistributed = totalPlatformAmount;

          for (const userId of eligibleUserIds) {
            const userHasGst = userGstMap.get(userId) || false;
            const gstAmount = userHasGst ? perUserShare * gstRate : 0;
            const netEarning = perUserShare + gstAmount - perUserTds;

            // console.log(userHasGst, '>>>>>>>>>>>> userHasGst');
            // console.log(gstAmount, '>>>>>>>>>>>> gstAmount');

            totalEarningsDistributed += netEarning;

            await prisma.totalGstData.create({
              data: {
                orderId: updated.id,
                userId,
                basicAmount: new Prisma.Decimal(perUserShare),
                gst: new Prisma.Decimal(gstAmount),
                tds: new Prisma.Decimal(perUserTds),
                tcs: new Prisma.Decimal(0),
                otherAmount: new Prisma.Decimal(0),
                totalAmt: new Prisma.Decimal(netEarning),
              },
            });

            earningsData.push({
              ...baseEarning,
              userId,
              amount,
              earningAmount: netEarning,
            });
          }

          // Surplus (rounding, unregistered GST loss) → goes to Admin as otherAmount
          const surplusAmount = totalAmountWithGst - totalEarningsDistributed;
          const roundedSurplus = parseFloat(surplusAmount.toFixed(2));

          // console.log("totalAmountWithGst:", totalAmountWithGst);
          // console.log("totalEarningsDistributed:", totalEarningsDistributed);

          const adminCommission = amount * 0.2;
          const adminCommissionGst = adminCommission * 0.18;

          if (surplusAmount > 0) {
            await prisma.totalGstData.create({
              data: {
                orderId: updated.id,
                userId: adminUser.id,
                basicAmount: new Prisma.Decimal(adminCommission),
                gst: new Prisma.Decimal(adminCommissionGst),
                tds: new Prisma.Decimal(0),
                tcs: new Prisma.Decimal(0),
                otherAmount: new Prisma.Decimal(roundedSurplus),
                totalAmt: new Prisma.Decimal(
                  adminCommission + adminCommissionGst
                ),
              },
            });

            earningsData.push({
              ...baseEarning,
              userId: adminUser.id,
              amount,
              earningAmount: adminCommission + adminCommissionGst,
            });
          }

          console.log(
            `✅ Group earnings distributed for groupId ${updated.groupId}`
          );
        }
      }

      // const eligibleUserIds = [];

      // if (updated.influencerId) eligibleUserIds.push(updated.influencerId);

      // console.log(updated.influencerId, '>>>>>>>>>>>>> updated.influencerId');
      // console.log(updated.groupId, '>>>>>>>>>>>>> updated.groupId');

      // if (updated.groupId) {
      //     const acceptedUsers = await prisma.groupUsersList.findMany({
      //         where: { groupId: updated.groupId, requestAccept: 'ACCEPTED' },
      //         select: { invitedUserId: true },
      //     });
      //     acceptedUsers.forEach(({ invitedUserId }) => eligibleUserIds.push(invitedUserId));

      //     const groupAdmins = await prisma.groupUsers.findMany({
      //         where: { groupId: updated.groupId },
      //         select: { userId: true },
      //     });
      //     groupAdmins.forEach(({ userId }) => eligibleUserIds.push(userId));
      // }

      // if (eligibleUserIds.length > 0) {
      //     // // Base amount for users (80% of total)
      //     // const userShareBase = amount * 0.8;
      //     // const perUserShare = userShareBase / eligibleUserIds.length;

      //     // console.log(userShareBase, '>>>>>>>>>>>>>>>>>>>>>>userShareBase');
      //     // console.log(perUserShare, '>>>>>>>>>>>>>>>>>>>>>>perUserShare');

      //     // // Get GST registration status for each user
      //     // const usersWithGstStatus = await prisma.user.findMany({
      //     //     where: { id: { in: eligibleUserIds } },
      //     //     select: { id: true, gstNumber: true },
      //     // });

      //     // const userGstMap = new Map();
      //     // usersWithGstStatus.forEach(user => {
      //     //     userGstMap.set(user.id, !!user.gstNumber);
      //     // });

      //     // // Calculate total GST amount that should be distributed
      //     // const totalGstAmount = userShareBase * 0.18;
      //     // let distributedGstAmount = 0;

      //     // // Calculate TDS and TCS per user
      //     // const perUserTds = globalTds / eligibleUserIds.length;
      //     // const perUserTcs = globalTcs / eligibleUserIds.length;

      //     // for (const userId of eligibleUserIds) {
      //     //     const userHasGst = userGstMap.get(userId) || false;

      //     //     // Calculate GST for this user
      //     //     const userGstAmount = userHasGst ? (perUserShare * 0.18) : 0;
      //     //     distributedGstAmount += userGstAmount;

      //     //     // User's earning including GST but minus TDS/TCS
      //     //     const userGrossEarning = perUserShare;
      //     //     const userNetEarning = userGrossEarning - perUserTds - perUserTcs;

      //         // // Store user's TotalGstData
      //         // try {
      //         //     await prisma.totalGstData.create({
      //         //         data: {
      //         //             orderId: updated.id,
      //         //             userId: userId,
      //         //             basicAmount: new Prisma.Decimal(perUserShare),
      //         //             gst: new Prisma.Decimal(userGstAmount),
      //         //             tds: new Prisma.Decimal(0),
      //         //             tcs: new Prisma.Decimal(0),
      //         //             otherAmount: new Prisma.Decimal(0),
      //         //             totalAmt: new Prisma.Decimal(userNetEarning),
      //         //         },
      //         //     });
      //         // } catch (error) {
      //         //     console.error(`❌ Failed to insert TotalGstData for user ${userId}`, error);
      //         // }

      //         // earningsData.push({
      //         //     ...baseEarning,
      //         //     userId,
      //         //     amount,
      //         //     earningAmount: userNetEarning, // Store net earning after TDS/TCS deduction
      //         // });
      //     // }

      await prisma.earnings.createMany({
        data: earningsData,
        skipDuplicates: true,
      });

      // Update each user's totalEarnings in UserStats table
      for (const entry of earningsData) {
        // Find existing UserStats record for the user
        const existingUserStats = await prisma.userStats.findFirst({
          where: { userId: entry.userId },
          select: { id: true, totalEarnings: true, totalDeals: true },
        });

        if (existingUserStats) {
          // Update existing UserStats record
          const currentTotal = existingUserStats.totalEarnings ?? 0;
          const currentTotalDeals = existingUserStats.totalDeals ?? 0;

          // Add the gross earning (including GST) to total earnings
          const updatedTotal =
            Number(currentTotal) + Number(entry.earningAmount);

          const averageAmount =
            currentTotalDeals > 0 ? updatedTotal / currentTotalDeals : 0;

          await prisma.userStats.update({
            where: { id: existingUserStats.id },
            data: {
              totalEarnings: updatedTotal,
              averageValue: averageAmount,
            },
          });
        } else {
          // Create new UserStats record if it doesn't exist
          await prisma.userStats.create({
            data: {
              userId: entry.userId,
              totalEarnings: Number(entry.earningAmount ?? 0), // Store gross earning
            },
          });
        }
      }

      if (updated.businessId) {
        // Business expense tracking
        const existingBusinessUserStats = await prisma.userStats.findFirst({
          where: { userId: updated.businessId },
          select: {
            id: true,
            totalDeals: true,
            onTimeDelivery: true,
            totalEarnings: true,
            repeatClient: true,
            totalExpenses: true,
          },
        });

        // Check if delivery is on time
        const isOnTime = currentOrder.completionDate
          ? new Date(currentOrder.completionDate) >= new Date()
          : true;

        // Check for repeat client
        let isNewRepeatBusiness = false;
        if (currentOrder.businessId) {
          const previousOrdersCount = await prisma.orders.count({
            where: {
              businessId: updated.businessId,
              status: OfferStatus.COMPLETED,
              id: { not: updated.businessId },
            },
          });

          isNewRepeatBusiness = previousOrdersCount === 1;
        }

        let newTotalDeals = 1;

        if (existingBusinessUserStats) {
          // Update existing business UserStats record
          const currentDeals = existingBusinessUserStats.totalDeals ?? 0;
          const currentOnTime = existingBusinessUserStats.onTimeDelivery ?? 0;
          const totalExpenses = existingBusinessUserStats.totalExpenses ?? 0;
          const newExpense = Number(updated.finalAmount);
          const finalExpenses = Number(totalExpenses) + Number(newExpense);
          const currentRepeatClient =
            existingBusinessUserStats.repeatClient ?? 0;

          // Calculate average value after incrementing totalDeals
          const newTotalDeals = currentDeals + 1;
          const averageValue =
            newTotalDeals > 0 ? Math.floor(finalExpenses / newTotalDeals) : 0;

          await prisma.userStats.update({
            where: { id: existingBusinessUserStats.id },
            data: {
              totalDeals: newTotalDeals,
              totalExpenses: finalExpenses,
              averageValue,
            },
          });
        } else {
          await prisma.userStats.create({
            data: {
              userId: updated.businessId,
              totalDeals: newTotalDeals,
              totalExpenses: Number(updated.finalAmount),
              averageValue:
                newTotalDeals > 0
                  ? Number(updated.finalAmount) / newTotalDeals
                  : 0,
            },
          });
        }
      }

      // Reward business user with KringP Coins for spending
      const kringPCoins = Math.floor(Number(amount) / 100);

      if (kringPCoins > 0) {
        const coinSource = `Spending reward for ₹${amount}`;

        // Create coin transaction
        await prisma.coinTransaction.create({
          data: {
            userId: updated.businessId,
            amount: kringPCoins,
            type: CoinType.CASHOUT_BONUS, // Use enum if defined
            status: 'UNLOCKED',
            source: coinSource,
          },
        });

        // Update or create ReferralCoinSummary for business user
        const businessSummary = await prisma.referralCoinSummary.findUnique({
          where: { userId: updated.businessId },
        });

        if (businessSummary) {
          const totalAmount = Number(businessSummary.totalAmount ?? 0);
          const netAmount = Number(businessSummary.netAmount ?? 0);
          const withdrawAmount = Number(businessSummary.withdrawAmount ?? 0); // If this field exists

          const shouldUpdateNetAmount =
            businessSummary.netAmount === null ||
            businessSummary.withdrawAmount === null ||
            netAmount === totalAmount;
          const FinalTotalAmount = totalAmount + kringPCoins;
          const FinalNetAmount = FinalTotalAmount - withdrawAmount;
          /*
                    shouldUpdateNetAmount
                                ? new Prisma.Decimal(netAmount + kringPCoins)
                                : new Prisma.Decimal(businessSummary.totalAmount ?? 0).minus(
                                    new Prisma.Decimal(businessSummary.withdrawAmount ?? 0)
                                )
                    */
          await prisma.referralCoinSummary.update({
            where: { userId: updated.businessId },
            data: {
              totalAmount: FinalTotalAmount,
              netAmount: FinalNetAmount,
              unlocked: true,
            },
          });
        } else {
          await prisma.referralCoinSummary.create({
            data: {
              userId: updated.businessId,
              totalAmount: kringPCoins,
              netAmount: kringPCoins,
            },
          });
        }
      }

      // }

      // PERFECT REFERRAL REWARD LOGIC
      if (status === 5 && statusEnumValue === OfferStatus.COMPLETED) {
        const userRoles = [
          { key: 'businessId', id: updated.businessId },
          { key: 'influencerId', id: updated.influencerId },
        ];

        for (const { key, id: referredUserId } of userRoles) {
          if (!referredUserId) continue;

          // Count all COMPLETED orders for that user role
          const completedOrderCount = await prisma.orders.count({
            where: {
              status: 'COMPLETED',
              [key]: referredUserId,
            },
          });

          // Only proceed if this is the FIRST completed order
          if (completedOrderCount === 1) {
            const referral = await prisma.referral.findFirst({
              where: {
                referredUserId: referredUserId,
                coinIssued: false,
              },
            });

            // if (referral && referral.referrerId) {
            //     //  Reward 50 UNLOCKED coins to referrer
            //     await prisma.coinTransaction.create({
            //         data: {
            //             userId: referral.referrerId,
            //             type: CoinType.FIRST_DEAL_REFFERAL,
            //             amount: 50,
            //             status: 'UNLOCKED',
            //             source: `Referral reward for ${key} ${referredUserId}`
            //         }
            //     });

            //     // Update or create ReferralCoinSummary for referrer, set unlocked true + unlockedAt
            //     const now = new Date();

            //     const summary = await prisma.referralCoinSummary.findUnique({
            //         where: { userId: referral.referrerId }
            //     });

            //     if (summary) {
            //         await prisma.referralCoinSummary.update({
            //             where: { userId: referral.referrerId },
            //             data: {
            //                 totalAmount: (Number(summary.totalAmount) || 0) + 50,
            //                 unlocked: true,
            //                 unlockedAt: now
            //             }
            //         });
            //     } else {
            //         await prisma.referralCoinSummary.create({
            //             data: {
            //                 userId: referral.referrerId,
            //                 totalAmount: 50,
            //                 unlocked: true,
            //                 unlockedAt: now
            //             }
            //         });
            //     }

            //     // Mark referral as rewarded
            //     await prisma.referral.update({
            //         where: { id: referral.id },
            //         data: { coinIssued: true }
            //     });
            // }

            if (referral && referral.referrerId) {
              const now = new Date();

              // Find existing LOCKED REFERRAL transaction
              const lockedReferralTransaction =
                await prisma.coinTransaction.findFirst({
                  where: {
                    userId: referral.referrerId,
                    type: CoinType.REFERRAL,
                    status: 'LOCKED',
                  },
                });

              if (lockedReferralTransaction) {
                // Unlock the transaction and update the source
                await prisma.coinTransaction.update({
                  where: { id: lockedReferralTransaction.id },
                  data: {
                    status: 'UNLOCKED',
                    source: `Referral reward for ${key} ${referredUserId}`,
                  },
                });

                // Update or create referral coin summary
                const summary = await prisma.referralCoinSummary.findUnique({
                  where: { userId: referral.referrerId },
                });

                if (summary) {
                  await prisma.referralCoinSummary.update({
                    where: { userId: referral.referrerId },
                    data: {
                      totalAmount: (Number(summary.totalAmount) || 0) + 50,
                      unlocked: true,
                      unlockedAt: now,
                    },
                  });
                } else {
                  await prisma.referralCoinSummary.create({
                    data: {
                      userId: referral.referrerId,
                      totalAmount: 50,
                      unlocked: true,
                      unlockedAt: now,
                    },
                  });
                }

                // Mark referral as rewarded
                await prisma.referral.update({
                  where: { id: referral.id },
                  data: { coinIssued: true },
                });
              }
            }
          }
        }
      }

      const detailedEarnings = await Promise.all(
        earningsData.map(async (entry) => {
          const user = await prisma.user.findUnique({
            where: { id: entry.userId },
            include: {
              socialMediaPlatforms: true,
              brandData: true,
              countryData: true,
              stateData: true,
              cityData: true,
            },
          });
          if (!user) return null;
          const userCategoriesWithSubcategories =
            await getUserCategoriesWithSubcategories(user.id);
          const { password: _, ...userData } = user;
          return {
            user: {
              ...userData,
              socialMediaPlatforms:
                userData.socialMediaPlatforms?.map(
                  ({ viewCount, ...rest }) => rest
                ) ?? [],
              categories: userCategoriesWithSubcategories,
              countryName: user?.countryData?.name ?? null,
              stateName: user?.stateData?.name ?? null,
              cityName: user?.cityData?.name ?? null,
            },
            earningAmount: entry.earningAmount,
            orderAmount: entry.amount,
          };
        })
      );

      return response.success(
        res,
        'Order status updated and earnings distributed successfully',
        {
          ...order,
          groupOrderData: formattedGroup,
          earnings: detailedEarnings.filter(Boolean),
        }
      );
    }

    return response.success(res, 'Order status updated successfully', {
      ...order,
      groupOrderData: formattedGroup,
    });
  } catch (error: any) {
    console.error('Update order status failed:', error);
    return response.error(res, error.message || 'Something went wrong');
  }
};

export const getAllOrderList = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { status } = req.body;

    const currentUserId = req.user?.userId;

    if (status === '' || status === undefined || status === null) {
      return response.error(res, 'Status is required');
    }

    const statusEnumValue = getStatusName(status);
    let whereStatus;
    if (status === 3) {
      const completedEnumValue = getStatusName(4);
      whereStatus = [statusEnumValue, completedEnumValue];
    } else {
      whereStatus = [statusEnumValue];
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: currentUserId },
    });

    if (!existingUser) {
      return response.error(res, 'User not found');
    }

    let whereCondition;
    if (existingUser.type === UserType.INFLUENCER) {
      whereCondition = {
        OR: [
          {
            groupOrderData: {
              groupUsersList: {
                some: {
                  OR: [
                    { adminUserId: currentUserId },
                    { invitedUserId: currentUserId },
                  ],
                },
              },
            },
          },
          { influencerId: currentUserId },
        ],
      };
    } else {
      whereCondition = {
        businessId: currentUserId,
      };
    }

    // Option 1: Simple approach - exclude only userId (your original approach)
    const getOrder = await prisma.orders.findMany({
      where: {
        status: {
          in: whereStatus,
        },
        ...whereCondition,
      },
      include: {
        groupOrderData: {
          include: {
            groupUsersList: true,
          },
        },
        influencerOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
        businessOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const gstPercentage = 18;

    const enrichedOrders = await Promise.all(
      getOrder.map(async (order) => {
        const totalAmount = Number(order?.totalAmount || 0);
        const discountAmount = Number(order?.discountAmount || 0);
        const mainAmount = totalAmount - discountAmount;

        let isGstRegistered = false;

        if (order.groupId) {
          const groupUsers = await prisma.groupUsersList.findMany({
            where: {
              groupId: order.groupId,
              status: true,
            },
            select: {
              adminUserId: true,
              invitedUserId: true,
              requestAccept: true,
            },
          });

          const adminUserId = groupUsers[0]?.adminUserId;
          const acceptedUserIds = groupUsers
            .filter((u) => u.requestAccept === RequestStatus.ACCEPTED)
            .map((u) => u.invitedUserId);

          // const userIdsToCheck = [...acceptedUserIds, adminUserId];
          const userIdsToCheck = [...acceptedUserIds, adminUserId].filter(
            Boolean
          );

          const gstUsers = await prisma.user.findMany({
            where: {
              id: { in: userIdsToCheck },
              gstNumber: { not: null },
            },
            select: { id: true },
          });

          isGstRegistered = gstUsers.length > 0;
        } else if (order.influencerId) {
          const influencerUser = await prisma.user.findUnique({
            where: { id: order.influencerId },
            select: { gstNumber: true },
          });

          isGstRegistered = !!influencerUser?.gstNumber;
        }

        const gstAmount = isGstRegistered
          ? (mainAmount * gstPercentage) / 100
          : 0;

        for (const order of getOrder) {
          if (order?.influencerOrderData?.id) {
            const influencerBadgeData = await getBageData(
              order.influencerOrderData.id
            );
            order.influencerOrderData.badges = influencerBadgeData;
          }

          if (order?.businessOrderData?.id) {
            const businessBadgeData = await getBageData(
              order.businessOrderData.id
            );
            order.businessOrderData.badges = businessBadgeData;
          }
        }

        return {
          ...order,
          gstAmount,
          gstPercentage,
        };
      })
    );

    return response.success(res, 'Get All order List', enrichedOrders);
    // return response.success(res, 'Get All order List', getOrder);
  } catch (error: any) {
    return response.error(res, error.message || 'Something went wrong');
  }
};

export const getAdminAllOrderList = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { status, page = 1, limit = 10 } = req.body;

    const tokenUser = req.user;
    if (!tokenUser || !tokenUser.userId) {
      return response.error(res, 'Invalid token payload');
    }

    const loggedInUser = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
    });

    if (!loggedInUser || loggedInUser.type !== 'ADMIN') {
      return response.error(
        res,
        'Unauthorized access. Only ADMIN can delete contact requests.'
      );
    }

    const currentUserId = req.user?.userId;

    let whereStatus;
    if (status === null) {
      const completedEnumValue = getStatusName(0);
      const completedEnumValue1 = getStatusName(1);
      const completedEnumValue2 = getStatusName(2);
      const completedEnumValue3 = getStatusName(3);
      const completedEnumValue4 = getStatusName(4);
      const completedEnumValue5 = getStatusName(5);
      const completedEnumValue6 = getStatusName(6);
      whereStatus = [
        completedEnumValue,
        completedEnumValue1,
        completedEnumValue2,
        completedEnumValue3,
        completedEnumValue4,
        completedEnumValue5,
        completedEnumValue6,
      ];
    } else {
      const statusEnumValue = getStatusName(status);
      whereStatus = [statusEnumValue];
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: currentUserId },
    });

    if (!existingUser) {
      return response.error(res, 'User not found');
    }

    const parsedPage = Number(page) || 1;
    const parsedLimit = Number(limit) || 100;
    const skip = (parsedPage - 1) * parsedLimit;

    // Get total count
    const total = await prisma.orders.count({
      where: {
        status: {
          in: whereStatus,
        },
      },
    });

    // Option 1: Simple approach - exclude only userId (your original approach)
    const getOrder = await prisma.orders.findMany({
      where: {
        status: {
          in: whereStatus,
        },
      },
      include: {
        groupOrderData: {
          include: {
            groupUsersList: true,
          },
        },
        influencerOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
        businessOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: parsedLimit,
    });
    const totalPages = Math.ceil(total / parsedLimit);

    return response.success(res, 'Get All order List', {
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages,
      },
      orderList: getOrder,
    });
  } catch (error: any) {
    return response.error(res, error.message || 'Something went wrong');
  }
};

// Alternative approach - if you know the exact field names
export const getAllOrderListAlternative = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { status } = req.body;
    const currentUserId = req.user?.id || req.userId;

    if (status === '' || status === undefined || status === null) {
      return response.error(res, 'Status is required');
    }

    const statusEnumValue = getStatusName(status);

    const getOrder = await prisma.orders.findMany({
      where: {
        status: statusEnumValue,
        NOT: {
          OR: [
            { userId: currentUserId },
            { influencerOrderData: { id: currentUserId } },
            { businessOrderData: { id: currentUserId } },
          ],
        },
      },
      include: {
        groupOrderData: {},
        influencerOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
        businessOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return response.success(res, 'Get All order List', getOrder);
  } catch (error: any) {
    return response.error(res, error.message || 'Something went wrong');
  }
};

export const orderSubmit = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id, submittedDescription, socialMediaLink, submittedAttachment } =
      req.body;

    if (!id || typeof id !== 'string') {
      return response.error(res, 'Order ID is required and must be a string');
    }

    // Update order with submission details
    await prisma.orders.update({
      where: { id },
      data: {
        submittedDescription,
        socialMediaLink,
        submittedAttachment,
        status: OfferStatus.ORDERSUBMITTED,
      },
    });

    // Fetch updated order with relations
    const order = await prisma.orders.findUnique({
      where: { id },
      include: {
        groupOrderData: true,
        influencerOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
        businessOrderData: {
          include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
          },
        },
      },
    });

    if (!order) return response.error(res, 'Order not found after update');

    // Send notification to business user (if exists)
    if (order.businessId) {
      const businessUser = await prisma.user.findUnique({
        where: { id: order.businessId },
        select: { id: true, fcmToken: true, name: true },
      });

      const notifTitle = 'Order Submitted!';
      const notifMessage =
        'Your order has been submitted and is ready for review.';
      const notifType = 'ORDER_SUBMITTED';
      try {
        // Send FCM if token exists
        if (businessUser?.fcmToken) {
          await sendFCMNotificationToUsers(
            [businessUser],
            notifTitle,
            notifMessage,
            notifType,
            order.id
          );
        }
      } catch (error: any) {
        console.error(
          `FCM Notification failed for business user ${order.businessId}:`,
          error
        );
        // Update error log in Notification table
        await prisma.notification.create({
          data: {
            userId: businessUser?.id || null,
            title: notifTitle,
            message: notifMessage,
            type: notifType,
            status: 'ERROR',
            error: error.message || 'FCM failed',
          },
        });
      }
    }

    if (!order.groupOrderData) {
      return response.success(res, 'Order submitted successfully', order);
    }

    // Format group-related data
    const group = order.groupOrderData;

    const formatUserData = async (user: any) => {
      const userCategoriesWithSubcategories =
        await getUserCategoriesWithSubcategories(user.id);
      const country = user.countryId
        ? await prisma.country.findUnique({
            where: { id: user.countryId },
            select: { name: true },
          })
        : null;
      const state = user.stateId
        ? await prisma.state.findUnique({
            where: { id: user.stateId },
            select: { name: true },
          })
        : null;
      const city = user.cityId
        ? await prisma.city.findUnique({
            where: { id: user.cityId },
            select: { name: true },
          })
        : null;
      const { password: _, socialMediaPlatform: __, ...userData } = user;
      return {
        ...userData,
        categories: userCategoriesWithSubcategories,
        countryName: country?.name ?? null,
        stateName: state?.name ?? null,
        cityName: city?.name ?? null,
      };
    };

    const subCategoriesWithCategory = await prisma.subCategory.findMany({
      where: { id: { in: group.subCategoryId } },
      include: { categoryInformation: true },
    });

    const groupUsers = await prisma.groupUsers.findMany({
      where: { groupId: group.id },
    });

    const groupMap = new Map<string, any>();

    for (const groupUser of groupUsers) {
      const key = `${groupUser.groupId}-${groupUser.id}`;

      const adminUser = await prisma.user.findUnique({
        where: { id: groupUser.userId },
        include: {
          UserDetail: true,
          socialMediaPlatforms: true,
          brandData: true,
          countryData: true,
          stateData: true,
          cityData: true,
        },
      });

      const formattedAdmin = adminUser ? await formatUserData(adminUser) : null;

      const invitedEntries = await prisma.groupUsersList.findMany({
        where: {
          groupId: group.id,
          groupUserId: groupUser.id,
          requestAccept: 'ACCEPTED',
        },
        include: {
          invitedUser: {
            include: {
              UserDetail: true,
              socialMediaPlatforms: true,
              brandData: true,
              countryData: true,
              stateData: true,
              cityData: true,
            },
          },
        },
      });

      const formattedInvitedUsers = await Promise.all(
        invitedEntries.map(async (entry) => {
          if (!entry.invitedUser) return null;
          const formatted = await formatUserData(entry.invitedUser);
          return {
            ...formatted,
            requestStatus:
              entry.requestAccept === 'ACCEPTED'
                ? 1
                : entry.requestAccept === 'REJECTED'
                  ? 2
                  : 0,
          };
        })
      );

      groupMap.set(key, {
        id: groupUser.id,
        userId: groupUser.userId,
        groupId: groupUser.groupId,
        status: groupUser.status,
        createdAt: groupUser.createsAt,
        updatedAt: groupUser.updatedAt,
        adminUser: formattedAdmin,
        invitedUsers: formattedInvitedUsers.filter(Boolean),
      });
    }

    const formattedGroup = {
      ...group,
      subCategoryId: subCategoriesWithCategory,
      groupData: Array.from(groupMap.values())[0] || null,
    };

    const finalResponse = {
      ...order,
      groupOrderData: formattedGroup,
    };

    return response.success(res, 'Order submitted successfully', finalResponse);
  } catch (error: any) {
    console.error('Order submit failed:', error);
    return response.error(res, error.message || 'Something went wrong');
  }
};

export const withdrawAmount = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { userId, withdrawAmount, withdrawalType } = req.body;

    if (!userId || typeof withdrawAmount !== 'number') {
      return response.error(res, 'userId and withdrawAmount are required');
    }

    // Fetch user stats
    const user = await prisma.userStats.findFirst({ where: { userId } });
    if (!user) return response.error(res, 'User stats not found');

    const currentEarnings = user.totalEarnings ?? 0;
    const currentWithdrawals = user.totalWithdraw ?? 0;

    const earningsNumber =
      currentEarnings instanceof Prisma.Decimal
        ? currentEarnings.toNumber()
        : currentEarnings;

    const withdrawalsNumber =
      currentWithdrawals instanceof Prisma.Decimal
        ? currentWithdrawals.toNumber()
        : currentWithdrawals;

    if (withdrawAmount > earningsNumber) {
      return response.error(res, 'Insufficient balance for withdrawal');
    }

    // Fetch bank details
    const userBankDetail = await prisma.userBankDetails.findFirst({
      where: { userId },
    });

    if (
      !userBankDetail ||
      !userBankDetail.accountId ||
      !userBankDetail.accountHolderName
    ) {
      return response.error(res, 'Bank details are incomplete.');
    }

    // Step 1: Attempt to transfer FIRST
    const initiateTransferData = await initiateTransfer(
      withdrawAmount,
      userBankDetail.accountId,
      userBankDetail.accountHolderName
    );

    console.log('Transfer Result:', initiateTransferData);

    if (initiateTransferData.status == false) {
      const message =
        initiateTransferData?.message || 'Transfer failed. Please try again.';
      return response.error(res, message);
    }

    // Step 2: Create withdrawal record
    const newWithdraw = await prisma.withdraw.create({
      data: {
        userId,
        withdrawAmount,
        withdrawalType,
        transactionType: 'DEBIT',
      },
    });

    // Step 3: Update user stats
    await prisma.userStats.update({
      where: { id: user.id },
      data: {
        totalWithdraw: new Prisma.Decimal(withdrawalsNumber).plus(
          withdrawAmount
        ),
        totalEarnings: new Prisma.Decimal(earningsNumber).minus(withdrawAmount),
      },
    });

    // Step 4: Issue KringP Coins
    const kringPCoins = Math.floor(withdrawAmount / 100);
    const sourceNote = `Withdrawal reward for ₹${withdrawAmount}`;

    if (kringPCoins > 0) {
      await prisma.coinTransaction.create({
        data: {
          userId,
          amount: kringPCoins,
          type: 'CASHOUT_BONUS',
          status: 'UNLOCKED',
          source: sourceNote,
        },
      });

      const existingSummary = await prisma.referralCoinSummary.findUnique({
        where: { userId },
      });

      if (existingSummary) {
        await prisma.referralCoinSummary.update({
          where: { userId },
          data: {
            totalAmount: Number(existingSummary.totalAmount ?? 0) + kringPCoins,
            netAmount: new Prisma.Decimal(existingSummary.netAmount ?? 0).plus(
              kringPCoins
            ),
            unlocked: true,
            unlockedAt: new Date(),
          },
        });
      } else {
        await prisma.referralCoinSummary.create({
          data: {
            userId,
            totalAmount: kringPCoins,
            netAmount: kringPCoins,
            unlocked: true,
            unlockedAt: new Date(),
          },
        });
      }
    }

    // ✅ Final response
    return response.success(
      res,
      'Withdrawal successful. Please check your account.',
      {
        withdraw: newWithdraw,
        updatedBalance: earningsNumber - withdrawAmount,
        kringPCoinsIssued: kringPCoins,
        transferReference: initiateTransferData.transferRef ?? null,
      }
    );
  } catch (error: any) {
    console.error('Withdraw Error:', error);
    return response.error(res, error.message || 'Something went wrong');
  }
};

const formatUserData = async (user: any) => {
  const userCategoriesWithSubcategories =
    await getUserCategoriesWithSubcategories(user.id);

  const { password: _, socialMediaPlatforms: __, ...userData } = user;

  return {
    ...userData,
    categories: userCategoriesWithSubcategories,
    countryName: user.countryData?.name ?? null,
    stateName: user.stateData?.name ?? null,
    cityName: user.cityData?.name ?? null,
  };
};

export const getTransactionHistory = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { userId, startDate, endDate, businessId, type } = req.body;

    if (!userId || typeof userId !== 'string') {
      return response.error(res, 'userId is required');
    }

    const dateFilter: any = {};

    // Parse dates with DD/MM/YYYY support
    if (startDate) {
      const parsedStartDate = formatBirthDate(startDate);
      if (parsedStartDate) {
        parsedStartDate.setHours(0, 0, 0, 0);
        dateFilter.gte = parsedStartDate;
      } else {
        return response.error(
          res,
          'Invalid startDate format. Expected DD/MM/YYYY'
        );
      }
    }

    if (endDate) {
      const parsedEndDate = formatBirthDate(endDate);
      if (parsedEndDate) {
        parsedEndDate.setHours(23, 59, 59, 999);
        dateFilter.lte = parsedEndDate;
      } else {
        return response.error(
          res,
          'Invalid endDate format. Expected DD/MM/YYYY'
        );
      }
    }

    let formattedEarnings: TransactionHistoryItem[] = [];
    let totalEarnings = 0;

    if (!type || type === 'EARNING') {
      const earnings = await prisma.earnings.findMany({
        where: {
          userId,
          createdAt: Object.keys(dateFilter).length ? dateFilter : undefined,
        },
        include: {
          orderData: {
            include: {
              businessOrderData: {
                include: {
                  socialMediaPlatforms: true,
                  brandData: true,
                  countryData: true,
                  stateData: true,
                  cityData: true,
                },
              },
            },
          },
          groupEarningData: true,
          businessPaymentData: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const filteredEarnings = businessId
        ? earnings.filter(
            (e) =>
              e.orderData?.businessOrderData?.id === businessId ||
              e.businessPaymentData?.id === businessId
          )
        : earnings;

      formattedEarnings = filteredEarnings.map(formatEarningToTransaction);
      totalEarnings = formattedEarnings.reduce(
        (sum, t) => sum + Number(t.amount),
        0
      );
    }

    let formattedWithdrawals: TransactionHistoryItem[] = [];
    let totalWithdraw = 0;

    if (!type || type === 'WITHDRAWAL') {
      const withdrawals = await prisma.withdraw.findMany({
        where: {
          userId,
          createdAt: Object.keys(dateFilter).length ? dateFilter : undefined,
        },
      });

      formattedWithdrawals = withdrawals.map(formatWithdrawToTransaction);
      totalWithdraw = formattedWithdrawals.reduce(
        (sum, t) => sum + Number(t.amount),
        0
      );
    }

    let formattedBusinessOrders: TransactionHistoryItem[] = [];
    let totalBusinessExpenses = 0;

    if (!type || type === 'EXPENSE') {
      const businessOrders = await prisma.orders.findMany({
        where: {
          businessId: userId,
          status: 'COMPLETED',
          createdAt: Object.keys(dateFilter).length ? dateFilter : undefined,
        },
        include: {
          groupOrderData: true,
          influencerOrderData: {
            include: {
              socialMediaPlatforms: true,
              brandData: true,
              countryData: true,
              stateData: true,
              cityData: true,
            },
          },
          businessOrderData: {
            include: {
              socialMediaPlatforms: true,
              brandData: true,
              countryData: true,
              stateData: true,
              cityData: true,
            },
          },
        },
      });

      formattedBusinessOrders = [];

      for (const order of businessOrders) {
        let formattedGroup: any = null;

        if (order.groupOrderData) {
          const group = order.groupOrderData;

          const subCategoriesWithCategory = await prisma.subCategory.findMany({
            where: { id: { in: group.subCategoryId } },
            include: { categoryInformation: true },
          });

          const groupUsers = await prisma.groupUsers.findMany({
            where: { groupId: group.id },
          });

          const groupMap = new Map<string, any>();

          for (const groupUser of groupUsers) {
            const adminUser = await prisma.user.findUnique({
              where: { id: groupUser.userId },
              include: {
                UserDetail: true,
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
              },
            });

            const formattedAdmin = adminUser
              ? await formatUserData(adminUser)
              : null;

            const invitedEntries = await prisma.groupUsersList.findMany({
              where: {
                groupId: group.id,
                groupUserId: groupUser.id,
                requestAccept: 'ACCEPTED',
              },
              include: {
                invitedUser: {
                  include: {
                    UserDetail: true,
                    socialMediaPlatforms: true,
                    brandData: true,
                    countryData: true,
                    stateData: true,
                    cityData: true,
                  },
                },
              },
            });

            const formattedInvitedUsers = await Promise.all(
              invitedEntries.map(async (entry) => {
                if (!entry.invitedUser) return null;
                const formatted = await formatUserData(entry.invitedUser);
                return {
                  ...formatted,
                  requestStatus: 1,
                };
              })
            );

            groupMap.set(`${groupUser.groupId}-${groupUser.id}`, {
              id: groupUser.id,
              userId: groupUser.userId,
              groupId: groupUser.groupId,
              status: groupUser.status,
              createdAt: groupUser.createsAt,
              updatedAt: groupUser.updatedAt,
              adminUser: formattedAdmin,
              invitedUsers: formattedInvitedUsers.filter(Boolean),
            });
          }

          formattedGroup = {
            ...group,
            subCategoryId: subCategoriesWithCategory,
            groupData: Array.from(groupMap.values())[0] || null,
          };
        }

        formattedBusinessOrders.push({
          id: order.id,
          type: 'EXPENSE',
          amount: Number(order.finalAmount ?? 0),
          createdAt: order.createdAt!,
          title: order.title ?? 'Business Order',
          description: order.description ?? '',
          referenceId: order.transactionId ?? '',
          orderDetails: {
            ...order,
            groupOrderData: formattedGroup,
          },
        });
      }

      totalBusinessExpenses = formattedBusinessOrders.reduce(
        (sum, t) => sum + Number(t.amount),
        0
      );
    }

    const transactionData = [
      ...formattedEarnings,
      ...formattedWithdrawals,
      ...formattedBusinessOrders,
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    let totalExpenses = 0;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { type: true },
    });

    if (user?.type === 'BUSINESS') {
      const completedOrders = await prisma.orders.findMany({
        where: {
          businessId: userId,
          status: 'COMPLETED',
          createdAt: Object.keys(dateFilter).length ? dateFilter : undefined,
        },
        select: { finalAmount: true },
      });

      totalExpenses = completedOrders.reduce(
        (sum, order) => sum + Number(order.finalAmount),
        0
      );
    }

    const responseData = {
      totalEarnings,
      totalWithdraw,
      totalBusinessExpenses,
      netEarnings: totalEarnings - totalWithdraw,
      transactionData,
    };

    return response.success(
      res,
      'Transaction history fetched successfully',
      responseData
    );
  } catch (error: any) {
    console.error('Error fetching transaction history:', error);
    return response.error(res, error.message || 'Something went wrong');
  }
};

// export const withdrawCoins = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { userId, withdrawAmount } = req.body;

//         if (!userId || typeof withdrawAmount !== 'number') {
//             return response.error(res, 'userId and withdrawAmount are required');
//         }

//         // Fetch current referral coin summary
//         const summary = await prisma.referralCoinSummary.findUnique({
//             where: { userId },
//         });

//         if (!summary) {
//             return response.error(res, 'Referral coin summary not found');
//         }

//         if (!summary.unlocked) {
//             return response.error(res, 'Coins are not unlocked yet for withdrawal');
//         }

//         const currentTotal = summary.totalAmount ?? 0;
//         const currentWithdraw = summary.withdrawAmount ?? new Prisma.Decimal(0);
//         const decimalWithdraw = new Prisma.Decimal(withdrawAmount);

//         // Calculate new withdraw and net amounts
//         const updatedWithdraw = currentWithdraw.plus(withdrawAmount);
//         if (updatedWithdraw.gt(currentTotal)) {
//             return response.error(res, 'Withdrawal amount exceeds available coins');
//         }

//         const netAmount = new Prisma.Decimal(currentTotal).minus(updatedWithdraw);

//         const [updatedSummary, newWithdrawRecord] = await prisma.$transaction([
//             prisma.referralCoinSummary.update({
//                 where: { userId },
//                 data: {
//                     withdrawAmount: updatedWithdraw,
//                     netAmount: netAmount,
//                 },
//             }),
//             prisma.userCoinWithdraw.create({
//                 data: {
//                     userId,
//                     withdrawalAmount: decimalWithdraw,
//                 },
//             }),
//         ]);

//         const userBandDetail = await prisma.userBankDetails.findFirst({
//             where: { userId }
//         });
//         if (userBandDetail) {
//             const initiateTransferData = await initiateTransfer(withdrawAmount, userBandDetail?.accountId, userBandDetail?.accountHolderName);

//             if (initiateTransferData) {
//                 return response.success(res, 'Referral coin withdrawal recorded successfully', {
//                     withdrawalRecord: newWithdrawRecord,
//                     updatedSummary,
//                 });
//             } else {
//                 return response.error(res, 'Insufficient coin balance for withdrawal');
//             }
//         } else {
//             return response.error(res, 'Please check bank Detail');
//         }

//     } catch (error: any) {
//         console.error('Coin Withdrawal Error:', error);
//         return response.error(res, error.message || 'Something went wrong during coin withdrawal');
//     }
// };

export const withdrawCoins = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    // Optional: you can still extract these if needed
    const { userId, withdrawAmount } = req.body;

    // Simply return a message that coins cannot be withdrawn
    return response.error(
      res,
      'Coins cannot be withdrawn. They can only be used for SPIN and Product Purchase.'
    );
  } catch (error: any) {
    console.error('Coin Withdrawal Attempt Error:', error);
    return response.error(
      res,
      error.message || 'Something went wrong during coin withdrawal attempt'
    );
  }
};

export const addCoins = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, addAmount } = req.body;

    // Validate userId
    if (!userId || typeof userId !== 'string') {
      return response.error(res, 'Valid userId is required');
    }

    // Validate addAmount as number (positive or negative allowed)
    if (typeof addAmount !== 'number' || addAmount === 0) {
      return response.error(res, 'addAmount must be a non-zero number');
    }

    // Fetch summary
    const summary = await prisma.referralCoinSummary.findFirst({
      where: { userId },
    });

    if (!summary) {
      return response.error(res, 'Referral coin summary not found');
    }

    const currentTotal = Number(summary.totalAmount || 0);
    const currentWithdraw = Number(summary.withdrawAmount || 0);
    const currentNet = Number(summary.netAmount || 0);

    // Now UPDATE based on sign of addAmount
    let updatedTotal = currentTotal;
    let updatedWithdraw = currentWithdraw;

    if (addAmount > 0) {
      // ADDING COINS
      updatedTotal = currentTotal + addAmount;
    } else {
      // USING / DEDUCTING COINS  (addAmount is negative)
      const used = Math.abs(addAmount);
      updatedWithdraw = currentWithdraw + used;
    }

    const updatedNet = updatedTotal - updatedWithdraw;

    // Update + History
    const [updatedSummary, addRecord] = await prisma.$transaction([
      prisma.referralCoinSummary.update({
        where: { id: summary.id },
        data: {
          totalAmount: updatedTotal,
          withdrawAmount: updatedWithdraw,
          netAmount: updatedNet,
        },
      }),

      prisma.coinTransaction.create({
        data: {
          userId,
          amount: addAmount, // negative or positive
          type: addAmount > 0 ? CoinType.SPIN : CoinType.USED,
          status: CoinStatus.UNLOCKED,
        },
      }),
    ]);

    return response.success(res, 'Coin transaction successful', {
      amountChange: addAmount,
      summary: updatedSummary,
      transaction: addRecord,
    });
  } catch (error: any) {
    console.error('Add Coins Error:', error);
    return response.error(
      res,
      error.message || 'Something went wrong while updating coins'
    );
  }
};

export const getUserCoinHistory = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: 'User ID is required' });
    }

    // Fetch referral summary
    const referralSummary = await prisma.referralCoinSummary.findUnique({
      where: { userId },
      select: {
        totalAmount: true,
        withdrawAmount: true,
        unlocked: true,
      },
    });

    const totalAmount = Number(referralSummary?.totalAmount || 0);
    const withdrawAmount = referralSummary?.unlocked
      ? Number(referralSummary?.withdrawAmount || 0)
      : 0;
    const netAmount = totalAmount - withdrawAmount;

    // 1. Get all referral coin transactions (locked/unlocked)
    const paginated = await paginate(
      req,
      prisma.coinTransaction,
      {
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          type: true,
          source: true,
          status: true,
          createdAt: true,
        },
      },
      'transactions'
    );

    const coinTransactions = paginated.transactions;

    const history = coinTransactions.map((tx) => ({
      id: tx.id,
      date: tx.createdAt,
      type: tx.type,
      source: tx.source || null,
      amount: tx.amount,
      status: tx.status,
      isWithdrawal: false,
    }));

    // 2. Get all withdrawal entries
    const withdrawals = await prisma.userCoinWithdraw.findMany({
      where: { userId },
      orderBy: { id: 'desc' }, // Optional
      select: {
        id: true,
        withdrawalAmount: true,
        createdAt: true,
      },
    });

    const formattedWithdrawals = withdrawals.map((w) => ({
      id: w.id,
      date: w.createdAt,
      type: 'WITHDRAWAL',
      source: null,
      amount: Number(w.withdrawalAmount ?? 0),
      status: 'PROCESSED',
      isWithdrawal: true,
    }));

    // 3. Merge & sort all history by date desc
    const fullHistory = [...history, ...formattedWithdrawals].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Final response
    return response.success(
      res,
      'Referral coin history fetched successfully.',
      {
        totalAmount,
        withdrawAmount,
        netAmount,
        data: fullHistory,
        meta: paginated.meta,
      }
    );
  } catch (error: any) {
    console.error('Get User Coin History Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch user coin history',
    });
  }
};

export const getUserGstByOrderId = async (
  req: Request,
  res: Response
): Promise<any> => {
  const { orderId } = req.body;

  if (!orderId || typeof orderId !== 'string') {
    return response.error(res, 'Invalid or missing orderId');
  }

  try {
    const gstData = await prisma.userGstDetails.findFirst({
      where: { orderId },
      select: {
        id: true,
        orderId: true,
        basicAmount: true,
        gst: true,
        totalPayableAmt: true,
        orderUserGstData: {
          select: {
            title: true,
            description: true,
            completionDate: true,
          },
        },
      },
    });

    if (!gstData) {
      return response.error(res, 'No GST details found for the given orderId');
    }

    // If basicAmount and totalPayableAmt are equal, override gst to 0
    const adjustedGst =
      Number(gstData.basicAmount) === Number(gstData.totalPayableAmt)
        ? '0'
        : String(gstData.gst);

    const responseData = {
      ...gstData,
      gst: adjustedGst,
      gstPercentage: 18,
    };

    return response.success(
      res,
      'GST details fetched successfully',
      responseData
    );
  } catch (error: any) {
    console.error(error);
    return response.error(res, 'Failed to fetch GST details');
  }
};

export const getDataByOrderId = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id } = req.body;

    if (!id) {
      return response.error(res, 'orderId is required');
    }

    const order = await prisma.orders.findFirst({
      where: { orderId: id },
      select: {
        orderId: true,
      },
    });

    const invoice = await prisma.orderInvoice.findFirst({
      where: { orderId: id },
      select: {
        invoiceId: true,
      },
    });

    const gstEntries = await prisma.totalGstData.findMany({
      where: { orderId: id },
      include: {
        totalUserData: {
          select: {
            id: true,
            name: true,
            type: true,
            emailAddress: true,
            gstNumber: true,
          },
        },
      },
    });

    let adminOtherAmount = 0;
    let totalAmount = 0;
    let totalTDS = 0;
    let totalTCS = 0;
    const breakup: any[] = [];

    const formattedGstEntries = gstEntries.map((entry) => {
      const totalAmt = Number(entry.totalAmt ?? 0);
      const otherAmt = Number(entry.otherAmount ?? 0);
      const tds = Number(entry.tds ?? 0);
      const tcs = Number(entry.tcs ?? 0);
      const user = entry.totalUserData;

      if (user?.type === 'ADMIN') {
        adminOtherAmount += otherAmt;
      }

      totalAmount += totalAmt;
      totalTDS += tds;
      totalTCS += tcs;

      breakup.push({
        userId: user?.id || entry.userId,
        name: user?.name || '',
        type: user?.type || '',
        amount: totalAmt.toFixed(2),
      });

      return {
        userId: user?.id || entry.userId,
        name: user?.name || '',
        type: user?.type || '',
        emailAddress: user?.emailAddress || '',
        gstNumber: user?.gstNumber || '',
        basicAmount: entry.basicAmount?.toString() || '0',
        gst: entry.gst?.toString() || '0',
        tds: entry.tds?.toString() || '0',
        tcs: entry.tcs?.toString() || '0',
        otherAmount: entry.otherAmount?.toString() || '0',
        totalAmt: entry.totalAmt?.toString() || '0',
      };
    });

    const responseData = {
      invoiceId: invoice?.invoiceId || null,
      gstDetails: formattedGstEntries,
      summary: {
        breakup,
        adminOtherAmount: adminOtherAmount.toFixed(2),
        totalTDS: totalTDS.toFixed(2),
        totalTCS: totalTCS.toFixed(2),
        total: (totalAmount + adminOtherAmount).toFixed(2),
      },
    };

    return response.success(
      res,
      'Invoice and GST details fetched successfully',
      responseData
    );
  } catch (error: any) {
    return response.error(res, error.message || 'Something went wrong');
  }
};

export const updateOrderStatusAndInsertEarnings = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id, status } = req.body;

    if (typeof id !== 'string' || typeof status !== 'number') {
      return response.error(
        res,
        'Both id string and status number are required'
      );
    }

    if (!id) {
      return response.error(res, 'Invalid Uuid formate.');
    }

    const statusEnum = getStatusName(status);

    // 1. Update Order Status
    const order = await prisma.orders.update({
      where: { id },
      data: { status: statusEnum },
      include: {
        groupOrderData: true,
        influencerOrderData: true,
        businessOrderData: true,
      },
    });

    if (!order) {
      return response.error(res, 'Order not found');
    }

    if (statusEnum === OfferStatus.COMPLETED) {
      const amount = order.finalAmount ?? order.totalAmount;

      if (!amount) {
        return response.error(
          res,
          'Order amount is missing, cannot generate earnings'
        );
      }

      const earningsData: any[] = [];

      const baseEarning = {
        orderId: order.id,
        groupId: order.groupId ?? null,
        businessId: order.businessId,
        paymentStatus: PaymentStatus.COMPLETED,
      };

      // 1. Admin gets 20%
      const adminUser = await prisma.user.findFirst({
        where: { type: 'ADMIN' },
        select: { id: true },
      });

      if (!adminUser) {
        return response.error(res, 'Admin user not found');
      }

      const adminAmount = amount * 0.2;
      earningsData.push({
        ...baseEarning,
        userId: adminUser.id,
        amount: amount,
        earningAmount: adminAmount,
      });

      // 2. Collect all other eligible user IDs: influencer, invited users, and group admin(s)
      const eligibleUserIds: string[] = [];

      // a. Add influencer if exists
      if (order.influencerId) {
        eligibleUserIds.push(order.influencerId);
      }

      // b. Add accepted invited group users
      if (order.groupId) {
        const acceptedInvited = await prisma.groupUsersList.findMany({
          where: {
            groupId: order.groupId,
            requestAccept: RequestStatus.ACCEPTED,
          },
          select: {
            invitedUserId: true,
          },
        });

        acceptedInvited.forEach((user) =>
          eligibleUserIds.push(user.invitedUserId)
        );

        // c. Add group admin(s) from groupUsers table
        const groupAdmins = await prisma.groupUsers.findMany({
          where: {
            groupId: order.groupId,
          },
          select: {
            userId: true,
          },
        });

        groupAdmins.forEach((admin) => eligibleUserIds.push(admin.userId));
      }

      // 3. Distribute 80% equally
      if (eligibleUserIds.length > 0) {
        const sharedAmountPerUser = (amount * 0.8) / eligibleUserIds.length;

        for (const userId of eligibleUserIds) {
          earningsData.push({
            ...baseEarning,
            userId,
            amount: amount,
            earningAmount: sharedAmountPerUser,
          });
        }
      }

      /// 4. Insert all earnings
      if (earningsData.length > 0) {
        await prisma.earnings.createMany({
          data: earningsData,
          skipDuplicates: true,
        });

        // Fetch user details for response
        const detailedEarnings = await Promise.all(
          earningsData.map(async (entry) => {
            const user = await prisma.user.findUnique({
              where: { id: entry.userId },
              include: {
                // UserDetail: true,
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
              },
            });

            const { password: _, ...userData } = user || {};
            const userCategoriesWithSubcategories =
              await getUserCategoriesWithSubcategories(user.id);

            return {
              user: {
                ...userData,
                categories: userCategoriesWithSubcategories,
                countryName: user?.countryData?.name ?? null,
                stateName: user?.stateData?.name ?? null,
                cityName: user?.cityData?.name ?? null,
              },
              earningAmount: entry.earningAmount,
              orderAmount: entry.amount,
            };
          })
        );

        return response.success(
          res,
          'Order status updated and earnings inserted (if applicable)',
          detailedEarnings
          // detailedEarnings.filter(Boolean)
        );
      }
    }

    return response.success(res, 'Order status updated', null);
  } catch (error: any) {
    console.error('Earnings generation failed:', error);
    return response.error(res, error.message || 'Something went wrong');
  }
};
