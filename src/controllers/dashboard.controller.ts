import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import response from '../utils/response';
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { RequestStatus, CoinType } from '@prisma/client';
import { calculateProfileCompletion, getProfileCompletionSuggestions } from '../utils/calculateProfileCompletion';
import { startOfWeek, endOfWeek } from 'date-fns';
import { subMonths } from 'date-fns';
import { Role } from '@prisma/client';
import { paginate } from '../utils/pagination';


const prisma = new PrismaClient();


export const getTopInfluencers = async (req: Request, res: Response): Promise<any> => {
    try {
        const users = await prisma.user.findMany({
            where: {
                ratings: 5,
                type: 'INFLUENCER',
                status: true,
            },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
            orderBy: {
                createsAt: 'desc',
            },
            take: 4,
        });

        if (!users || users.length === 0) {
            return response.error(res, 'No top influencers found.');
        }

        const formattedUsers = await Promise.all(
            users.map(async (userData: any) => {
                const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(userData.id);

                const { password, socialMediaPlatform, ...safeUserData } = userData;

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


// Business Dashboard Data
export const getDashboardData = async (req: Request, res: Response): Promise<any> => {
    try {
        const loginUserId = req.user?.userId;

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
                status: true,
            },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
            orderBy: {
                createsAt: 'desc',
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
                        viewedAt: view.updatedAt,
                    };
                })
            );

            // Filter out any null entries (in case some users were deleted)
            recentViews = recentViews.filter(view => view !== null);
        }

        const appVersionData = await prisma.appSetting.findMany({
            where: {
                slug: {
                    in: [
                        'android-min-version',
                        'android-latest-version',
                        'ios-min-version',
                        'ios-latest-version',
                        'is-force-stop',
                        'app-under-maintenance',
                        'under-maintenance-message',
                        'message',
                    ],
                },
            }
        });

        // Transform into an object: { slug: value }
        const appSettingsData = appVersionData.reduce((acc, setting) => {
            if (setting.slug && setting.value != null) {
                if (setting.slug === "app-under-maintenance") {
                    const value = (setting.value === "true") ? true : false;
                    acc[setting.slug] = value;
                } else if (setting.slug === "is-force-stop") {
                    const value = (setting.value === "true") ? true : false;
                    acc[setting.slug] = value;
                } else {
                    acc[setting.slug] = setting.value;
                }

            }
            return acc;
        }, {} as Record<string, string>);

        // Send combined response
        return response.success(res, 'Dashboard data fetched successfully!', {
            bannerData,
            topInfluencers,
            recentViews,
            appSettingsData,
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
            where: { id: loggedInUserId, status: true, },
            select: {
                profileCompletion: true,
            },
        });

        if (!user) {
            return response.error(res, "User not found");
        }

        const dailyTips = await prisma.dailyTips.findMany();

        const profileView = await prisma.user.findUnique({
            where: { id: loggedInUserId, status: true, },
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
            where: { id: loggedInUserId, status: true, },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
        });

        const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

        const userSubCategories = await prisma.userSubCategory.findMany({
            where: {
                userId: loggedInUserId
            }
        })
        console.log(userSubCategories, ">>>>>>>>>>>> userSubCategories")
        const responseUser = {
            ...authUser,
            userSubCategories,
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

        const startDate = startOfWeek(new Date(), { weekStartsOn: 1 });
        const endDate = endOfWeek(new Date(), { weekStartsOn: 1 });

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
                        userImage: true,
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
                viewer: view.recentChatViewLoginUser,
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

        const appVersionData = await prisma.appSetting.findMany({
            where: {
                slug: {
                    in: [
                        'android-min-version',
                        'android-latest-version',
                        'ios-min-version',
                        'ios-latest-version',
                        'is-force-stop',
                        'app-under-maintenance',
                        'under-maintenance-message',
                    ],
                },
            }
        });

        // Transform into an object: { slug: value }
        const appSettingsData = appVersionData.reduce((acc, setting) => {
            if (setting.slug && setting.value != null) {
                if (setting.slug === "app-under-maintenance") {
                    const value = (setting.value === "true") ? true : false;
                    acc[setting.slug] = value;
                } else if (setting.slug === "is-force-stop") {
                    const value = (setting.value === "true") ? true : false;
                    acc[setting.slug] = value;
                } else {
                    acc[setting.slug] = setting.value;
                }

            }
            return acc;
        }, {} as Record<string, string>);

        return response.success(res, "Influencer dashboard data fetched successfully", {
            profileCompletion: user.profileCompletion,
            dailyTips: dailyTips,
            earningDashboard: influencerStats,
            suggestions: profileSuggestions,
            totalReferralCount,
            leadBoard,
            analyticSummary,
            badges: userBadges.map(b => b.userBadgeTitleData),
            appSettingsData,
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




export const getAdminDashboardStats = async (req: Request, res: Response): Promise<any> => {
    try {
        const [influencerCount, businessCount, adminUsers] = await Promise.all([
            prisma.user.count({ where: { type: Role.INFLUENCER } }),
            prisma.user.count({ where: { type: Role.BUSINESS } }),
            prisma.user.findMany({
                where: { type: Role.ADMIN },
                select: { id: true },
            }),
        ]);

        const adminUserIds = adminUsers.map(user => user.id);

        const totalEarningResult = await prisma.earnings.aggregate({
            where: {
                userId: { in: adminUserIds },
            },
            _sum: {
                earningAmount: true,
            },
        });

        const totalEarnings = totalEarningResult._sum.earningAmount || 0;

        return response.success(res, 'Admin dashboard stats fetched successfully', {
            totalInfluencers: influencerCount,
            totalBusinesses: businessCount,
            totalEarnings,
        });
    } catch (error: any) {
        console.error('getAdminDashboardStats error:', error);
        return response.error(res, 'Failed to fetch admin dashboard stats');
    }
};




export const getAdminEarningsList = async (req: Request, res: Response): Promise<any> => {
    try {

        const adminUsers = await prisma.user.findMany({
            where: { type: 'ADMIN' },
            select: { id: true },
        });

        const adminUserIds = adminUsers.map(user => user.id);

        const { search } = req.body;

        const searchFilter = search
            ? {
                where: {
                    name: {
                        contains: String(search),
                        mode: 'insensitive',
                    },
                },
            }
            : {};

        const earnings = await paginate(
            req,
            prisma.earnings,
            {
                where: {
                    userId: { in: adminUserIds },
                },
                orderBy: { createdAt: 'desc' },
                include: {
                    orderData: true,
                },
            },
            "earnings"
        );

        if (!earnings || earnings.earnings.length === 0) {
            throw new Error("Earnings not found for admin users");
        }

        response.success(res, 'Admin earnings list fetched successfully', earnings);

    } catch (error: any) {
        response.error(res, error.message);
    }
};

