import { Badges } from './../../node_modules/.prisma/client/index.d';
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
import { paymentRefund, getBageData, initiateTransfer } from "../utils/commonFunction";


const prisma = new PrismaClient();


export const createOrder = async (req: Request, res: Response): Promise<any> => {
    try {
        const orderData: IOrder = req.body;
        const {
            groupId,
            businessId,
            influencerId,
            completionDate,
            ...restFields
        } = orderData;

        if (!businessId) {
            return res.status(400).json({ error: 'businessId is required' });
        }

        // if (groupId) {
        //     const groupUsersList = await prisma.groupUsersList.findMany({
        //         where: {
        //             groupId,
        //             status: true,
        //         },
        //         select: {
        //             invitedUserId: true,
        //             requestAccept: true,
        //             adminUserId: true,
        //         },
        //     });

        //     const notAcceptedUsers = groupUsersList.filter(
        //         (entry) => entry.requestAccept !== RequestStatus.ACCEPTED
        //     );

        //     if (notAcceptedUsers.length > 0) {
        //         return response.error(res, 'All invited users must accept the group invitation before proceeding.');
        //     }

        //     const adminUserId = groupUsersList.adminUserId;
        //     if (!adminUserId) {
        //         return response.error(res, 'Admin user not found for the group.');
        //     }

        //     const adminBankDetails = await prisma.userBankDetails.findFirst({
        //         where: {
        //             userId: adminUserId,
        //             status: true,
        //         },
        //     });

        //     if (!adminBankDetails) {
        //         return response.error(res, 'Admin must add bank details before proceeding.');
        //     }
        // }


        if (influencerId) {
            const influencer = await prisma.user.findUnique({
                where: { id: influencerId, status: true },
            });

            if (!influencer) {
                return response.error(res, 'Invalid influencer ID provided.');
            }
            // ✅ Check if bank details exist for this influencer
            const bankDetails = await prisma.userBankDetails.findFirst({
                where: {
                    userId: influencerId,
                    status: true,
                },
            });

            if (!bankDetails) {
                return response.error(res, 'Influencer must add bank details before Creating offers.');
            }
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

            // Determine if order is from group or influencer
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

        if (order?.influencerOrderData?.id) {
            const businessBageData = await getBageData(order?.influencerOrderData?.id);
            order.influencerOrderData.badges = businessBageData;
        }

        //  Remove viewCount from influencerOrderData
        if (order.influencerOrderData?.socialMediaPlatforms) {
            order.influencerOrderData.socialMediaPlatforms = order.influencerOrderData.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest);
        }

        //  Remove viewCount from businessOrderData
        if (order.businessOrderData?.socialMediaPlatforms) {
            order.businessOrderData.socialMediaPlatforms = order.businessOrderData.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest);
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
                badges: usersBadges.map(b => b.userBadgeTitleData),
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
                transactionId: true
            }
        });

        if (!currentOrder) return response.error(res, 'Order not found');

        if (status === 3 && statusEnumValue === OfferStatus.ACTIVATED) {
            await prisma.orders.update({
                where: { id },
                data: {
                    paymentStatus: PaymentStatus.COMPLETED
                }
            });
        }

        // // REFUND LOGIC FOR CANCELED ORDERS
        if (status === 6 && statusEnumValue === OfferStatus.DECLINED) {
            try {
                console.log(currentOrder, " >>>>> currentOrder");
                if (currentOrder.finalAmount) {
                    const refundAmountInPaise = currentOrder.finalAmount;
                    //const refundAmountInPaise = 1;
                    const razorpayPaymentId = currentOrder.transactionId;

                    const paymentRefundResponse = await paymentRefund(razorpayPaymentId, refundAmountInPaise);
                    if (paymentRefundResponse) {
                        await prisma.orders.update({
                            where: { id },
                            data: {
                                status: OfferStatus.DECLINED,
                                paymentStatus: PaymentStatus.REFUND
                            }
                        });


                        return response.success(res, 'Order and Payment Refund Successfully', null);
                    } else {
                        return response.error(res, `Payment was not Decline`);
                    }

                }

            } catch (refundError: any) {
                console.error('Refund processing failed:', refundError);
                return response.error(res, `Failed to process refund: ${refundError.message}`);
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
            // console.log(currentOrder, '>>>>>>>>>>>>>>>> currentOrder');

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
                // console.log(existingUserStats, '>>>>>>>>>>>>>> existingUserStats');
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
                // console.log(isNewRepeatBusiness, '>>>>>>>>>>>>>>>>>> isNewRepeatBusiness');

                // console.log(existingUserStats, '>>>>>> existingUserStats');
                let newTotalDeals = 1;
                console.log(existingUserStats, '>>>>>>>>>>> existingUserStats');
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
                const hasMinEarnings = (userStats?.totalEarnings?.toNumber?.() ?? 0) >= 100000;
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
                const onTimeCount = completedOnTimeOrders.filter(order =>
                    order.updatedAt <= order.completionDate
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

        // FCM NOTIFICATION LOGIC WITH DATABASE STORAGE
        try {
            if ([1, 2, 5].includes(status)) {
                const influencerUsers: any[] = [];

                if (currentOrder.influencerId) {
                    const influencer = await prisma.user.findUnique({
                        where: { id: currentOrder.influencerId },
                        select: { id: true, fcmToken: true, name: true }
                    });
                    if (influencer) {
                        influencerUsers.push(influencer);
                    }
                }

                if (currentOrder.groupId) {
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
                            groupUserData: {
                                select: { id: true, fcmToken: true, name: true }
                            }
                        }
                    });
                    // console.log(currentOrder.groupId, '>>>>>>>>>> current groupId');
                    // console.log(groupAdmins, '>>>>>>>>>>>>>>>> groupAdmins');

                    // groupAdmins.forEach(({ user }) => {
                    //     if (user) {
                    //         influencerUsers.push(user);
                    //     }
                    // });

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

                if (existingUserStats) {
                    // Update existing UserStats record
                    const currentTotal = existingUserStats.totalEarnings ?? 0;
                    const currentTotalDeals = existingUserStats.totalDeals ?? 0;

                    const updatedTotal = Number(currentTotal) + Number(entry.earningAmount);

                    const avarageAmount = (updatedTotal / currentTotalDeals);

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

            if (updated.businessId) {
                console.log(updated, " >>>>>>>>>>>>>>>> Order Business ID");







                // Add Business Expenss Start

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
                console.log(currentOrder, '>>>>>>>>>>>>>> Busines currentOrder');
                console.log(currentOrder.businessId, '>>>>>>>>>>>>>> Busines id');
                // Check if delivery is on time (completionDate should be within the order completion timeline)
                const isOnTime = currentOrder.completionDate ?
                    new Date(currentOrder.completionDate) >= new Date() : true;

                // Check for repeat client - check if this is the first time working with this business
                let isNewRepeatBusiness = false;
                if (currentOrder.businessId) {
                    const previousOrdersCount = await prisma.orders.count({
                        where: {
                            businessId: updated.businessId,
                            status: OfferStatus.COMPLETED,
                            id: { not: updated.businessId }, // Exclude current order
                        }
                    });
                    console.log(previousOrdersCount, '>>>>>>>>>>>> previousOrdersCount');

                    // This is a new repeat business if there's exactly 1 previous order (making this the 2nd order)
                    isNewRepeatBusiness = previousOrdersCount === 1;
                }

                // console.log(existingUserStats, '>>>>>> existingUserStats');
                let newTotalDeals = 1;
                //console.log(existingUserStats, '>>>>>>>>>>> existingUserStats');
                if (existingBusinessUserStats) {
                    // Update existing UserStats record
                    const currentDeals = existingBusinessUserStats.totalDeals ?? 0;
                    const currentOnTime = existingBusinessUserStats.onTimeDelivery ?? 0;
                    const totalExpenses = existingBusinessUserStats.totalExpenses ?? 0;
                    const newExpense = Number(updated.finalAmount);
                    const finalExpenses = Number(totalExpenses) + Number(newExpense);
                    const currentRepeatClient = existingBusinessUserStats.repeatClient ?? 0;
                    console.log(" >>>>>>>> totalExpenses", totalExpenses, " >>>>>>>>>>>>> finalExpenses ", finalExpenses, ">>>>>>> newExpense", newExpense, ">>>>>>>>>> currentDeals", currentDeals);
                    // Calculate average value after incrementing totalDeals
                    const newTotalDeals = currentDeals + 1;
                    const averageValue = newTotalDeals > 0
                        ? Math.floor(finalExpenses / newTotalDeals)
                        : 0;

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
                                    ? Number(updated.finalAmount) / (newTotalDeals)
                                    : 0,
                        },
                    });


                }


                // Add Business Expenss End


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
                                        totalAmount: (Number(summary.totalAmount) || 0) + 50,
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

        const existingUser = await prisma.user.findUnique({ where: { id: currentUserId } });

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
                groupOrderData: {
                    include: {
                        groupUsersList: true
                    }
                },
                influencerOrderData: {
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

        for (const order of getOrder) {
            if (order?.influencerOrderData?.id) {
                const influencerBadgeData = await getBageData(order.influencerOrderData.id);
                order.influencerOrderData.badges = influencerBadgeData;
            }

            if (order?.businessOrderData?.id) {
                const businessBadgeData = await getBageData(order.businessOrderData.id);
                order.businessOrderData.badges = businessBadgeData;
            }
        }

        console.log(getOrder, '>>>>>>>>>>>>>>>>>>>>>>>getOrder');

        return response.success(res, 'Get All order List', getOrder);

    } catch (error: any) {
        return response.error(res, error.message || 'Something went wrong');
    }
};


export const getAdminAllOrderList = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status, page = 1, limit = 10 } = req.body;

        const tokenUser = req.user;
        if (!tokenUser || !tokenUser.userId) {
            return response.error(res, "Invalid token payload");
        }

        const loggedInUser = await prisma.user.findUnique({
            where: { id: tokenUser.userId },
        });

        if (!loggedInUser || loggedInUser.type !== 'ADMIN') {
            return response.error(res, "Unauthorized access. Only ADMIN can delete contact requests.");
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
            whereStatus = [completedEnumValue, completedEnumValue1, completedEnumValue2, completedEnumValue3, completedEnumValue4, completedEnumValue5, completedEnumValue6];
        } else {
            const statusEnumValue = getStatusName(status);
            whereStatus = [statusEnumValue];
        }

        const existingUser = await prisma.user.findUnique({ where: { id: currentUserId } });

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
                    in: whereStatus
                },
            }
        });

        // Option 1: Simple approach - exclude only userId (your original approach)
        const getOrder = await prisma.orders.findMany({
            where: {
                status: {
                    in: whereStatus
                },
            },
            include: {
                groupOrderData: {
                    include: {
                        groupUsersList: true
                    }
                },
                influencerOrderData: {
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
            },
            skip,
            take: parsedLimit
        });
        const totalPages = Math.ceil(total / parsedLimit);

        return response.success(res, 'Get All order List', {
            pagination: {
                total,
                page: parsedPage,
                limit: parsedLimit,
                totalPages
            },
            orderList: getOrder
        });

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

        // Send notification to business user (if exists)
        if (order.businessId) {
            const businessUser = await prisma.user.findUnique({
                where: { id: order.businessId },
                select: { id: true, fcmToken: true, name: true },
            });

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



export const withdrawAmount = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, withdrawAmount, withdrawalType } = req.body;


        if (!userId || typeof withdrawAmount !== 'number') {
            return response.error(res, 'userId and withdrawAmount are required');
        }

        //  Fetch user stats
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

        //  Create withdrawal record
        const newWithdraw = await prisma.withdraw.create({
            data: {
                userId,
                withdrawAmount,
                withdrawalType,
                transactionType: 'DEBIT',
            },
        });

        //  Update UserStats
        await prisma.userStats.update({
            where: { id: user.id },
            data: {
                totalWithdraw: new Prisma.Decimal(withdrawalsNumber).plus(withdrawAmount),
                totalEarnings: new Prisma.Decimal(earningsNumber).minus(withdrawAmount),
            },
        });

        //  KringP Coins reward calculation
        const kringPCoins = Math.floor(withdrawAmount / 100);
        const sourceNote = `Withdrawal reward for ₹${withdrawAmount}`;

        if (kringPCoins > 0) {
            //  Add CoinTransaction entry
            await prisma.coinTransaction.create({
                data: {
                    userId,
                    amount: kringPCoins,
                    type: 'CASHOUT_BONUS',
                    status: 'UNLOCKED',
                    source: sourceNote,
                },
            });

            // Update or Create ReferralCoinSummary
            const existingSummary = await prisma.referralCoinSummary.findUnique({
                where: { userId },
            });

            if (existingSummary) {
                await prisma.referralCoinSummary.update({
                    where: { userId },
                    data: {
                        totalAmount: Number(existingSummary.totalAmount ?? 0) + Number(kringPCoins),
                        netAmount: new Prisma.Decimal(existingSummary.netAmount ?? 0).plus(kringPCoins),
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

        const userBandDetail = await prisma.userBankDetails.findFirst({
            where: { userId }
        });
        if (userBandDetail) {
            const initiateTransferData = await initiateTransfer(withdrawAmount, userBandDetail?.accountId, userBandDetail?.accountHolderName);

            if (initiateTransferData) {
                return response.success(res, 'Withdrawal successfully and please check your account', {
                    withdraw: newWithdraw,
                    updatedBalance: earningsNumber - withdrawAmount,
                    kringPCoinsIssued: kringPCoins,
                });
            } else {
                return response.error(res, 'Insufficient balance for withdrawal');
            }
        } else {
            return response.error(res, 'Please check bank Detail');
        }

    } catch (error: any) {
        console.error('Withdraw API error:', error);
        return response.error(res, error.message || 'Something went wrong');
    }
};



const formatUserData = async (user: any) => {
    const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

    const {
        password: _,
        socialMediaPlatforms: __,
        ...userData
    } = user;

    return {
        ...userData,
        socialMediaPlatforms: user.socialMediaPlatforms?.map(({ viewCount, ...rest }) => rest) ?? [],
        categories: userCategoriesWithSubcategories,
        countryName: user.countryData?.name ?? null,
        stateName: user.stateData?.name ?? null,
        cityName: user.cityData?.name ?? null,
    };
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
                                },
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
                                },
                            },
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

            totalBusinessExpenses = formattedBusinessOrders.reduce((sum, t) => sum + Number(t.amount), 0);
        }

        const transactionData = [
            ...formattedEarnings,
            ...formattedWithdrawals,
            ...formattedBusinessOrders,
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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

            totalExpenses = completedOrders.reduce((sum, order) => sum + Number(order.finalAmount), 0);
        }

        const responseData = {
            totalEarnings,
            totalWithdraw,
            totalBusinessExpenses,
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
        const decimalWithdraw = new Prisma.Decimal(withdrawAmount);

        // Calculate new withdraw and net amounts
        const updatedWithdraw = currentWithdraw.plus(withdrawAmount);
        if (updatedWithdraw.gt(currentTotal)) {
            return response.error(res, 'Withdrawal amount exceeds available coins');
        }

        const netAmount = new Prisma.Decimal(currentTotal).minus(updatedWithdraw);

        const [updatedSummary, newWithdrawRecord] = await prisma.$transaction([
            prisma.referralCoinSummary.update({
                where: { userId },
                data: {
                    withdrawAmount: updatedWithdraw,
                    netAmount: netAmount,
                },
            }),
            prisma.userCoinWithdraw.create({
                data: {
                    userId,
                    withdrawalAmount: decimalWithdraw,
                },
            }),
        ]);

        const userBandDetail = await prisma.userBankDetails.findFirst({
            where: { userId }
        });
        if (userBandDetail) {
            const initiateTransferData = await initiateTransfer(withdrawAmount, userBandDetail?.accountId, userBandDetail?.accountHolderName);

            if (initiateTransferData) {
                return response.success(res, 'Referral coin withdrawal recorded successfully', {
                    withdrawalRecord: newWithdrawRecord,
                    updatedSummary,
                });
            } else {
                return response.error(res, 'Insufficient balance for withdrawal');
            }
        } else {
            return response.error(res, 'Please check bank Detail');
        }

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
        const withdrawAmount = referralSummary?.unlocked ? Number(referralSummary?.withdrawAmount || 0) : 0;
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

        const history = coinTransactions.map(tx => ({
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

        const formattedWithdrawals = withdrawals.map(w => ({
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
        return response.success(res, 'Referral coin history fetched successfully.', {
            totalAmount,
            withdrawAmount,
            netAmount,
            data: fullHistory,
            meta: paginated.meta,
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