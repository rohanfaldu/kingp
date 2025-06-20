import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ISocialMediaPlatform } from '../interfaces/socialMedia.interface';
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { resolveStatus } from '../utils/commonFunction'
import { paginate } from '../utils/pagination';



const prisma = new PrismaClient();


export const createSocialMediaPlatform = async (req: Request, res: Response): Promise<any> => {
    try {
        const socialData: ISocialMediaPlatform = req.body;

        const { userId, platform, ...otherFields } = socialData;

        if (!userId || !platform) {
            return response.error(res, 'userId and platform are required.');
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return response.error(res, 'User not found.');
        }

        const existing = await prisma.socialMediaPlatform.findFirst({
            where: {
                userId,
                platform,
            },
        });

        if (existing) {
            return response.error(res, 'This social media platform already exists for the user.');
        }

        const newSocialMedia = await prisma.socialMediaPlatform.create({
            data: {
                userId,
                platform,
                ...otherFields,

            },
        });

        // 4. Count total social media accounts after insertion
        const totalAccounts = await prisma.socialMediaPlatform.count({
            where: { userId },
        });

        // BADGE : 1 If 2 or more accounts, assign badge type 1 if not already assigned
        if (totalAccounts >= 2) {
            const badge = await prisma.badges.findFirst({
                where: { type: '1' }, // Adjust if badge identification is different
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
        // ******  BADGE : 6 START Count total completed orders by the user *********//
        // 1. Get all social accounts of the user
        const allSocialAccounts = await prisma.socialMediaPlatform.findMany({
            where: {
                userId,
                status: true,
            },
            select: {
                id: true,
                averageLikes: true,
                averageComments: true,
                viewCount: true,
            },
        });

        // 2. Ensure user has at least 2 accounts
        if (allSocialAccounts) {
            // 3. Check if ALL accounts meet criteria
            const allMeetCriteria = allSocialAccounts.every(account =>
                (account.averageLikes ?? 0) >= 300 &&
                (account.averageComments ?? 0) >= 100 &&
                (account.viewCount ?? 0) >= 500
            );

            if (allMeetCriteria) {
                const badge = await prisma.badges.findFirst({
                    where: { type: '6' },
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
        }

        // ******  BADGE : 6 END Count total completed orders by the user *********//
        const { viewCount, ...filteredSocialMedia } = newSocialMedia;

        return response.success(res, 'Social Media Platform created successfully!', filteredSocialMedia);

    } catch (error: any) {
        return response.error(res, error.message);
    }
};



export const editSocialMediaPlatform = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const socialData: ISocialMediaPlatform = req.body;

        const status = resolveStatus(socialData.status);
        const { ...socialMediaFields } = socialData;

        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }

        const sanitizedData: Record<string, any> = {};

        for (const key in socialData) {
            const value = socialData[key as keyof ISocialMediaPlatform];
            if (value !== undefined && value !== '') {
                sanitizedData[key] = value;
            }
        }
        
        // 1. Update social media platform
        const updated = await prisma.socialMediaPlatform.update({
            where: { id },
            data: sanitizedData,
        });
        const userId = updated.userId;

        // Fetch all social media accounts for the user
        const allAccounts = await prisma.socialMediaPlatform.findMany({
            where: {
                userId,
                status: true,
            },
            select: {
                id: true,
                averageLikes: true,
                averageComments: true,
                viewCount: true,
            },
        });

        if (allAccounts.length >= 2) {
            const allMeetCriteria = allAccounts.every(account =>
                (account.averageLikes ?? 0) >= 300 &&
                (account.averageComments ?? 0) >= 100 &&
                (account.viewCount ?? 0) >= 500
            );

            if (allMeetCriteria) {
                const badge = await prisma.badges.findFirst({
                    where: { type: '6' },
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
        }

        const { viewCount, ...filteredSocialMedia } = updated;

        response.success(res, 'Social Medial Platform Updated successfully!', filteredSocialMedia);
    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const getByIdeditSocialMediaPlatform = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }

        const scialMediaPlatform = await prisma.socialMediaPlatform.findUnique({
            where: { id: id },
        });

        const { viewCount, ...filteredSocialMedia } = scialMediaPlatform;

        response.success(res, 'Category Get successfully!', filteredSocialMedia);
    } catch (error: any) {
        response.error(res, error.message);
    }
}


//Get All Social Media Platforms by User ID
export const getSocialMediaPlatformsByUserId = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId } = req.params;

        if (!isUuid(userId)) {
            return response.error(res, 'Invalid UUID format');
        }

        const platforms = await prisma.socialMediaPlatform.findMany({
            where: {
                userId,
            },
            orderBy: {
                createsAt: 'desc',
            },
        });

        const sanitizedPlatforms = platforms.map(({ viewCount, ...rest }) => rest);

        return response.success(res, 'Social Media Platforms fetched successfully!', sanitizedPlatforms);
    } catch (error: any) {
        return response.error(res, error.message);
    }
};


export const getAllSocialMediaPlatform = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await paginate(req, prisma.socialMediaPlatform, {}, "Scial Media Platform");

        const platformList = result["Scial Media Platform"];

        if (!platformList || !Array.isArray(platformList) || platformList.length === 0) {
            throw new Error("Scial Media Platform not Found");
        }

        const cleanedList = platformList.map(({ viewCount, ...rest }) => rest);

        const finalResponse = {
            ...result,
            "Scial Media Platform": cleanedList,
        };

        response.success(res, 'Get All Scial Media Platform successfully!', finalResponse);
    } catch (error: any) {
        response.error(res, error.message);
    }
};



export const deleteSocialMediaPlatform = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID formate')
        }
        const deletedScialMediaPlatform = await prisma.socialMediaPlatform.delete({
            where: { id: id },
        });
        response.success(res, 'Scial Media Platform Deleted successfully!', null);

    } catch (error: any) {
        response.error(res, error.message);
    }
}