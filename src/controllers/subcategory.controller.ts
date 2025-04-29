import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ISubCategory } from '../interfaces/subcategory.interface';
import { validateUser } from '../utils/userValidation';
import * as bcrypt from 'bcryptjs';
import { UserType, BrandType } from '../enums/userType.enum';
import response from '../utils/response';
import { resolveStatus } from '../utils/commonFunction'
import { validate as isUuid } from 'uuid';


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



// export const getAllSubCategories = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const subCategories = await prisma.subCategory.findMany({
//             include: {
//                 Category: true, // Join category table
//             },
//             orderBy: {
//                 createdAt: 'desc',
//             },
//         });

//         return response.success(res, 'Fetched all sub-categories successfully.', subCategories);
//     } catch (error: any) {
//         return response.serverError(res, error.message || 'Failed to fetch sub-categories.');
//     }
// };