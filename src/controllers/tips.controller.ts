import { ITips } from './../interfaces/tips.interface';
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';
import { resolveStatus } from '../utils/commonFunction'



const prisma = new PrismaClient();


export const createDailyTips = async (req: Request, res: Response): Promise<any> => {
    try {
        const dailyTipsData: ITips = req.body;

        const status = resolveStatus(dailyTipsData.status);
        const { ...dailyTipsFields } = dailyTipsData;

        const newTips = await prisma.dailyTips.create({
            data: {
                ...dailyTipsFields
            },
           
        });
        response.success(res, 'Daily Tips Created successfully!', newTips);
    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const editDailyTips = async (req: Request, res: Response): Promise<any> => {
    try{
        const {id} = req.params;
        const tipsData: ITips  = req.body;
        const { ...tipsFields } = tipsData;

        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }

        const updateTips = await prisma.dailyTips.update({
            where: { id: id }, 
            data: {
                ...tipsFields,
            },
        });
        response.success(res, 'Daily Tips Updated successfully!', updateTips);

    } catch (error: any) {
        response.error(res, error.message);
    }
}



export const getByIdTips = async (req: Request, res: Response): Promise<any> => {
    try {
        const {id} = req.body;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }
        
        const tips = await prisma.dailyTips.findUnique({
            where: { id: id },
        });
        response.success(res, 'Daily Tips Get successfully!', tips);
    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const getAllDailyTips = async (req: Request, res: Response): Promise<any> => {
    try {
        const dailyTips = await paginate(req, prisma.dailyTips, {}, "tips");

        if(!dailyTips || dailyTips.tips.length === 0){
            throw new Error("Daily Tips not Found");    
        }
    
        response.success(res, 'Get All Daily Tips successfully!', dailyTips);

    } catch (error: any) {
        response.error(res, error.message);
    }
}



export const deleteTips = async (req: Request, res: Response): Promise<any> => {
    try {
        const {id} = req.body;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID formate')
        }
        const deletedCountry = await prisma.dailyTips.delete({
            where: {id: id},
        });
        response.success(res, 'Daily Tips Deleted successfully!',null);

    } catch (error: any) {
        response.error(res, error.message);
    }
}