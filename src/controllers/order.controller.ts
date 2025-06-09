import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import response from '../utils/response';
import { getStatusName } from '../utils/commonFunction'
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { IOrder, EditIOrder } from './../interfaces/order.interface';
// import { PaymentStatus, OfferStatus } from '../enums/userType.enum';
import { addDays } from 'date-fns';
import { OfferStatus, PaymentStatus, RequestStatus, Role } from '@prisma/client';




const prisma = new PrismaClient();

export const createOrder = async (req: Request, res: Response): Promise<any> => {
    try {
        const orderData: IOrder = req.body;
        const {
            businessId,
            influencerId,
            completionDate,
            ...restFields
        } = orderData;

        if (!businessId) {
            return res.status(400).json({ error: 'businessId is required' });
        }

        let parsedCompletionDate: Date | undefined = undefined;
        const statusEnumValue = getStatusName(restFields.status ?? 0);


        if (completionDate && typeof completionDate === 'number') {
            parsedCompletionDate = addDays(new Date(), completionDate);
        } else {
            parsedCompletionDate = completionDate;
        }

        const newOrder = await prisma.orders.create({
            data: {
                ...restFields,
                businessId,
                influencerId,
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
                    }
                },
                businessOrderData: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    }
                }
            }
        });

        const formatUser = async (user: any) => {
            if (!user) return null;
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
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

        return response.success(res, 'Order created successfully!', responseData);
    } catch (error: any) {
        return response.error(res, error.message);
    }
};



export const getByIdOrder = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.body;
        if (!id) return response.error(res, 'Order ID is required');

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

        if (!order?.groupOrderData) {
            return response.success(res, 'Order fetched', order);
        }

        const group = order.groupOrderData;

        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            const country = user.countryId ? await prisma.country.findUnique({ where: { id: user.countryId }, select: { name: true } }) : null;
            const state = user.stateId ? await prisma.state.findUnique({ where: { id: user.stateId }, select: { name: true } }) : null;
            const city = user.cityId ? await prisma.city.findUnique({ where: { id: user.cityId }, select: { name: true } }) : null;
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
                    // requestAccept: 'ACCEPTED',
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
                    //     requestStatus:
                    //         entry.requestAccept === 'ACCEPTED'
                    //             ? 1
                    //             : entry.requestAccept === 'REJECTED'
                    //                 ? 2
                    //                 : 0,
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
            groupData: Array.from(groupMap.values()),
        };

        const finalResponse = {
            ...order,
            groupOrderData: formattedGroup,
        };

        return response.success(res, 'Order fetched with group data', finalResponse);
    } catch (error: any) {
        console.error('getByIdOrder error:', error);
        return response.error(res, error.message);
    }
};





export const updateOrderStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const orderData: EditIOrder = req.body;

        // Validate required fields
        if (typeof orderData.id !== 'string' || typeof orderData.status !== 'number') {
            return response.error(res, 'Both id (string) and status (number) are required');
        }

        // Extract and convert status

        // Destructure and safely omit `id`
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

        // Build final update object
        const statusEnumValue = getStatusName(status ?? 0);

        // Build update payload
        const dataToUpdate: any = {
            ...safeUpdateFields,
            status: statusEnumValue,
        };

        const updated = await prisma.orders.update({
            where: { id },
            data: dataToUpdate,
        });

        if (updated) {
            return response.success(res, 'Successfully updated status', null);
        } else {
            return response.error(res, 'Order not found or status not updated');
        }
    } catch (error: any) {
        console.error('Update order failed:', error);
        return response.error(res, error.message || 'Something went wrong');
    }
};




export const getAllOrderList = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status } = req.body;

        if (status === "" || status === undefined || status === null) {
            return response.error(res, 'Status is required');
        }

        const statusEnumValue = getStatusName(status);
        const getOrder = await prisma.orders.findMany({
            where: {
                status: statusEnumValue
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
                    }
                },
                businessOrderData: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    }
                }
            }
        });
        return response.success(res, 'Get All order List', getOrder);

    } catch (error: any) {
        return response.error(res, error.message || 'Something went wrong');
    }
};





