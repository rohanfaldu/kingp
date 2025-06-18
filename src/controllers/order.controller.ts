import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import response from '../utils/response';
import { getStatusName } from '../utils/commonFunction'
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { IOrder, EditIOrder } from './../interfaces/order.interface';
import { addDays } from 'date-fns';
import { OfferStatus, PaymentStatus, RequestStatus, Role } from '@prisma/client';
import { formatEarningToTransaction, formatWithdrawToTransaction, TransactionHistoryItem } from './../interfaces/responseInterface/history.interface';
import { formatBirthDate } from '../controllers/auth.controller'
import { UserType } from '../enums/userType.enum';
import { sendFCMNotificationToUsers } from '../utils/notification';
import { CoinType } from '@prisma/client';
import { paginate } from '../utils/pagination';



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
                socialMediaPlatforms: user.socialMediaPlatforms?.map(({ viewCount, ...rest }) => rest),
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

        // Send Notification to Business (from Influencer)
        const businessUser = await prisma.user.findUnique({
            where: { id: newOrder.businessId },
        });

        if (businessUser?.fcmToken) {
            const recipientId = businessUser.id;
            const fcmToken = businessUser.fcmToken;

            const influencerName = newOrder.influencerOrderData?.name || 'an influencer';

            await sendFCMNotificationToUsers(
                [{ id: recipientId, fcmToken }],
                'New Offer Received',
                `You have received a new Offer from ${influencerName}`,
                'ORDER_CREATED'
            );
        }


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

        // ✅ Remove viewCount from influencerOrderData
        if (order.influencerOrderData?.socialMediaPlatforms) {
            order.influencerOrderData.socialMediaPlatforms = order.influencerOrderData.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest);
        }

        // ✅ Remove viewCount from businessOrderData
        if (order.businessOrderData?.socialMediaPlatforms) {
            order.businessOrderData.socialMediaPlatforms = order.businessOrderData.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest);
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
                socialMediaPlatforms: userData.socialMediaPlatforms?.map(({ viewCount, ...rest }) => rest) ?? [],
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
                totalAmount: true
            }
        });

        if (!currentOrder) return response.error(res, 'Order not found');

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

                // console.log(existingUserStats, '>>>>>> existingUserStats');

                if (existingUserStats) {
                    // Update existing UserStats record
                    const currentDeals = existingUserStats.totalDeals ?? 0;
                    const currentOnTime = existingUserStats.onTimeDelivery ?? 0;
                    const totalEarnings = existingUserStats.totalEarnings ?? 0;
                    const currentRepeatClient = existingUserStats.repeatClient ?? 0;

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

        // ✅ FCM NOTIFICATION LOGIC WITH DATABASE STORAGE
        try {
            // Send notifications to influencers for status changes: ACCEPTED (1), CANCELED (2), COMPLETED (5)
            if ([1, 2, 5].includes(status)) {
                const influencerUsers: any[] = [];

                // Get individual influencer
                if (currentOrder.influencerId) {
                    const influencer = await prisma.user.findUnique({
                        where: { id: currentOrder.influencerId },
                        select: { id: true, fcmToken: true, name: true }
                    });
                    if (influencer) {
                        influencerUsers.push(influencer);
                    }
                }

                // Get group influencers
                if (currentOrder.groupId) {
                    // Get accepted users from group
                    const acceptedUsers = await prisma.groupUsersList.findMany({
                        where: {
                            groupId: currentOrder.groupId,
                            requestAccept: 'ACCEPTED'
                        },
                        include: {
                            invitedUser: {
                                select: { id: true, fcmToken: true, name: true }
                            }
                        }
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
                            user: {
                                select: { id: true, fcmToken: true, name: true }
                            }
                        }
                    });

                    groupAdmins.forEach(({ user }) => {
                        if (user) {
                            influencerUsers.push(user);
                        }
                    });
                }

                // Send notification to influencers
                if (influencerUsers.length > 0) {
                    let notificationTitle = '';
                    let notificationBody = '';
                    let notificationType = '';

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
                            const amount = currentOrder.finalAmount ?? currentOrder.totalAmount;
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
                                    notificationType
                                );
                            }
                        } catch (error: any) {
                            console.error(`Failed to send notification to user ${user.id}:`, error);
                            // Update notification status to ERROR in database
                            await prisma.notification.create({
                                data: {
                                    userId: user.id,
                                    title: notificationTitle,
                                    message: notificationBody,
                                    type: notificationType,
                                    status: 'ERROR',
                                    error: error.message || 'FCM notification failed'
                                }
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
                        // socialMediaPlatforms: true,
                        socialMediaPlatforms: {
                            select: {
                                id: true,
                                image: true,
                                userId: true,
                                platform: true,
                                userName: true,
                                followerCount: true,
                                engagementRate: true,
                                averageLikes: true,
                                averageComments: true,
                                averageShares: true,
                                price: true,
                                status: true,
                                createsAt: true,
                                updatedAt: true,
                            }
                        },
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                },
                businessOrderData: {
                    include: {
                        // socialMediaPlatforms: true,
                        socialMediaPlatforms: {
                            select: {
                                id: true,
                                image: true,
                                userId: true,
                                platform: true,
                                userName: true,
                                followerCount: true,
                                engagementRate: true,
                                averageLikes: true,
                                averageComments: true,
                                averageShares: true,
                                price: true,
                                status: true,
                                createsAt: true,
                                updatedAt: true,
                            }
                        },
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
                socialMediaPlatforms: userData.socialMediaPlatforms?.map(({ viewCount, ...rest }) => rest) ?? [],
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
                // console.log(existingUserStats, ">>>> existingUserStats");

                if (existingUserStats) {
                    // Update existing UserStats record
                    const currentTotal = existingUserStats.totalEarnings ?? 0;
                    const currentTotalDeals = existingUserStats.totalDeals ?? 0;

                    const updatedTotal = Number(currentTotal) + Number(entry.earningAmount);

                    const avarageAmount = (updatedTotal / currentTotalDeals);
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
            console.log(updated, "updated");

            // Update business totalExpenses
            if (updated.businessId) {
                // const businessUserStats = await prisma.userStats.findFirst({
                //     where: { userId: updated.businessId },
                //     select: { id: true, totalExpenses: true, totalDeals: true, averageValue: true },
                // });

                // if (businessUserStats) {
                //     // Update existing business UserStats record
                //     const currentExpenses = businessUserStats.totalExpenses ?? 0;
                //     const updatedExpenses = Number(currentExpenses) + Number(amount);
                //     const updatedTotalDeals = Number(businessUserStats.totalDeals) + Number(1);
                //     const updatedAverageValue = updatedExpenses / updatedTotalDeals;

                //     await prisma.userStats.update({
                //         where: { id: businessUserStats.id },
                //         data: {
                //             totalExpenses: updatedExpenses,
                //             totalDeals: updatedTotalDeals,
                //             averageValue: updatedAverageValue,
                //         },
                //     });
                // } else {
                //     await prisma.userStats.create({
                //         data: {
                //             userId: updated.businessId,
                //             totalExpenses: Number(amount),
                //             totalDeals: 1
                //         },
                //     });
                // }

                // 🎁 Reward business user with KringP Coins for spending
                const kringPCoins = Math.floor(Number(amount) / 100);
                if (kringPCoins > 0) {
                    const coinSource = `Spending reward for ₹${amount}`;

                    // Create coin transaction
                    await prisma.coinTransaction.create({
                        data: {
                            userId: updated.businessId,
                            amount: kringPCoins,
                            type: 'ONGOING',
                            status: 'UNLOCKED',
                            source: coinSource,
                        },
                    });

                    // Update or create ReferralCoinSummary for business user
                    const existingSummary = await prisma.referralCoinSummary.findUnique({
                        where: { userId: updated.businessId },
                    });

                    if (existingSummary) {
                        await prisma.referralCoinSummary.update({
                            where: { userId: updated.businessId },
                            data: {
                                totalAmount: (existingSummary.totalAmount ?? 0) + kringPCoins,
                                NetAmount: new Prisma.Decimal(existingSummary.NetAmount ?? 0).plus(kringPCoins),
                                unlocked: true,
                                unlockedAt: new Date(),
                            },
                        });
                    } else {
                        await prisma.referralCoinSummary.create({
                            data: {
                                userId: updated.businessId,
                                totalAmount: kringPCoins,
                                NetAmount: kringPCoins,
                                unlocked: true,
                                unlockedAt: new Date(),
                            },
                        });
                    }
                }

            }

            // PERFECT REFERRAL REWARD LOGIC
            if (status === 5 && statusEnumValue === OfferStatus.COMPLETED) {
                const userRoles = [
                    { key: 'businessId', id: updated.businessId },
                    { key: 'influencerId', id: updated.influencerId }
                ];

                for (const { key, id: referredUserId } of userRoles) {
                    if (!referredUserId) continue;

                    // Count all COMPLETED orders for that user role
                    const completedOrderCount = await prisma.orders.count({
                        where: {
                            status: 'COMPLETED',
                            [key]: referredUserId
                        }
                    });

                    // Only proceed if this is the FIRST completed order
                    if (completedOrderCount === 1) {
                        const referral = await prisma.referral.findFirst({
                            where: {
                                referredUserId: referredUserId,
                                coinIssued: false
                            }
                        });

                        if (referral && referral.referrerId) {
                            //  Reward 50 UNLOCKED coins to referrer
                            await prisma.coinTransaction.create({
                                data: {
                                    userId: referral.referrerId,
                                    type: CoinType.FIRST_DEAL_REFFERAL,
                                    amount: 50,
                                    status: 'UNLOCKED',
                                    source: `Referral reward for ${key} ${referredUserId}`
                                }
                            });

                            // Update or create ReferralCoinSummary for referrer, set unlocked true + unlockedAt
                            const now = new Date();

                            const summary = await prisma.referralCoinSummary.findUnique({
                                where: { userId: referral.referrerId }
                            });

                            if (summary) {
                                await prisma.referralCoinSummary.update({
                                    where: { userId: referral.referrerId },
                                    data: {
                                        totalAmount: (summary.totalAmount ?? 0) + 50,
                                        unlocked: true,
                                        unlockedAt: now
                                    }
                                });
                            } else {
                                await prisma.referralCoinSummary.create({
                                    data: {
                                        userId: referral.referrerId,
                                        totalAmount: 50,
                                        unlocked: true,
                                        unlockedAt: now
                                    }
                                });
                            }

                            // Mark referral as rewarded
                            await prisma.referral.update({
                                where: { id: referral.id },
                                data: { coinIssued: true }
                            });
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
                    const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
                    const { password: _, ...userData } = user;
                    return {
                        user: {
                            ...userData,
                            socialMediaPlatforms: userData.socialMediaPlatforms?.map(({ viewCount, ...rest }) => rest) ?? [],
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

        // console.log(whereStatus, " >>>>>>> whereStatus");
        const existingUser = await prisma.user.findUnique({ where: { id: currentUserId } });
        //  console.log(existingUser, ">>>>>>>>>>> existingUser");
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
                // groupOrderData: {},
                groupOrderData: {
                    include: {
                        groupUsersList: true // Include related data if needed
                    }
                },
                influencerOrderData: {
                    include: {
                        // socialMediaPlatforms: true,
                        socialMediaPlatforms: {
                            select: {
                                id: true,
                                image: true,
                                userId: true,
                                platform: true,
                                userName: true,
                                followerCount: true,
                                engagementRate: true,
                                averageLikes: true,
                                averageComments: true,
                                averageShares: true,
                                price: true,
                                status: true,
                                createsAt: true,
                                updatedAt: true,
                            }
                        },
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    }
                },
                businessOrderData: {
                    include: {
                        socialMediaPlatforms: {
                            select: {
                                id: true,
                                image: true,
                                userId: true,
                                platform: true,
                                userName: true,
                                followerCount: true,
                                engagementRate: true,
                                averageLikes: true,
                                averageComments: true,
                                averageShares: true,
                                price: true,
                                status: true,
                                createsAt: true,
                                updatedAt: true,
                            }
                        }, brandData: true,
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
        // console.log(getOrder, " >>>>>>>> getOrder")


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
                        // socialMediaPlatforms: true,
                        socialMediaPlatforms: {
                            select: {
                                id: true,
                                image: true,
                                userId: true,
                                platform: true,
                                userName: true,
                                followerCount: true,
                                engagementRate: true,
                                averageLikes: true,
                                averageComments: true,
                                averageShares: true,
                                price: true,
                                status: true,
                                createsAt: true,
                                updatedAt: true,
                            }
                        },
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    }
                },
                businessOrderData: {
                    include: {
                        // socialMediaPlatforms: true,
                        socialMediaPlatforms: {
                            select: {
                                id: true,
                                image: true,
                                userId: true,
                                platform: true,
                                userName: true,
                                followerCount: true,
                                engagementRate: true,
                                averageLikes: true,
                                averageComments: true,
                                averageShares: true,
                                price: true,
                                status: true,
                                createsAt: true,
                                updatedAt: true,
                            }
                        },
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
        const {
            id,
            submittedDescription,
            socialMediaLink,
            submittedAttachment,
        } = req.body;

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
                        // socialMediaPlatforms: true,
                        socialMediaPlatforms: {
                            select: {
                                id: true,
                                image: true,
                                userId: true,
                                platform: true,
                                userName: true,
                                followerCount: true,
                                engagementRate: true,
                                averageLikes: true,
                                averageComments: true,
                                averageShares: true,
                                price: true,
                                status: true,
                                createsAt: true,
                                updatedAt: true,
                            }
                        },
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                },
                businessOrderData: {
                    include: {
                        socialMediaPlatforms: {
                            select: {
                                id: true,
                                image: true,
                                userId: true,
                                platform: true,
                                userName: true,
                                followerCount: true,
                                engagementRate: true,
                                averageLikes: true,
                                averageComments: true,
                                averageShares: true,
                                price: true,
                                status: true,
                                createsAt: true,
                                updatedAt: true,
                            }
                        }, brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                },
            },
        });

        if (!order) return response.error(res, 'Order not found after update');

        // ✅ Send notification to business user (if exists)
        if (order.businessId) {
            const businessUser = await prisma.user.findUnique({
                where: { id: order.businessId },
                select: { id: true, fcmToken: true, name: true },
            });
            // console.log(businessUser, '>>>>>>>>>>>>>> businessUser');

            const notifTitle = 'Order Submitted!';
            const notifMessage = 'Your order has been submitted and is ready for review.';
            const notifType = 'ORDER_SUBMITTED';
            try {
                // Send FCM if token exists
                if (businessUser?.fcmToken) {
                    await sendFCMNotificationToUsers(
                        [businessUser],
                        notifTitle,
                        notifMessage,
                        notifType
                    );
                }
            } catch (error: any) {
                console.error(`FCM Notification failed for business user ${order.businessId}:`, error);
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
        console.error('Order submit failed:', error);
        return response.error(res, error.message || 'Something went wrong');
    }
};



// export const withdrawAmount = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { userId, withdrawAmount, withdrawalType } = req.body;

//         if (!userId || typeof withdrawAmount !== 'number') {
//             return response.error(res, 'userId and withdrawAmount are required');
//         }

//         // Find UserStats by userId (not by id)
//         const user = await prisma.userStats.findFirst({ where: { userId } });
//         if (!user) return response.error(res, 'User stats not found');

//         const currentEarnings = user.totalEarnings ?? 0;
//         const currentWithdrawals = user.totalWithdraw ?? 0;

//         // Convert decimals to numbers safely
//         const earningsNumber =
//             currentEarnings instanceof Prisma.Decimal
//                 ? currentEarnings.toNumber()
//                 : currentEarnings;

//         const withdrawalsNumber =
//             currentWithdrawals instanceof Prisma.Decimal
//                 ? currentWithdrawals.toNumber()
//                 : currentWithdrawals;

//         if (withdrawAmount > earningsNumber) {
//             return response.error(res, 'Insufficient balance for withdrawal');
//         }

//         // Create withdrawal record
//         const newWithdraw = await prisma.withdraw.create({
//             data: {
//                 userId,
//                 withdrawAmount,
//                 withdrawalType,
//                 transactionType: 'DEBIT',
//             },
//         });

//         // Update user's withdrawals
//         await prisma.userStats.update({
//             where: { id: user.id },
//             data: {
//                 totalWithdraw: new Prisma.Decimal(withdrawalsNumber).plus(withdrawAmount),
//                 totalEarnings: new Prisma.Decimal(earningsNumber).minus(withdrawAmount),
//             },
//         });

//         return response.success(res, 'Withdrawal successful', {
//             withdraw: newWithdraw,
//             updatedBalance: earningsNumber - withdrawAmount,
//         });

//     } catch (error: any) {
//         console.error('Withdraw API error:', error);
//         return response.error(res, error.message || 'Something went wrong');
//     }
// };


export const withdrawAmount = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, withdrawAmount, withdrawalType } = req.body;

        if (!userId || typeof withdrawAmount !== 'number') {
            return response.error(res, 'userId and withdrawAmount are required');
        }

        // 1. Fetch user stats
        const user = await prisma.userStats.findFirst({ where: { userId } });
        if (!user) return response.error(res, 'User stats not found');

        const currentEarnings = user.totalEarnings ?? 0;
        const currentWithdrawals = user.totalWithdraw ?? 0;

        const earningsNumber = currentEarnings instanceof Prisma.Decimal
            ? currentEarnings.toNumber()
            : currentEarnings;

        const withdrawalsNumber = currentWithdrawals instanceof Prisma.Decimal
            ? currentWithdrawals.toNumber()
            : currentWithdrawals;

        if (withdrawAmount > earningsNumber) {
            return response.error(res, 'Insufficient balance for withdrawal');
        }

        // 2. Create withdrawal record
        const newWithdraw = await prisma.withdraw.create({
            data: {
                userId,
                withdrawAmount,
                withdrawalType,
                transactionType: 'DEBIT',
            },
        });

        // 3. Update UserStats
        await prisma.userStats.update({
            where: { id: user.id },
            data: {
                totalWithdraw: new Prisma.Decimal(withdrawalsNumber).plus(withdrawAmount),
                totalEarnings: new Prisma.Decimal(earningsNumber).minus(withdrawAmount),
            },
        });

        // 4. KringP Coins reward calculation
        const kringPCoins = Math.floor(withdrawAmount / 100);
        const sourceNote = `Withdrawal reward for ₹${withdrawAmount}`;

        if (kringPCoins > 0) {
            // 4.1 Add CoinTransaction entry
            await prisma.coinTransaction.create({
                data: {
                    userId,
                    amount: kringPCoins,
                    type: 'ONGOING',
                    status: 'UNLOCKED',
                    source: sourceNote,
                },
            });

            // 4.2 Update or Create ReferralCoinSummary
            const existingSummary = await prisma.referralCoinSummary.findUnique({
                where: { userId },
            });

            if (existingSummary) {
                await prisma.referralCoinSummary.update({
                    where: { userId },
                    data: {
                        totalAmount: (existingSummary.totalAmount ?? 0) + kringPCoins,
                        NetAmount: new Prisma.Decimal(existingSummary.NetAmount ?? 0).plus(kringPCoins),
                        unlocked: true,
                        unlockedAt: new Date(),
                    },
                });
            } else {
                await prisma.referralCoinSummary.create({
                    data: {
                        userId,
                        totalAmount: kringPCoins,
                        NetAmount: kringPCoins,
                        unlocked: true,
                        unlockedAt: new Date(),
                    },
                });
            }
        }

        return response.success(res, 'Withdrawal successful', {
            withdraw: newWithdraw,
            updatedBalance: earningsNumber - withdrawAmount,
            kringPCoinsIssued: kringPCoins,
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



export const withdrawCoins = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, withdrawAmount } = req.body;

        if (!userId || typeof withdrawAmount !== 'number') {
            return response.error(res, 'userId and withdrawAmount are required');
        }

        // Fetch current referral coin summary
        const summary = await prisma.referralCoinSummary.findUnique({
            where: { userId },
        });

        if (!summary) {
            return response.error(res, 'Referral coin summary not found');
        }

        if (!summary.unlocked) {
            return response.error(res, 'Coins are not unlocked yet for withdrawal');
        }

        const currentTotal = summary.totalAmount ?? 0;
        const currentWithdraw = summary.withdrawAmount ?? new Prisma.Decimal(0);

        // Calculate new withdraw and net amounts
        const updatedWithdraw = currentWithdraw.plus(withdrawAmount);
        if (updatedWithdraw.gt(currentTotal)) {
            return response.error(res, 'Withdrawal amount exceeds available coins');
        }

        const netAmount = new Prisma.Decimal(currentTotal).minus(updatedWithdraw);

        // Update ReferralCoinSummary
        const updatedSummary = await prisma.referralCoinSummary.update({
            where: { userId },
            data: {
                withdrawAmount: updatedWithdraw,
                netAmount: netAmount,
            },
        });

        // Return updated data in response
        return response.success(res, 'Referral coin withdrawal recorded successfully', updatedSummary);


    } catch (error: any) {
        console.error('Coin Withdrawal Error:', error);
        return response.error(res, error.message || 'Something went wrong during coin withdrawal');
    }
};



export const getUserCoinHistory = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }

        // Paginate coin transactions (only UNLOCKED)
        const paginated = await paginate(
            req,
            prisma.coinTransaction,
            {
                where: { userId, status: 'UNLOCKED' },
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

        // Total unlocked amount
        const totalUnlockedAmount = await prisma.coinTransaction.aggregate({
            where: { userId, status: 'UNLOCKED' },
            _sum: { amount: true },
        });

        // Referral summary (withdrawals)
        const referralSummary = await prisma.referralCoinSummary.findUnique({
            where: { userId },
            select: {
                withdrawAmount: true,
                updatedAt: true,
            },
        });

        const withdrawAmount = Number(referralSummary?.withdrawAmount || 0);
        const totalAmount = Number(totalUnlockedAmount._sum.amount || 0);
        const netAmount = totalAmount - withdrawAmount;

        // Format unlocked coin transactions
        const history = coinTransactions.map(tx => ({
            id: tx.id,
            date: tx.createdAt,
            type: tx.type,
            source: tx.source || null,
            amount: tx.amount,
            status: tx.status,
            isWithdrawal: false,
        }));

        // Append withdrawal if present
        if (withdrawAmount > 0) {
            history.push({
                id: 'withdrawal',
                date: referralSummary?.updatedAt,
                type: 'WITHDRAWAL',
                source: null,
                amount: withdrawAmount,
                status: 'PROCESSED',
                isWithdrawal: true,
            });
        }

        // Sort by date descending
        history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Send full response with pagination + amount details
        return response.success(res, 'Referral coin history fetched successfully.', {
            totalAmount,
            withdrawAmount,
            netAmount,
            data: history,
            meta: paginated.meta, // includes page, limit, totalCount etc.
        });

    } catch (error: any) {
        console.error('Get User Coin History Error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch user coin history',
        });
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