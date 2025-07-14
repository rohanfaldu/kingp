import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import response from "../utils/response";
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { IRating } from "../interfaces/ratings.interface";
import { paginate } from '../utils/pagination';
import { RatingType } from '../enums/userType.enum';
import { sendFCMNotificationToUsers } from '../utils/notification';



const prisma = new PrismaClient();

export const createRating = async (req: Request, res: Response): Promise<any> => {
    try {
        const { orderId, ratedToUserId, groupId, rating, review } = req.body;
        const ratedByUserId = req.user?.id || req.user?.userId || req.userId;

        if (!ratedByUserId) return response.error(res, "Authentication required");
        if (!orderId) return response.error(res, "orderId is required");
        if (typeof rating !== "number" || rating < 1 || rating > 5)
            return response.error(res, "Rating must be a number between 1 and 5");

        const createdRatings: any[] = [];
        const usersToNotify: any[] = [];

        const order = await prisma.orders.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                status: true,
                influencerId: true,
                businessId: true,
                groupId: true,
            },
        });

        if (!order) return response.error(res, "Order not found.");
        if (order.status !== "COMPLETED") return response.error(res, "You can only rate after the order is completed.");

        const createRatingIfNotExists = async (
            toUserId: string | null,
            groupId: string | null,
            typeToUserParam: "GROUP" | "INFLUENCER" | "BUSINESS"
        ) => {
            if (toUserId && toUserId === ratedByUserId) return;

            // Step 1: Dynamically determine typeToUser for user (if toUserId is present)
            let typeToUser: "INFLUENCER" | "BUSINESS" | "GROUP" = typeToUserParam;
            if (toUserId) {
                const userData = await prisma.user.findUnique({
                    where: { id: toUserId },
                    select: { type: true },
                });

                if (userData?.type === "INFLUENCER" || userData?.type === "BUSINESS") {
                    typeToUser = userData.type;
                }
            }

            // Step 2: Check for existing rating
            const alreadyRated = await prisma.ratings.findFirst({
                where: {
                    orderId,
                    ratedByUserId,
                    ratedToUserId: toUserId ?? undefined,
                    groupId: groupId ?? undefined,
                    typeToUser,
                },
            });

            if (!alreadyRated) {
                // Step 3: Create rating
                const newRating = await prisma.ratings.create({
                    data: {
                        orderId,
                        ratedByUserId,
                        ratedToUserId: toUserId,
                        groupId,
                        rating: Math.round(rating * 10) / 10,
                        review: review || null,
                        typeToUser,
                    },
                    include: {
                        ratedByUserData: {
                            select: { id: true, name: true, userImage: true },
                        },
                        orderRatings: {
                            select: { id: true, status: true },
                        },
                    },
                });

                createdRatings.push(newRating);

                // Step 4: Update user rating avg if applicable
                if (toUserId && typeToUser !== "GROUP") {
                    const allUserRatings = await prisma.ratings.findMany({
                        where: {
                            ratedToUserId: toUserId,
                            typeToUser,
                        },
                        select: { rating: true },
                    });

                    const totalRatings = allUserRatings.length;
                    const sumRatings = allUserRatings.reduce((sum, r) => {
                        return sum + (r.rating?.toNumber?.() ?? 0);
                    }, 0);
                    const averageRating = totalRatings > 0 ? sumRatings / totalRatings : rating;

                    await prisma.user.update({
                        where: { id: toUserId },
                        data: {
                            ratings: Math.round(averageRating * 10) / 10,
                        },
                    });
                }

                // Step 5: Notify user
                if (toUserId) {
                    const userToNotify = await prisma.user.findUnique({
                        where: { id: toUserId },
                        select: { id: true, fcmToken: true },
                    });

                    if (userToNotify?.fcmToken) {
                        usersToNotify.push(userToNotify);
                    }
                }

                // Step 6: Update group average rating
                if (groupId && typeToUser === "GROUP") {
                    const allGroupRatings = await prisma.ratings.findMany({
                        where: {
                            groupId: groupId,
                            typeToUser: 'GROUP',
                        },
                        select: { rating: true },
                    });

                    const totalGroupRatings = allGroupRatings.length;
                    const sumGroupRatings = allGroupRatings.reduce((sum, r) => {
                        return sum + (r.rating?.toNumber?.() ?? 0);
                    }, 0);
                    const averageGroupRating = totalGroupRatings > 0 ? sumGroupRatings / totalGroupRatings : rating;

                    await prisma.group.update({
                        where: { id: groupId },
                        data: {
                            ratings: Math.round(averageGroupRating * 10) / 10,
                        },
                    });
                }
            }
        };

        if (groupId) {
            // Validate group belongs to this order
            if (order.groupId !== groupId) {
                return response.error(res, "This order is not related to the specified group.");
            }

            const existingGroupRating = await prisma.ratings.findFirst({
                where: {
                    orderId,
                    ratedByUserId,
                    groupId,
                    typeToUser: 'GROUP',
                },
            });

            if (existingGroupRating) {
                return response.error(res, "You have already rated this group for this order.");
            }

            await createRatingIfNotExists(null, groupId, "GROUP");

            const groupOrder = await prisma.orders.findFirst({
                where: { id: orderId, groupId },
                include: {
                    groupOrderData: {
                        include: {
                            groupUsersList: {
                                where: { requestAccept: 'ACCEPTED' },
                                include: { invitedUser: { select: { id: true, fcmToken: true } } },
                            },
                        },
                    },
                },
            });

            if (!groupOrder?.groupOrderData) {
                return response.error(res, "Group order data not found.");
            }

            const groupAdmin = await prisma.groupUsers.findFirst({
                where: { groupId },
                select: { userId: true },
            });

            const adminUserId = groupAdmin?.userId;
            if (adminUserId) {
                await createRatingIfNotExists(adminUserId, null, "INFLUENCER");
            }

            for (const member of groupOrder.groupOrderData.groupUsersList) {
                if (
                    member.invitedUserId &&
                    member.invitedUserId !== adminUserId &&
                    member.invitedUserId !== ratedByUserId
                ) {
                    await createRatingIfNotExists(member.invitedUserId, null, "INFLUENCER");
                }
            }
        } else if (ratedToUserId) {
            // Validate user was part of the order (either influencer or business)
            let typeToUser: "INFLUENCER" | "BUSINESS" | null = null;

            // Check if order has a groupId before querying groupUsers
            let adminUserId: string | undefined = undefined;

            if (order.groupId) {
                const groupAdmin = await prisma.groupUsers.findFirst({
                    where: {
                        groupId: order.groupId
                    },
                    select: { userId: true },
                });
                adminUserId = groupAdmin?.userId;
            }

            if (order.influencerId === ratedToUserId && order.businessId === ratedByUserId) {
                typeToUser = "INFLUENCER";
            } else if (order.businessId === ratedToUserId && order.influencerId === ratedByUserId) {
                typeToUser = "BUSINESS";
            } else if (order.influencerId === null && order.groupId !== null && ratedByUserId === adminUserId) {
                typeToUser = "INFLUENCER";
            } else {
                return response.error(res, "You can only rate a user that participated in this order.");
            }

            await createRatingIfNotExists(ratedToUserId, null, typeToUser);
        } else {
            return response.error(res, "Either ratedToUserId or groupId must be provided.");
        }

        // Update review status in order
        const updateData: any = {};

        // Before querying, check if groupId exists
        let groupAdmin = null;
        if (order.groupId) {  // or whatever variable contains the groupId
            groupAdmin = await prisma.groupUsers.findFirst({
                where: {
                    groupId: order.groupId
                },
                select: {
                    userId: true
                }
            });
        }

        const adminUserId = groupAdmin?.userId;

        if (!order.influencerId && order.groupId && ratedByUserId === adminUserId) {
            updateData.influencerReviewStatus = true;
        }

        if (ratedByUserId === order.businessId) {
            updateData.businessReviewStatus = true;
        }

        if (ratedByUserId === order.influencerId) {
            updateData.influencerReviewStatus = true;
        }

        if (Object.keys(updateData).length > 0) {
            await prisma.orders.update({
                where: { id: orderId },
                data: updateData,
            });
        }

        // FCM Notifications
        if (usersToNotify.length > 0) {
            const sender = await prisma.user.findUnique({
                where: { id: ratedByUserId },
                select: { name: true, type: true },
            });

            const title = 'You received a new rating!';
            const message = `${sender?.name || 'Someone'} rated you for a recent order.`;

            console.log(sender, '>>>>>>>>>>>>>>>>>>>>> sender');

            // ✅ Determine notification type based on sender's role
            let notificationType = 'NEW_RATING';
            if (sender?.type === 'BUSINESS') {
                notificationType = 'INFLUENCER_RATING';
            } else if (sender?.type === 'INFLUENCER') {
                notificationType = 'BUSINESS_RATING';
            }

            // ✅ Send FCM to all users with the determined type
            await sendFCMNotificationToUsers(usersToNotify, title, message, notificationType);

            // ✅ Store notification with the same determined type
            const notificationEntries = usersToNotify.map((user) => ({
                userId: user.id,
                title,
                message,
                type: notificationType,
                status: 'SENT',
                orderId: order.id,
            }));

            // await prisma.notification.createMany({
            //     data: notificationEntries,
            //     skipDuplicates: true,
            // });

            if (order?.id) {
                await prisma.notification.createMany({
                    data: notificationEntries,
                    skipDuplicates: true,
                });
            } else {
                console.warn('No orderId found, skipping notification creation');
            }
        }



        return response.success(res, "Rating(s) created successfully!", createdRatings);
    } catch (error: any) {
        console.error("createRating error:", error);
        return response.error(res, error.message || "Something went wrong");
    }
};




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



