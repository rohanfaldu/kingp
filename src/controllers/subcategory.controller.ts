import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ISubCategory } from '../interfaces/subcategory.interface';
import { validateUser } from '../utils/userValidation';
import * as bcrypt from 'bcryptjs';
import { UserType } from '../enums/userType.enum';
import response from '../utils/response';
import { resolveStatus } from '../utils/commonFunction'
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';



const prisma = new PrismaClient();


export const createSubCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const subcategoryData: ISubCategory = req.body;


        if (!subcategoryData.categoryId) {
            return response.error(res, 'categoryId is required.');
        }

        const existingCategory = await prisma.category.findUnique({
            where: { id: subcategoryData.categoryId },
        });

        if (!existingCategory) {
            return response.error(res, 'Invalid categoryId: Category not found.');
        }

        // Optional: Check for duplicate name within same category
        const existingSubCategory = await prisma.subCategory.findFirst({
            where: {
                name: subcategoryData.name,
                categoryId: subcategoryData.categoryId,
            },
        });
        if (existingSubCategory) {
            return response.error(res, 'Sub-category with this name already exists in the selected category.');
        }

        const status = resolveStatus(subcategoryData.status);

        const { ...subcategoryFields } = subcategoryData;

        const newSubCategory = await prisma.subCategory.create({
            data: {
                ...subcategoryFields,
                status,

            },

        });
        return response.success(res, 'Sub-category Created successfully!', newSubCategory);
    } catch (error: any) {
        return response.error(res, error.message);
    }
};


export const editSubCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const categoryData: ISubCategory = req.body;
        const status = resolveStatus(categoryData.status);
        const { ...subCategoryFields } = categoryData;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }

        const updateCategory = await prisma.subCategory.update({
            where: { id: id },
            data: {
                ...subCategoryFields,
            },
            include: {
                categoryInformation: true,
            },
        });
        response.success(res, 'Category Updated successfully!', updateCategory);

    } catch (error: any) {
        return response.serverError(res, error.message || 'Failed to efit sub-categories.');
    }
}

export const getByIdSubCategories = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }
        const subCategory = await prisma.subCategory.findUnique({
            where: { id: id },
            include: {
                categoryInformation: true,
            },
        });
        response.success(res, 'Sub-Category Get successfully!', subCategory);
    } catch (error: any) {
        return response.serverError(res, error.message || 'Failed to fetch sub-categories.');
    }
}



export const getAllSubCategories = async (req: Request, res: Response): Promise<any> => {
    try {
        const subCategories = await paginate(req, prisma.subCategory, {
            include: {
                categoryInformation: true,
            },
        });

        return response.success(res, 'Fetched all sub-categories successfully.', subCategories);
    } catch (error: any) {
        return response.serverError(res, error.message || 'Failed to fetch sub-categories.');
    }
};


export const deleteSubCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID formate')
        }
        const deletedSubCategory = await prisma.subCategory.delete({
            where: { id: id },
        });
        response.success(res, 'Sub-Category Deleted successfully!', null);

    } catch (error: any) {
        response.error(res, error.message);
    }
}

export const getByCategoriesId = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }
        const subCategory = await prisma.subCategory.findMany({
            where: { categoryId: id },
            include: {
                categoryInformation: true,
            },
        });
        response.success(res, 'Sub-Category Get successfully!', subCategory);
    } catch (error: any) {
        return response.serverError(res, error.message || 'Failed to fetch sub-categories.');
    }
}
