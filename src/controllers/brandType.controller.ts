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
        const brandData: IBrandType  = req.body;

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
        const {id} = req.params;
        const brandData: IBrandType  = req.body;

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

        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }

        const updateBrand = await prisma.brandType.update({
            where: { id: id }, 
            data: {
                ...brandFields,
            },
        });
        response.success(res, 'Brand Type Updated successfully!', updateBrand);
    } catch (error: any){
        response.error(res, error.message);
    }
}


export const getByIdBrand = async (req: Request, res: Response): Promise<any> => {
    try {
        const {id} = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }
        
        const BrandType = await prisma.brandType.findUnique({
            where: { id: id },
        });
        response.success(res, 'Brand Type Get successfully!', BrandType);
    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const getAllBrand = async (req: Request, res: Response): Promise<any> => {
    try {
        const brands = await paginate(req, prisma.brandType, {}, "Brands");
    
        if(!brands || brands.length === 0){
            throw new Error("Brand Type not Found");
            
        }
        response.success(res, 'Get All Brand Type successfully!', brands);

    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const deleteBrand = async (req: Request, res: Response): Promise<any> => {
    try {
        const {id} = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID formate')
        }
        const deletedBrands = await prisma.brandType.delete({
            where: {id: id},
        });
        response.success(res, 'Brand Type Deleted successfully!',null);

    } catch (error: any) {
        response.error(res, error.message);
    }
}