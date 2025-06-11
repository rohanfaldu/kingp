import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import response from '../utils/response';
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';


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
        // Fetch app settings
        const bannerData = await prisma.appSetting.findMany({
            where: {
                slug: {
                    in: [
                        'banner-image',
                        'banner-title',
                        'banner-button-text',
                        'banner-button-link',
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
                createsAt: 'desc', // double-check your column name
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

        // Send combined response
        return response.success(res, 'Dashboard data fetched successfully!', {
            bannerData,
            topInfluencers,
        });

    } catch (error: any) {
        return response.error(res, error.message);
    }
};
