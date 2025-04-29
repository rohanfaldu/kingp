import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ICategory } from '../interfaces/category.interface';
import { validateUser } from '../utils/userValidation';
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { resolveStatus } from '../utils/commonFunction'


const prisma = new PrismaClient();


export const createCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const categoryData: ICategory  = req.body;

        const status = resolveStatus(categoryData.status);

        const { ...categoryFields } = categoryData;

        const newCategory = await prisma.category.create({
            data: {
                ...categoryFields,
                status: status,
            },
        });
        return response.success(res, 'Category Created successfully!', newCategory);
    } catch (error: any) {
        return response.error(res, error.message);
    }
}


export const editCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const {id} = req.params;
        const categoryData: ICategory  = req.body;

        const status = resolveStatus(categoryData.status);
        const { ...categoryFields } = categoryData;

        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }

        const updateCategory = await prisma.category.update({
            where: { id: id }, 
            data: {
                ...categoryFields,
                // status: status,
            },
        });
        response.success(res, 'Category Updated successfully!', updateCategory);
    } catch (error: any){
        response.error(res, error.message);
    }
}


export const getByIdCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const {id} = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }
        
        const category = await prisma.category.findUnique({
            where: { id: id },
        });
        response.success(res, 'Category Get successfully!', category);
    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const getAllCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const categories = await prisma.category.findMany ();

        if(!categories || categories.length === 0){
            throw new Error("Country not Found");
            
        }
        response.success(res, 'Get All categories successfully!', categories);

    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const deleteCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const {id} = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID formate')
        }
        const deletedCategory = await prisma.category.delete({
            where: {id: id},
        });
        response.success(res, 'Category Deleted successfully!',null);

    } catch (error: any) {
        response.error(res, error.message);
    }
}