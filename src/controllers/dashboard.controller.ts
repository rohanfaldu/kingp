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
                type: 'INFLUENCER', // optional: use if you have roles
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

                return {
                    ...userData,
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

