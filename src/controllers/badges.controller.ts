import { IBadges } from './../interfaces/badges.interface';
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';
import { resolveStatus } from '../utils/commonFunction'



const prisma = new PrismaClient();


export const createBadge = async (req: Request, res: Response): Promise<any> => {
    try {
        const badgesData: IBadges = req.body;

        const status = resolveStatus(badgesData.status);
        const { ...badgesFields } = badgesData;

        const newBadges = await prisma.badges.create({
            data: {
                ...badgesFields
            },
        });
        response.success(res, 'Badges Created successfully!', newBadges);
    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const getAllBadges = async (req: Request, res: Response): Promise<any> => {
    try {
        const categories = await paginate(req, prisma.badges, {}, "categories");

        if (!categories || categories.length === 0) {
            throw new Error("badges not Found");
        }
        response.success(res, 'Get All badges successfully!', categories);
    } catch (error: any) {
        response.error(res, error.message);
    }
}