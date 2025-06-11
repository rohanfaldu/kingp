import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import response from '../utils/response';
import { getStatusName } from '../utils/commonFunction'
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { IOrder, EditIOrder } from './../interfaces/order.interface';
// import { PaymentStatus, OfferStatus } from '../enums/userType.enum';
import { addDays } from 'date-fns';
import { OfferStatus, PaymentStatus, RequestStatus, Role } from '@prisma/client';
import { formatEarningToTransaction, formatWithdrawToTransaction, TransactionHistoryItem } from './../interfaces/responseInterface/history.interface';
import { formatBirthDate } from '../controllers/auth.controller'
import { UserType } from '../enums/userType.enum';



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

        if (!order) {
            return response.error(res, 'Order not found');
        }
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
        // console.log(finalResponse, '>>>>finalResponse')

        return response.success(res, 'Order fetched with group data', finalResponse);
    } catch (error: any) {
        console.error('getByIdOrder error:', error);
        return response.error(res, error.message);
    }
};





export const updateOrderStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const orderData: EditIOrder = req.body;

        if (typeof orderData.id !== 'string' || typeof orderData.status !== 'number') {
            return response.error(res, 'Both id (string) and status (number) are required');
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

    
        // Handle COMPLETED status - update totalDeals, averageValue, onTimeDelivery, and repeatClient
        if (statusEnumValue === OfferStatus.COMPLETED) {
            const currentOrder = await prisma.orders.findUnique({
                where: { id },
                select: {
                    influencerId: true,
                    groupId: true,
                    completionDate: true,
                    businessId: true
                }
            });

            if (!currentOrder) return response.error(res, 'Order not found');

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
                        repeatClient: true
                    },
                });

                // Check if delivery is on time (completionDate should be within the order completion timeline)
                const isOnTime = currentOrder.completionDate ?
                    new Date(currentOrder.completionDate) >= new Date() : true;

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
                                        in: await prisma.groupUsersList.findMany({
                                            where: { 
                                                invitedUserId: userId, 
                                                requestAccept: 'ACCEPTED' 
                                            },
                                            select: { groupId: true }
                                        }).then(results => results.map(r => r.groupId).filter(Boolean))
                                    }
                                },
                                {
                                    groupId: {
                                        in: await prisma.groupUsers.findMany({
                                            where: { userId },
                                            select: { groupId: true }
                                        }).then(results => results.map(r => r.groupId))
                                    }
                                }
                            ]
                        }
                    });

                    // This is a new repeat business if there's exactly 1 previous order (making this the 2nd order)
                    isNewRepeatBusiness = previousOrdersCount === 1;
                }

                if (existingUserStats) {
                    // Update existing UserStats record
                    const currentDeals = existingUserStats.totalDeals ?? 0;
                    const currentOnTime = existingUserStats.onTimeDelivery ?? 0;
                    const totalEarnings = existingUserStats.totalEarnings ?? 0;
                    const currentRepeatClient = existingUserStats.repeatClient ?? 0;

                    console.log(currentDeals, '>>>>>>>>>>>> currentDeals');
                    console.log(totalEarnings, '>>>>>>>>>>>> totalEarnings');
                    console.log(isNewRepeatBusiness, '>>>>>>>>>>>> isNewRepeatBusiness');

                    // Calculate average value after incrementing totalDeals
                    const newTotalDeals = currentDeals;
                    const averageValue = newTotalDeals > 0
                        ? Math.floor(totalEarnings / newTotalDeals)
                        : 0;

                    await prisma.userStats.update({
                        where: { id: existingUserStats.id },
                        data: {
                            totalDeals: newTotalDeals + 1,
                            onTimeDelivery: isOnTime ? currentOnTime + 1 : currentOnTime,
                            repeatClient: isNewRepeatBusiness ? currentRepeatClient + 1 : currentRepeatClient,
                            averageValue,
                        },
                    });
                } else {
                    // Create new UserStats record if it doesn't exist
                    await prisma.userStats.create({
                        data: {
                            userId,
                            totalDeals: 1,
                            onTimeDelivery: isOnTime ? 1 : 0,
                            repeatClient: 0, // First order with any business, so no repeat clients yet
                            averageValue: 0, // No earnings yet, so average is 0
                        },
                    });
                }
            }
        }

        if (status === 5 && statusEnumValue === OfferStatus.COMPLETED) {
            const currentOrder = await prisma.orders.findUnique({ where: { id }, select: { status: true } });
            if (!currentOrder) return response.error(res, 'Order not found');
            if (currentOrder.status === OfferStatus.COMPLETED) {
                const existingEarnings = await prisma.earnings.findFirst({ where: { orederId: id } });
                if (existingEarnings) {
                    return response.error(res, 'Order is already completed and earnings have been distributed');
                } else {
                    return response.error(res, 'Order is already completed');
                }
            }
            if (currentOrder.status !== OfferStatus.ORDERSUBMITTED) {
                return response.error(res, 'Order must be in ORDERSUBMITTED status before it can be marked as COMPLETED');
            }
        }

        const updated = await prisma.orders.update({
            where: { id },
            data: { ...safeUpdateFields, status: statusEnumValue },
        });

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
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            const { password: _, socialMediaPlatform: __, ...userData } = user;
            return {
                ...userData,
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

            const groupUsers = await prisma.groupUsers.findMany({ where: { groupId: group.id } });

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

        // Earnings logic if COMPLETED
        if (status === 5 && statusEnumValue === OfferStatus.COMPLETED) {
            const amount = updated.finalAmount ?? updated.totalAmount;
            if (!amount) return response.error(res, 'Order amount is missing');

            const baseEarning = {
                orederId: updated.id,
                groupId: updated.groupId ?? null,
                businessId: updated.businessId,
                paymentStatus: PaymentStatus.COMPLETED,
            };

            const earningsData: any[] = [];

            // Admin earns 20%
            const adminUser = await prisma.user.findFirst({ where: { type: 'ADMIN' }, select: { id: true } });
            if (!adminUser) return response.error(res, 'Admin user not found');

            const adminAmount = amount * 0.2;
            earningsData.push({
                ...baseEarning,
                userId: adminUser.id,
                amount,
                earningAmount: adminAmount,
            });

            // Remaining 80% split among eligible users
            const eligibleUserIds: string[] = [];

            if (updated.influencerId) eligibleUserIds.push(updated.influencerId);

            if (updated.groupId) {
                const acceptedUsers = await prisma.groupUsersList.findMany({
                    where: { groupId: updated.groupId, requestAccept: 'ACCEPTED' },
                    select: { invitedUserId: true },
                });
                acceptedUsers.forEach(({ invitedUserId }) => eligibleUserIds.push(invitedUserId));

                const groupAdmins = await prisma.groupUsers.findMany({
                    where: { groupId: updated.groupId },
                    select: { userId: true },
                });
                groupAdmins.forEach(({ userId }) => eligibleUserIds.push(userId));
            }

            if (eligibleUserIds.length > 0) {
                const sharedAmount = (amount * 0.8) / eligibleUserIds.length;
                for (const userId of eligibleUserIds) {
                    earningsData.push({
                        ...baseEarning,
                        userId,
                        amount,
                        earningAmount: sharedAmount,
                    });
                }
            }

            await prisma.earnings.createMany({ data: earningsData, skipDuplicates: true });

            // Update each user's totalEarnings in UserStats table
            for (const entry of earningsData) {

                // Find existing UserStats record for the user
                const existingUserStats = await prisma.userStats.findFirst({
                    where: { userId: entry.userId },
                    select: { id: true, totalEarnings: true, totalDeals: true },
                });
                console.log(existingUserStats, ">>>> existingUserStats");

                if (existingUserStats) {
                    // Update existing UserStats record
                    const currentTotal = existingUserStats.totalEarnings ?? 0;
                    const currentTotalDeals = existingUserStats.totalDeals ?? 0;
                    console.log(currentTotal, ">>>> currentTotal");
                    console.log(currentTotalDeals, ">>>> currentTotalDeals");

                    const updatedTotal = Number(currentTotal) + Number(entry.earningAmount);
                    console.log(updatedTotal.toFixed(2), ">>>> updatedTotal");

                    const avarageAmount = (updatedTotal / currentTotalDeals);
                    console.log(avarageAmount.toFixed(2), ">>>> avarageValue");
                    //const updatedTotal = currentTotal + Number(entry.earningAmount ?? 0);

                    await prisma.userStats.update({
                        where: { id: existingUserStats.id },
                        data: {
                            totalEarnings: updatedTotal,
                            averageValue: avarageAmount
                        },
                    });
                } else {
                    // Create new UserStats record if it doesn't exist
                    await prisma.userStats.create({
                        data: {
                            userId: entry.userId,
                            totalEarnings: Number(entry.earningAmount ?? 0),
                        },
                    });
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
                    const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
                    const { password: _, ...userData } = user;
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

            return response.success(res, 'Order status updated and earnings distributed successfully', {
                ...order,
                groupOrderData: formattedGroup,
                earnings: detailedEarnings.filter(Boolean),
            });
        }



        // Non-completed order return
        return response.success(res, 'Order status updated successfully', {
            ...order,
            groupOrderData: formattedGroup,
        });

    } catch (error: any) {
        console.error('Update order status failed:', error);
        return response.error(res, error.message || 'Something went wrong');
    }
};







export const getAllOrderList = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status } = req.body;

        const currentUserId = req.user?.userId;

        if (status === "" || status === undefined || status === null) {
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

        console.log(whereStatus, " >>>>>>> whereStatus");
        const existingUser = await prisma.user.findUnique({ where: { id: currentUserId } });
        //  console.log(existingUser, ">>>>>>>>>>> existingUser");
        let whereCondition;
        if (existingUser.type === UserType.INFLUENCER) {
            whereCondition = {
                influencerId: currentUserId
            };
        } else {
            whereCondition = {
                businessId: currentUserId
            };
        }

        // Option 1: Simple approach - exclude only userId (your original approach)
        const getOrder = await prisma.orders.findMany({
            where: {
                status: {
                    in: whereStatus
                },
                ...whereCondition
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
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        console.log(getOrder, " >>>>>>>> getOrder")
        // Option 2: Filter out orders where current user appears in related data
        // const filteredOrders = getOrder.filter(order => {
        //     // Check if current user is the influencer in the order
        //     const isInfluencer = order.influencerOrderData?.id === currentUserId;

        //     // Check if current user is the business in the order
        //     const isBusiness = order.businessOrderData?.id === currentUserId;

        //     // Check if current user is part of group order (if applicable)
        //     // Add your group logic here if needed

        //     // Return false to exclude, true to include
        //     return !isInfluencer && !isBusiness;
        // });

        return response.success(res, 'Get All order List', getOrder);

    } catch (error: any) {
        return response.error(res, error.message || 'Something went wrong');
    }
};

// Alternative approach - if you know the exact field names
export const getAllOrderListAlternative = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status } = req.body;
        const currentUserId = req.user?.id || req.userId;

        if (status === "" || status === undefined || status === null) {
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
                        { businessOrderData: { id: currentUserId } }
                    ]
                }
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
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return response.success(res, 'Get All order List', getOrder);

    } catch (error: any) {
        return response.error(res, error.message || 'Something went wrong');
    }
};