const getFormattedGroupOrderData = async (groupId: string) => {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return null;

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

    return {
        ...group,
        subCategoryId: subCategoriesWithCategory,
        groupData: Array.from(groupMap.values())[0] || null,
    };
};




export const getUserRatings = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, groupId } = req.body;
        const type = req.query.type as string | undefined;

        if (!userId && !groupId) {
            return res.status(400).json({ error: "userId or groupId is required" });
        }

        let ratedUserIds: string[] = [];

        if (groupId) {
            const groupUsers = await prisma.groupUsersList.findMany({
                where: { groupId },
                select: { invitedUserId: true }
            });
            ratedUserIds = groupUsers.map(u => u.invitedUserId);

            if (ratedUserIds.length === 0) {
                return response.success(res, "No users in group", {
                    ratings: [],
                    groupOrderData: null,
                    summary: { totalRatings: 0, averageRating: 0 }
                });
            }
        }

        const whereClause: Record<string, any> = {
            NOT: { ratedByUserId: undefined }
        };

        if (groupId) {
            whereClause.groupId = groupId;
        } else if (userId) {
            whereClause.ratedToUserId = userId;
            whereClause.NOT = { ratedByUserId: userId };
        }

        if (type && ["INFLUENCER", "BUSINESS", "GROUP"].includes(type)) {
            whereClause.typeToUser = type;
        }

        const [ratings, totalCount] = await Promise.all([
            prisma.ratings.findMany({
                where: whereClause,
                include: {
                    ratedByUserData: {
                        select: { id: true, name: true, userImage: true, type: true }
                    },
                    orderRatings: {
                        select: { id: true, status: true, groupId: true }
                    }
                },
                orderBy: { createdAt: "desc" }
            }),
            prisma.ratings.count({ where: whereClause })
        ]);

        const groupIdsFromRatings = Array.from(new Set(
            ratings.map(r => r.orderRatings?.groupId).filter(Boolean)
        ));

        const groupAdmins = await prisma.groupUsers.findMany({
            where: { groupId: { in: groupIdsFromRatings } },
            select: { groupId: true, userId: true }
        });

        const groupAdminMap = new Map<string, string>();
        groupAdmins.forEach(admin => {
            groupAdminMap.set(admin.groupId, admin.userId);
        });

        const enrichedRatings = ratings.map(r => {
            const ratedBy = r.ratedByUserData;
            let ratedByType = ratedBy?.type || "INFLUENCER";

            const orderGroupId = r.orderRatings?.groupId;
            const isToBusiness = r.typeToUser === "BUSINESS";
            const isGroupAdmin = orderGroupId && ratedBy?.id && groupAdminMap.get(orderGroupId) === ratedBy.id;

            if (isToBusiness && isGroupAdmin) {
                ratedByType = "GROUP";
            }

            return {
                ...r,
                ratedByUserData: {
                    ...ratedBy,
                    type: ratedByType
                }
            };
        });

        const avgRating = ratings.length > 0
            ? ratings.reduce((sum, r) => sum + Number(r.rating ?? 0), 0) / ratings.length
            : 0;

        const avgRatingRounded = Number(avgRating.toFixed(2));

        if (userId) {
            await prisma.user.update({
                where: { id: userId },
                data: {
                    ratings: avgRatingRounded
                }
            });
        }

        let groupOrderData = null;
        if (groupId) {
            groupOrderData = await getFormattedGroupOrderData(groupId);
        }

        return response.success(res, "Ratings fetched successfully!", {
            ratings: enrichedRatings,
            groupOrderData,

            totalRatings: totalCount,
            averageRating: avgRatingRounded

        });

    } catch (error: any) {
        console.error("Error in getUserRatings:", error);
        return response.error(res, error.message || "Something went wrong");
    }
};



// Get all ratings for a specific order
export const getOrderRatings = async (req: Request, res: Response): Promise<any> => {
    try {
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({ error: "Order ID is required" });
        }

        // Validate order exists
        const order = await prisma.orders.findUnique({
            where: { id: orderId }
        });

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const ratings = await prisma.ratings.findMany({
            where: { orderId },
            include: {
                ratedByUserData: {
                    select: { id: true, name: true, type: true, userImage: true }
                },

            },
            orderBy: { createdAt: 'desc' }
        });

        const responseData = {
            orderId,
            ratings,
            totalRatings: ratings.length
        };

        return response.success(res, 'Order ratings fetched successfully!', responseData);

    } catch (error: any) {
        console.error("Error in getOrderRatings:", error);
        return response.error(res, error.message || "Something went wrong");
    }
};