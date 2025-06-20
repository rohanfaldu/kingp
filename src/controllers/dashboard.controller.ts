import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import response from '../utils/response';
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { RequestStatus, CoinType } from '@prisma/client';
import { calculateProfileCompletion, getProfileCompletionSuggestions } from '../utils/calculateProfileCompletion';
import { startOfWeek, endOfWeek } from 'date-fns';
import { subMonths } from 'date-fns';


const prisma = new PrismaClient();


export const getTopInfluencers = async (req: Request, res: Response): Promise<any> => {
    try {
        const users = await prisma.user.findMany({
            where: {
                ratings: 5,
                type: 'INFLUENCER',
            },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
            orderBy: {
                createsAt: 'desc', // fix this if your column name was incorrect
            },
            take: 4,
        });

        if (!users || users.length === 0) {
            return response.error(res, 'No top influencers found.');
        }

        const formattedUsers = await Promise.all(
            users.map(async (userData: any) => {
                const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(userData.id);

                const { password, socialMediaPlatform, ...safeUserData } = userData; // safely exclude sensitive fields

                return {
                    ...safeUserData,
                    categories: userCategoriesWithSubcategories,
                    countryName: userData.countryData?.name ?? null,
                    stateName: userData.stateData?.name ?? null,
                    cityName: userData.cityData?.name ?? null,
                };
            })
        );

        return response.success(res, 'Top influencers fetched successfully!', {
            users: formattedUsers,
        });
    } catch (error: any) {
        return response.error(res, error.message);
    }
};



