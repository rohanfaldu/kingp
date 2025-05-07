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
        const { userId, platform } = socialData;

        if (!userId || !platform) {
            return response.error(res, 'User ID and platform are required.');
        }

        // Check for existing entry with same userId and platform
        const existing = await prisma.socialMediaPlatform.findFirst({
            where: {
                userId,
                platform,
            },
        });

        if (existing) {
            return response.error(res, 'Social media platform already exists for this user.');
        }

        const status = resolveStatus(socialData.status);

        const { ...socialMediaFields } = socialData;

        const newSocialMedia = await prisma.socialMediaPlatform.create({
            data: {
                ...socialMediaFields,
            },
        });
        return response.success(res, 'Social Medial Platform Created successfully!', newSocialMedia);
    } catch (error: any) {
        return response.error(res, error.message);
    }
}


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

        const updated = await prisma.socialMediaPlatform.update({
            where: { id },
            data: sanitizedData,
        });

        response.success(res, 'Social Medial Platform Updated successfully!', updated);
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
        response.success(res, 'Category Get successfully!', scialMediaPlatform);
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

        return response.success(res, 'Social Media Platforms fetched successfully!', platforms);
    } catch (error: any) {
        return response.error(res, error.message);
    }
};


export const getAllSocialMediaPlatform = async (req: Request, res: Response): Promise<any> => {
    try {
        const scialMediaPlatform = await paginate(req, prisma.socialMediaPlatform, {}, "Scial Media Platform");

        if (!scialMediaPlatform || scialMediaPlatform.length === 0) {
            throw new Error("Scial Media Platform not Found");

        }
        response.success(res, 'Get All Scial Media Platform successfully!', scialMediaPlatform);

    } catch (error: any) {
        response.error(res, error.message);
    }
}


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