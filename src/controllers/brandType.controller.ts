import { BrandType } from './../../node_modules/.prisma/client/index.d';
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { IBrandType } from '../interfaces/brandType.interface';
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { resolveStatus } from '../utils/commonFunction'
import { paginate } from '../utils/pagination';



const prisma = new PrismaClient();


export const createBrand = async (req: Request, res: Response): Promise<any> => {
    try {
        const brandData: IBrandType = req.body;

        if (!brandData.name) {
            return response.error(res, 'Brand Name required');
        }

        if (typeof brandData.status !== 'boolean') {
            return response.error(res, 'Brand status must be either true or false.');
        }

        const existingBrand = await prisma.brandType.findFirst({
            where: {
                name: brandData.name,
            },
        });
        if (existingBrand) {
            return response.error(res, 'Brand Type with this name already exists.');
        }

        const status = resolveStatus(brandData.status);

        const { ...brandFields } = brandData;

        const newBrand = await prisma.brandType.create({
            data: {
                ...brandFields,
            },
        });
        return response.success(res, 'Brand Type Created successfully!', newBrand);
    } catch (error: any) {
        return response.error(res, error.message);
    }
}


export const editBrand = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const brandData: IBrandType = req.body;

        if (!brandData.name) {
            return response.error(res, 'Brand Name required for Edit Brand');
        }

        const status = resolveStatus(brandData.status);
        const { ...brandFields } = brandData;

        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        const updateBrand = await prisma.brandType.update({
            where: { id: id },
            data: {
                ...brandFields,
            },
        });
        return response.success(res, 'Brand Type Updated successfully!', updateBrand);
    } catch (error: any) {
        return response.error(res, error.message);
    }
}


export const getByIdBrand = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        const BrandType = await prisma.brandType.findUnique({
            where: { id: id },
        });
        return response.success(res, 'Brand Type Get successfully!', BrandType);
    } catch (error: any) {
        return response.error(res, error.message);
    }
}


export const getAllBrand = async (req: Request, res: Response): Promise<any> => {
    try {
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
        const brands = await paginate(req, prisma.brandType, {
            orderBy: [
                { updatedAt: 'desc' },
                { createsAt: 'desc' },
            ],
        }, "Brands");

        if (!brands || brands.length === 0) {
            throw new Error("Brand Type not Found");

        }
        return response.success(res, 'Get All Brand Type successfully!', brands);

    } catch (error: any) {
        return response.error(res, error.message);
    }
}


export const deleteBrand = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID formate')
        }

        // Check if category exists
        const brand = await prisma.brandType.findUnique({
            where: { id },
        });

        if (!brand) {
            return response.error(res, 'No brand found with the provided UUID.');
        }

        // Check if category is used in UserSubCategory
        const relatedInUser = await prisma.user.count({
            where: { brandTypeId: id },
        });

        if (relatedInUser > 0) {
            return response.error(res, 'Cannot delete brand because it is used in User relations.');
        }

        await prisma.brandType.delete({
            where: { id },
        });

        return response.success(res, 'Brand Type Deleted successfully!', null);

    } catch (error: any) {
        return response.error(res, error.message);
    }
}