export const updateOrderStatusAndInsertEarnings = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id, status } = req.body;

    if (typeof id !== 'string' || typeof status !== 'number') {
      return response.error(res, 'Both id (string) and status (number) are required');
    }

    const statusEnum = getStatusName(status);

    // 1. Update Order Status
    const order = await prisma.orders.update({
      where: { id },
      data: { status: statusEnum },
      include: {
        groupOrderData: {
          include: {
            groupData: true, // Include group details
            groupUsersList: true, // Include group members
          }
        },
        influencerOrderData: true,
        businessOrderData: true,
      },
    });

    if (!order) {
      return response.error(res, 'Order not found');
    }

    // 2. On COMPLETED, insert earnings
    if (statusEnum === OfferStatus.COMPLETED) {
      const amount = order.finalAmount ?? order.totalAmount;
      if (!amount) {
        return response.error(res, 'Order amount is missing, cannot generate earnings');
      }

      const earningsData: any[] = [];

      // a. Business earnings (unchanged)
      const baseEarning = {
        orederId: order.id,
        groupId: order.groupId ?? null,
        businessId: order.businessId,
        amount: amount,
        paymentStatus: PaymentStatus.PENDING,
      };

      earningsData.push({
        ...baseEarning,
        userId: order.businessId,
        earningAmount: amount,
      });

      // b. Handle Individual Influencer vs Group Orders
      if (order.groupId) {
        // GROUP ORDER - Apply 20:80 ratio distribution
        
        // Get main admin ID (you'll need to implement this logic)
        const MAIN_ADMIN_ID = await getMainAdminId(); // Replace with actual logic to get main admin ID
        
        // Get group details and admin from the group data
        const groupData = order.groupOrderData?.groupData;
        let groupAdminId = null;
        
        // Assuming group has an adminId or createdBy field for group admin
        if (groupData) {
          groupAdminId = groupData.adminId || groupData.createdBy || groupData.userId; // Adjust based on your Group model
        }
        
        // Get all accepted group members (influencers) - use included data or fetch separately
        let groupUsersList = order.groupOrderData?.groupUsersList || [];
        
        // If not included, fetch separately
        if (!groupUsersList || groupUsersList.length === 0) {
          groupUsersList = await prisma.groupUsersList.findMany({
            where: {
              groupId: order.groupId,
              requestAccept: RequestStatus.ACCEPTED,
            },
          });
        }

        // Calculate earnings distribution
        const totalAmount = Number(amount);
        const mainAdminShare = totalAmount * 0.20; // 20% to main admin
        const groupShare = totalAmount * 0.80; // 80% to be shared among group members
        
        // Count total recipients for group share (group admin + influencers)
        const groupMembersCount = groupUsersList.length + (groupAdminId ? 1 : 0);
        const perMemberShare = groupMembersCount > 0 ? groupShare / groupMembersCount : 0;

        // 1. Main Admin Earnings (20%)
        earningsData.push({
          ...baseEarning,
          userId: MAIN_ADMIN_ID,
          earningAmount: mainAdminShare,
        });

        // 2. Group Admin Earnings (part of 80% split)
        if (groupAdminId) {
          earningsData.push({
            ...baseEarning,
            userId: groupAdminId,
            earningAmount: perMemberShare,
          });
        }

        // 3. Group Members (Influencers) Earnings (part of 80% split)
        for (const member of groupUsersList) {
          earningsData.push({
            ...baseEarning,
            userId: member.invitedUserId,
            earningAmount: perMemberShare,
          });
        }

      } else if (order.influencerId) {
        // INDIVIDUAL INFLUENCER ORDER - Apply 20:80 ratio
        const MAIN_ADMIN_ID = await getMainAdminId(); // Replace with actual logic
        
        const totalAmount = Number(amount);
        const mainAdminShare = totalAmount * 0.20; // 20% to main admin
        const influencerShare = totalAmount * 0.80; // 80% to influencer

        // Main Admin Earnings (20%)
        earningsData.push({
          ...baseEarning,
          userId: MAIN_ADMIN_ID,
          earningAmount: mainAdminShare,
        });

        // Influencer Earnings (80%)
        earningsData.push({
          ...baseEarning,
          userId: order.influencerId,
          earningAmount: influencerShare,
        });
      }

      // 3. Insert earnings
      if (earningsData.length > 0) {
        await prisma.earnings.createMany({
          data: earningsData,
          skipDuplicates: true
        });
      }
    }

    return response.success(res, 'Order status updated and earnings inserted (if applicable)', null);

  } catch (error: any) {
    console.error('Earnings generation failed:', error);
    return response.error(res, error.message || 'Something went wrong');
  }
};

