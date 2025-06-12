import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import response from "../utils/response";
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';

import { IRating } from "../interfaces/ratings.interface";
import { paginate } from '../utils/pagination';
import { RatingType } from '../enums/userType.enum';


const prisma = new PrismaClient();






// creating a rating
export const createRating = async (req: Request, res: Response): Promise<any> => {
    try {
        const { orderId, ratedToUserId, groupId, rating, review } = req.body;
        const ratedByUserId = req.user?.id || req.user?.userId || req.userId;

        if (!ratedByUserId) return response.error(res, "Authentication required");
        if (!orderId) return response.error(res, "orderId is required");
        if (typeof rating !== "number" || rating < 1 || rating > 5)
            return response.error(res, "Rating must be a number between 1 and 5");

        const createdRatings: any[] = [];

        const createRatingIfNotExists = async (
            toUserId: string | null,
            groupId: string | null,
            typeToUser: "GROUP" | "INFLUENCER" | "BUSINESS"
        ) => {
            // ❌ Prevent rating to self
            if (toUserId && toUserId === ratedByUserId) return;

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
                const newRating = await prisma.ratings.create({
                    data: {
                        orderId,
                        ratedByUserId,
                        ratedToUserId: toUserId,
                        groupId,
                        rating,
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
            }
        };

        if (groupId) {
            // ✅ Validate order belongs to group
            const order = await prisma.orders.findFirst({
                where: { id: orderId, groupId },
            });

            if (!order) {
                return response.error(res, "Invalid orderId: It does not belong to the specified groupId.");
            }

            // ✅ Check if group rating already exists
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

            // ✅ Create group rating
            await createRatingIfNotExists(null, groupId, "GROUP");

            // ✅ Get group admin and members
            const groupOrder = await prisma.orders.findFirst({
                where: { id: orderId, groupId },
                include: {
                    groupOrderData: {
                        include: {
                            groupUsersList: {
                                where: { requestAccept: 'ACCEPTED' },
                                include: { invitedUser: true },
                            },
                        },
                    },
                },
            });

            if (!groupOrder?.groupOrderData) {
                return response.error(res, "Group order not found or groupId/orderId mismatch");
            }

            const groupAdmin = await prisma.groupUsers.findFirst({
                where: { groupId },
                select: { userId: true },
            });

            const adminUserId = groupAdmin?.userId;

            // ✅ Rate admin if not self
            if (adminUserId) {
                await createRatingIfNotExists(adminUserId, null, "INFLUENCER");
            }

            // ✅ Rate accepted group members (excluding admin/self)
            const groupUsers = groupOrder.groupOrderData.groupUsersList || [];
            for (const member of groupUsers) {
                if (member.invitedUserId && member.invitedUserId !== adminUserId && member.invitedUserId !== ratedByUserId) {
                    await createRatingIfNotExists(member.invitedUserId, null, "INFLUENCER");
                }
            }
        } else if (ratedToUserId) {
            // ✅ Prevent self-rating
            if (ratedToUserId === ratedByUserId) {
                return response.error(res, "You cannot rate yourself.");
            }

            // ✅ Check if order is linked to influencer
            const orderAsInfluencer = await prisma.orders.findFirst({
                where: {
                    id: orderId,
                    influencerId: ratedToUserId,
                },
            });

            if (orderAsInfluencer) {
                await createRatingIfNotExists(ratedToUserId, null, "INFLUENCER");
            } else {
                // ✅ Check if order is linked to business
                const orderAsBusiness = await prisma.orders.findFirst({
                    where: {
                        id: orderId,
                        businessId: ratedToUserId,
                    },
                });

                if (!orderAsBusiness) {
                    return response.error(res, "Invalid orderId: It does not belong to the specified ratedToUserId.");
                }

                // ❌ Do not create rating if the business is rating itself
                if (ratedToUserId === ratedByUserId) {
                    return response.error(res, "Business cannot rate itself.");
                }

                // ✅ Create business rating
                await createRatingIfNotExists(ratedToUserId, null, "BUSINESS");
            }
        } else {
            return response.error(res, "Either groupId or ratedToUserId is required.");
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






// Get ratings for a specific user
// export const getUserRatings = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { userId, groupId } = req.body;
//         const type = req.query.type as string | undefined;

//         if (!userId && !groupId) {
//             return res.status(400).json({ error: "userId or groupId is required" });
//         }

//         let ratedUserIds: string[] = [];

//         if (groupId) {
//             // Get group users (influencers) in the group
//             const groupUsers = await prisma.groupUsersList.findMany({
//                 where: { groupId },
//                 select: { invitedUserId: true }
//             });
//             ratedUserIds = groupUsers.map(u => u.invitedUserId);

//             if (ratedUserIds.length === 0) {
//                 return response.success(res, "No users in group", {
//                     ratings: [],
//                     group: null,
//                     summary: { totalRatings: 0, averageRating: 0 }
//                 });
//             }
//         }

//         // Build the where clause for ratings query
//         const whereClause: Record<string, any> = {
//             NOT: { ratedByUserId: undefined }
//         };

//         if (groupId) {
//             whereClause.groupId = groupId;
//             //whereClause.ratedToUserId = { in: ratedUserIds };
//             //whereClause.NOT = { ratedByUserId: { in: ratedUserIds } };
//         } else if (userId) {
//             whereClause.ratedToUserId = userId;
//             whereClause.NOT = { ratedByUserId: userId };
//         }

//         if (type && ["INFLUENCER", "BUSINESS", "GROUP"].includes(type)) {
//             whereClause.typeToUser = type;
//         }

//         // Fetch ratings & count in parallel
//         const [ratings, totalCount] = await Promise.all([
//             prisma.ratings.findMany({
//                 where: whereClause,
//                 include: {
//                     ratedByUserData: {
//                         select: { id: true, name: true, userImage: true, type: true }
//                     },
//                     orderRatings: {
//                         select: { id: true, status: true, groupId: true }
//                     }
//                 },
//                 orderBy: { createdAt: "desc" }
//             }),
//             prisma.ratings.count({ where: whereClause })
//         ]);

//         // Get group admins for ratings involving orders
//         const groupIdsFromRatings = Array.from(new Set(
//             ratings.map(r => r.orderRatings?.groupId).filter(Boolean)
//         ));

//         const groupAdmins = await prisma.groupUsers.findMany({
//             where: { groupId: { in: groupIdsFromRatings } },
//             select: { groupId: true, userId: true }
//         });

//         const groupAdminMap = new Map<string, string>();
//         groupAdmins.forEach(admin => {
//             groupAdminMap.set(admin.groupId, admin.userId);
//         });

//         // Enrich ratings with correct ratedByUser type
//         const enrichedRatings = ratings.map(r => {
//             const ratedBy = r.ratedByUserData;
//             let ratedByType = ratedBy?.type || "INFLUENCER";

//             const orderGroupId = r.orderRatings?.groupId;
//             const isToBusiness = r.typeToUser === "BUSINESS";
//             const isGroupAdmin = orderGroupId && ratedBy?.id && groupAdminMap.get(orderGroupId) === ratedBy.id;

//             if (isToBusiness && isGroupAdmin) {
//                 ratedByType = "GROUP";
//             }

//             return {
//                 ...r,
//                 ratedByUserData: {
//                     ...ratedBy,
//                     type: ratedByType
//                 }
//             };
//         });

//         // Calculate average rating
//         const avgRating = ratings.length > 0
//             ? ratings.reduce((sum, r) => sum + Number(r.rating ?? 0), 0) / ratings.length
//             : 0;

//         // Round to 2 decimal places
//         const avgRatingRounded = Number(avgRating.toFixed(2));

//         // Update user's ratings field in User table if userId is provided
//         if (userId) {
//             await prisma.user.update({
//                 where: { id: userId },
//                 data: {
//                     ratings: avgRatingRounded
//                 }
//             });
//         }


//         // If groupId is given, also fetch the group data + influencers (rated users in group)
//         let groupData = null;
//         if (groupId) {
//             // Fetch group info
//             groupData = await prisma.group.findUnique({
//                 where: { id: groupId },
//                 include: {
//                     // include categories, location etc if needed
//                 }
//             });

//             // Get unique rated user IDs with reviews
//             const ratedUserIdsInGroup = Array.from(
//                 new Set(
//                     ratings
//                         .filter(r => r.review && r.review.trim() !== "")
//                         .map(r => r.ratedToUserId)
//                         .filter(Boolean) as string[]
//                 )
//             );

//             // Fetch admin userId for the group
//             const groupAdmin = await prisma.groupUsers.findFirst({
//                 where: { groupId },
//                 select: { userId: true }
//             });

//             const adminUserId = groupAdmin?.userId;

//             // Combine admin + rated influencers, avoid duplicates
//             const userIdsToFetch = adminUserId
//                 ? Array.from(new Set([...ratedUserIdsInGroup, adminUserId]))
//                 : ratedUserIdsInGroup;

//             // Fetch user details for admin + influencers who got reviews
//             const influencers = await prisma.user.findMany({
//                 where: { id: { in: userIdsToFetch } },
//                 select: { id: true, name: true, userImage: true, type: true }
//             });

//             groupData = {
//                 ...groupData,
//                 influencers
//             };
//         }

//         return response.success(res, "Ratings fetched successfully!", {
//             ratings: enrichedRatings,
//             group: groupData,
//             summary: {
//                 totalRatings: totalCount,
//                 averageRating: Math.round(avgRating * 10) / 10
//             }
//         });

//     } catch (error: any) {
//         console.error("Error in getUserRatings:", error);
//         return response.error(res, error.message || "Something went wrong");
//     }
// };






// Get all ratings for a specific order
export const getOrderRatings = async (req: Request, res: Response): Promise<any> => {
    try {
        const { orderId } = req.body;

        console.log("orderId from params:", orderId); // debug

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