export const orderSubmit = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id, submittedDescription, socialMediaLink, attachment, } = req.body;
        if (!id || typeof id !== 'string') {
            return response.error(res, 'Order ID is required and must be a string');
        }

        // Update order with submission details and change status to ORDERSUBMITTED
        await prisma.orders.update({
            where: { id },
            data: {
                submittedDescription,
                socialMediaLink,
                attachment,
                status: OfferStatus.ORDERSUBMITTED,
            },
        });

        // Now reuse getByIdOrder response format
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

        if (!order.groupOrderData) {
            return response.success(res, 'Order submitted successfully', order);
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
        return response.error(res, error.message || 'Something went wrong');
    }
}






export const withdrawAmount = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, withdrawAmount, withdrawalType } = req.body;

        if (!userId || typeof withdrawAmount !== 'number') {
            return response.error(res, 'userId and withdrawAmount are required');
        }

        // Find UserStats by userId (not by id)
        const user = await prisma.userStats.findFirst({ where: { userId } });
        if (!user) return response.error(res, 'User stats not found');

        const currentEarnings = user.totalEarnings ?? 0;
        const currentWithdrawals = user.totalWithdraw ?? 0;

        // Convert decimals to numbers safely
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

        // Create withdrawal record
        const newWithdraw = await prisma.withdraw.create({
            data: {
                userId,
                withdrawAmount,
                withdrawalType,
                transactionType: 'DEBIT',
            },
        });

        // Update user's withdrawals
        await prisma.userStats.update({
            where: { id: user.id },
            data: {
                totalWithdraw: new Prisma.Decimal(withdrawalsNumber).plus(withdrawAmount),
                totalEarnings: new Prisma.Decimal(earningsNumber).minus(withdrawAmount),
            },
        });

        return response.success(res, 'Withdrawal successful', {
            withdraw: newWithdraw,
            updatedBalance: earningsNumber - withdrawAmount,
        });

    } catch (error: any) {
        console.error('Withdraw API error:', error);
        return response.error(res, error.message || 'Something went wrong');
    }
};






