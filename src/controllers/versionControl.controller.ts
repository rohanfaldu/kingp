import { PrismaClient } from "@prisma/client";
import response from '../utils/response';
import { Request, Response } from 'express';
import { resolveStatus } from '../utils/commonFunction';
import { paginate } from '../utils/pagination';
import { IAppSetting } from '../interfaces/appSetting.interface';
import { validate as isUuid } from 'uuid';



const prisma = new PrismaClient();



export const createAppSetting = async (req: Request, res: Response): Promise<any> => {
    try {
        const { title, value } = req.body;

        const generateSlug = (title: string): string =>
            title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');

        const slug = generateSlug(title);

        const setting = await prisma.appSetting.create({
            data: { title, slug, value },
        });

        response.success(res, 'Setting created successfully', setting);
    } catch (error: any) {
        response.error(res, error.message);
    }
};


export const editAppSetting = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        // const appData: IAppSetting = req.body;
        const { title, value }: IAppSetting = req.body;

        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        const generateSlug = (title: string): string =>
            title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');

        const slug = title ? generateSlug(title) : undefined;

        const updatedSetting = await prisma.appSetting.update({
            where: { id },
            data: {
                ...(title && { title }),
                ...(slug && { slug }),
                ...(value !== undefined && { value }),
            },
        });

        return response.success(res, 'App Setting Data updated successfully!', updatedSetting);
    } catch (error: any) {
        return response.error(res, error.message);
    }
}


export const getByIdAppVersionData = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }

        const appVersionData = await prisma.appSetting.findUnique({
            where: { id: id },
        });
        response.success(res, 'App Setting Data Get successfully!', appVersionData);
    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const getAllAppVersionData = async (req: Request, res: Response): Promise<any> => {
    try {
        const appVersionData = await paginate(req, prisma.appSetting, {}, "appData");

        if (!appVersionData || appVersionData.length === 0) {
            throw new Error("App Version Data not Found");

        }
        response.success(res, 'Get All App Setting Data successfully!', appVersionData);

    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const deleteAppVersionData = async (req: Request, res: Response): Promise<any> => {
    try {
        const {id} = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID formate')
        }
        const deletedAppVersionData = await prisma.appSetting.delete({
            where: {id: id},
        });
        response.success(res, 'App Setting Data Deleted successfully!',null);

    } catch (error: any) {
        response.error(res, error.message);
    }
}

