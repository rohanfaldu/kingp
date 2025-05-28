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
        response.success(res, 'Country Created successfully!', newBadges);
    } catch (error: any) {
        response.error(res, error.message);
    }
}