// Helper function to get main admin ID (you'll need to implement this based on your system)
const getMainAdminId = async (): Promise<string> => {
  // Option 1: From a settings/config table
  const adminConfig = await prisma.adminSettings.findFirst({
    where: { type: 'MAIN_ADMIN' }
  });
  
  // Option 2: From user table with a specific role
  const mainAdmin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' }
  });
  
  // Option 3: Hardcoded (not recommended for production)
  return adminConfig?.value || mainAdmin?.id || 'default-admin-id';
};

// export const updateOrderStatusAndInsertEarnings = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { id, status } = req.body;

//         if (typeof id !== 'string' || typeof status !== 'number') {
//             return response.error(res, 'Both id (string) and status (number) are required');
//         }

//         const statusEnum = getStatusName(status);

//         // 1. Update Order Status
//         const order = await prisma.orders.update({
//             where: { id },
//             data: { status: statusEnum },
//             include: {
//                 groupOrderData: true,
//                 influencerOrderData: true,
//                 businessOrderData: true,
//             },
//         });

//         if (!order) {
//             return response.error(res, 'Order not found');
//         }

//         // 2. On COMPLETED, insert earnings
//         if (statusEnum === OfferStatus.COMPLETED) {
//             const amount = order.finalAmount ?? order.totalAmount;

//             if (!amount) {
//                 return response.error(res, 'Order amount is missing, cannot generate earnings');
//             }

//             const earningsData: any[] = [];

//             const baseEarning = {
//                 orederId: order.id,
//                 groupId: order.groupId ?? null,
//                 businessId: order.businessId,
//                 amount: amount,
//                 earningAmount: amount, // Add commission logic if needed
//                 paymentStatus: PaymentStatus.PENDING,
//             };

//             // a. Business earnings
//             earningsData.push({
//                 ...baseEarning,
//                 userId: order.businessId,
//             });

//             // b. Influencer earnings
//             if (order.influencerId) {
//                 earningsData.push({
//                     ...baseEarning,
//                     userId: order.influencerId,
//                 });
//             }

//             // c. Group invited users (ACCEPTED only)
//             if (order.groupId) {
//                 const groupUsersList = await prisma.groupUsersList.findMany({
//                     where: {
//                         groupId: order.groupId,
//                         requestAccept: RequestStatus.ACCEPTED,
//                     },
//                 });

//                 for (const invited of groupUsersList) {
//                     earningsData.push({
//                         ...baseEarning,
//                         userId: invited.invitedUserId,
//                     });
//                 }
//             }

//             // 3. Insert earnings
//             if (earningsData.length > 0) {
//                 await prisma.earnings.createMany({ data: earningsData, skipDuplicates: true });
//             }
//         }

//         return response.success(res, 'Order status updated and earnings inserted (if applicable)', null);
//     } catch (error: any) {
//         console.error('Earnings generation failed:', error);
//         return response.error(res, error.message || 'Something went wrong');
//     }
// };