export const getTransactionHistory = async (req: Request, res: Response): Promise<any> => {
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
                return response.error(res, 'Invalid startDate format. Expected DD/MM/YYYY');
            }
        }

        if (endDate) {
            const parsedEndDate = formatBirthDate(endDate);
            if (parsedEndDate) {
                parsedEndDate.setHours(23, 59, 59, 999);
                dateFilter.lte = parsedEndDate;
            } else {
                return response.error(res, 'Invalid endDate format. Expected DD/MM/YYYY');
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
                ? earnings.filter((e) =>
                    e.orderData?.businessOrderData?.id === businessId ||
                    e.businessPaymentData?.id === businessId
                )
                : earnings;

            formattedEarnings = filteredEarnings.map(formatEarningToTransaction);
            totalEarnings = formattedEarnings.reduce((sum, t) => sum + Number(t.amount), 0);
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
            totalWithdraw = formattedWithdrawals.reduce((sum, t) => sum + Number(t.amount), 0);
        }

        const transactionData = [...formattedEarnings, ...formattedWithdrawals].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        const responseData = {
            totalEarnings,
            totalWithdraw,
            netEarnings: totalEarnings - totalWithdraw,
            transactionData,
        };

        return response.success(res, 'Transaction history fetched successfully', responseData);
    } catch (error: any) {
        console.error('Error fetching transaction history:', error);
        return response.error(res, error.message || 'Something went wrong');
    }
};















export const updateOrderStatusAndInsertEarnings = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id, status } = req.body;

        if (typeof id !== 'string' || typeof status !== 'number') {
            return response.error(res, 'Both id string and status number are required');
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
                return response.error(res, 'Order amount is missing, cannot generate earnings');
            }

            const earningsData: any[] = [];

            const baseEarning = {
                orederId: order.id,
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

                acceptedInvited.forEach(user => eligibleUserIds.push(user.invitedUserId));

                // c. Add group admin(s) from groupUsers table
                const groupAdmins = await prisma.groupUsers.findMany({
                    where: {
                        groupId: order.groupId,
                    },
                    select: {
                        userId: true,
                    },
                });

                groupAdmins.forEach(admin => eligibleUserIds.push(admin.userId));
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
                await prisma.earnings.createMany({ data: earningsData, skipDuplicates: true });

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
                        const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);


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