export const getDashboardData = async (req: Request, res: Response): Promise<any> => {
    try {
        const loginUserId = req.user?.userId; // Assuming you have the logged-in user's ID in req.user

        // Fetch app settings
        const bannerData = await prisma.appSetting.findMany({
            where: {
                slug: {
                    in: [
                        'banner-1',
                        'banner-2',
                        'banner-3',
                        'banner-4',
                    ],
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        // Fetch top influencers
        const topInfluencersRaw = await prisma.user.findMany({
            where: {
                ratings: 5,
                type: 'INFLUENCER',
            },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
            orderBy: {
                createsAt: 'desc', // Fixed typo from createsAt to createdAt
            },
            take: 4,
        });

        const topInfluencers = await Promise.all(
            topInfluencersRaw.map(async (user: any) => {
                const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

                const { password, socialMediaPlatform, ...safeUser } = user;

                return {
                    ...safeUser,
                    categories: userCategoriesWithSubcategories,
                    countryName: user.countryData?.name ?? null,
                    stateName: user.stateData?.name ?? null,
                    cityName: user.cityData?.name ?? null,
                };
            })
        );

        // Fetch recent viewed users (only if user is logged in)
        let recentViews = [];
        if (loginUserId) {
            const recentViewData = await prisma.recentView.findMany({
                where: {
                    loginUserId,
                },
                include: {
                    recentViewUser: {
                        include: {
                            socialMediaPlatforms: true,
                            countryData: true,
                            stateData: true,
                            cityData: true,
                        }
                    }
                },
                orderBy: {
                    updatedAt: 'desc',
                },
                take: 5,
            });

            recentViews = await Promise.all(
                recentViewData.map(async (view: any) => {
                    const user = view.recentViewUser;
                    if (!user) return null;

                    const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

                    const { password, socialMediaPlatform, ...safeUser } = user;

                    return {
                        ...safeUser,
                        categories: userCategoriesWithSubcategories,
                        countryName: user.countryData?.name ?? null,
                        stateName: user.stateData?.name ?? null,
                        cityName: user.cityData?.name ?? null,
                        viewedAt: view.updatedAt, // Include the last viewed timestamp
                    };
                })
            );

            // Filter out any null entries (in case some users were deleted)
            recentViews = recentViews.filter(view => view !== null);
        }

        // Send combined response
        return response.success(res, 'Dashboard data fetched successfully!', {
            bannerData,
            topInfluencers,
            recentViews,
        });

    } catch (error: any) {
        return response.error(res, error.message);
    }
};




export const influencerDashboard = async (req: Request, res: Response): Promise<any> => {
    try {

        const loggedInUserId = req.user?.userId;

        if (!loggedInUserId) {
            return response.error(res, "Unauthorized: user ID missing from token");
        }

        const user = await prisma.user.findUnique({
            where: { id: loggedInUserId },
            select: {
                profileCompletion: true,
            },
        });

        if (!user) {
            return response.error(res, "User not found");
        }

        const dailyTips = await prisma.dailyTips.findMany();

        const profileView = await prisma.user.findUnique({
            where: { id: loggedInUserId },
            select: {
                viewCount: true,
            },
        });

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const earning = await prisma.userStats.findFirst({
            where: {
                userId: loggedInUserId,
                createdAt: {
                    gte: startOfMonth,
                    lt: endOfMonth,
                },
            },
            select: {
                totalEarnings: true,
            },
        });
        const formattedEarning = earning?.totalEarnings
            ? parseFloat(earning.totalEarnings.toFixed(2))
            : 0;

        const collabs = await prisma.groupUsersList.findMany({
            where: {
                invitedUserId: loggedInUserId,
                requestAccept: RequestStatus.PENDING,
            },
        });

        const collabsCount = await prisma.groupUsersList.count({
            where: {
                invitedUserId: loggedInUserId,
                requestAccept: RequestStatus.PENDING,
            },
        });

        const influencerStats = {
            totalEarning: formattedEarning,
            collabsCount,
            collabs,
            profileView,
        };


        const authUser = await prisma.user.findUnique({
            where: { id: loggedInUserId },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
        });

        const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

            const responseUser = {
            ...authUser,
            categories: userCategoriesWithSubcategories,
        };

        const profileSuggestions = getProfileCompletionSuggestions(responseUser);

        const totalReferralCount = await prisma.coinTransaction.count({
            where: {
                userId: loggedInUserId,
                type: {
                    in: [CoinType.REFERRAL, CoinType.FIRST_DEAL_REFFERAL],
                },
            },
        });

        const rewards = await prisma.coinTransaction.findMany({
            where: {
                userId: loggedInUserId,
                type: {
                    in: [CoinType.REFERRAL, CoinType.FIRST_DEAL_REFFERAL],
                },
            },
        });


        const startDate = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
        const endDate = endOfWeek(new Date(), { weekStartsOn: 1 });     // Sunday

        const topCreators = await prisma.referralCoinSummary.findMany({
            where: {
                createdAt: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            orderBy: {
                totalAmount: 'desc',
            },
            take: 5,
            select: {
                totalAmount: true,
                userReferralCoinSummary: {
                    select: {
                        id: true,
                        name: true,
                        userImage: true, // optional
                    },
                },
            }

        });

        const formattedCreators = topCreators.map(item => ({
            totalAmount: item.totalAmount,
            userData: item.userReferralCoinSummary,
        }));

        const leadBoard = {
            totalReferralCount,
            rewards,
            topEarningCreators: formattedCreators,
        };

        const threeMonthsAgo = subMonths(new Date(), 3);

        const recentViews = await prisma.recentView.findMany({
            where: {
                recentViewUserId: loggedInUserId,
                updatedAt: {
                    gte: threeMonthsAgo,
                },
            },
            select: {
                id: true,
                loginUserId: true,
                viewCount: true,
                updatedAt: true,
                recentViewLoginUser: {
                    select: {
                        id: true,
                        name: true,
                        userImage: true,
                    },
                },
            },
        });
        const totalViewCount = await prisma.recentView.aggregate({
            where: {
                recentViewUserId: loggedInUserId,
                updatedAt: {
                    gte: threeMonthsAgo,
                },
            },
            _sum: {
                viewCount: true,
            },
        });

        const analytics = {
            totalViewCount: totalViewCount._sum.viewCount || 0,
            recentViews,
        };

        /******************************/

        // 1. Fetch recent views
        const recentChatViews = await prisma.recentChatView.findMany({
            where: {
                loginUserId: loggedInUserId, // people who viewed this user
                updatedAt: {
                    gte: threeMonthsAgo,
                },
            },
            select: {
                id: true,
                loginUserId: true,
                chatCount: true,
                updatedAt: true,
                recentChatViewLoginUser: {
                    select: {
                        id: true,
                        name: true,
                        userImage: true,
                    },
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        // 2. Aggregate total chat view count
        const totalChatViewCount = await prisma.recentChatView.aggregate({
            where: {
                loginUserId: loggedInUserId,
                updatedAt: {
                    gte: threeMonthsAgo,
                },
            },
            _sum: {
                chatCount: true,
            },
        });

        const analyticsChat = {
            totalChatViewCount: totalChatViewCount._sum.chatCount || 0,
            recentViews: recentChatViews.map(view => ({
                id: view.id,
                chatCount: view.chatCount,
                updatedAt: view.updatedAt,
                viewer: view.recentChatViewLoginUser, // viewer info (name, image, id)
            })),
        };

        const analyticSummary = {
            viewCountData: analytics,
            chatCountData: analyticsChat,
        };

        const userBadges = await prisma.userBadges.findMany({
            where: { userId: loggedInUserId },
            include: {
                userBadgeTitleData: true,
            },
        });

        return response.success(res, "Influencer dashboard data fetched successfully", {
            profileCompletion: user.profileCompletion,
            dailyTips: dailyTips,
            earningDashboard: influencerStats,
            suggestions: profileSuggestions,
            totalReferralCount,
            leadBoard,
            analyticSummary,
            badges: userBadges.map(b => b.userBadgeTitleData),
        });
    } catch (error: any) {
        return response.error(res, error.message);
    }
};



export const chatViewCount = async (req: Request, res: Response): Promise<any> => {
    try {
        const loginUserId = req.user?.userId;
        const { recentChatViewUserId } = req.body;

        if (!loginUserId || !recentChatViewUserId) {
            throw new Error("Both loginUserId and recentChatViewUserId are required");
        }

        const chatView = await prisma.recentChatView.upsert({
            where: {
                loginUserId_recentChatViewUserId: {
                    loginUserId,
                    recentChatViewUserId,
                },
            },
            update: {
                chatCount: { increment: 1 },
                updatedAt: new Date(),
            },
            create: {
                loginUserId,
                recentChatViewUserId,
                chatCount: 1,
            },
        });

        res.status(200).json({
            success: true,
            message: "Chat view count updated",
            data: {
                loginUserId,
                recentChatViewUserId,
                chatCount: chatView.chatCount,
            },
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};



