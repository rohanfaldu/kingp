import { Request, Response } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { ICategory } from '../../interfaces/category.interface';
import response from '../../utils/response';
import { validate as isUuid } from 'uuid';
import { resolveStatus } from '../../utils/commonFunction';
import { paginate } from '../../utils/pagination';
import { validate as isUuidValid } from 'uuid';


const prisma = new PrismaClient();


export const createCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const categoryData: ICategory = req.body;

        if (!categoryData.name) {
            return response.error(res, 'Category Name required');
        }

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
        const { id } = req.params;
        const categoryData: ICategory = req.body;

        const { ...categoryFields } = categoryData;

        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        if (!categoryData.name) {
            return response.error(res, 'Category Name required for Edit Category');
        }

        const updateCategory = await prisma.category.update({
            where: { id: id },
            data: {
                ...categoryFields,
            },
        });
        return response.success(res, 'Category Updated successfully!', updateCategory);
    } catch (error: any) {
        return response.error(res, error.message);
    }
}


export const getByIdCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        const category = await prisma.category.findUnique({
            where: { id: id },
        });
        return response.success(res, 'Category Get successfully!', category);
    } catch (error: any) {
        return response.error(res, error.message);
    }
}


export const getAllCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const categories = await paginate(req, prisma.category, {
            orderBy: {
                createsAt: 'desc',
            },
        }, "categories");

        if (!categories || categories.length === 0) {
            throw new Error("Categories not Found");

        }
        return response.success(res, 'Get All categories successfully!', categories);

    } catch (error: any) {
        return response.error(res, error.message);
    }
}


export const deleteCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        const category = await prisma.category.findUnique({
            where: { id },
        });

        if (!category) {
            return response.error(res, 'No category found with the provided UUID.');
        }

        const relatedInUserSubCategory = await prisma.userSubCategory.count({
            where: { categoryId: id },
        });

        if (relatedInUserSubCategory > 0) {
            return response.error(res, 'Cannot delete category because it is used in user-subcategory relations.');
        }

        await prisma.category.delete({
            where: { id },
        });

        return response.success(res, 'Category deleted successfully!', null);

    } catch (error: any) {
        return response.error(res, error.message);
    }
};



// get influencer by category Id
export const getInfluencersBySubCategories = async (req: Request, res: Response): Promise<any> => {
    try {
        const { subcategoriesId } = req.body;

        // Validate input
        if (!Array.isArray(subcategoriesId) || subcategoriesId.length === 0) {
            return res.status(400).json({ message: 'subcategoriesId must be a non-empty array.' });
        }

        // Validate UUIDs
        const validSubcategoryIds = subcategoriesId.filter(id => isUuidValid(id));
        const invalidIds = subcategoriesId.filter(id => !isUuidValid(id));

        if (invalidIds.length > 0) {
            return res.status(400).json({ message: `Invalid UUID(s): ${invalidIds.join(', ')}` });
        }

        // Query with pagination
        const influencers = await paginate(
            req,
            prisma.user,
            {
                where: {
                    subCategories: {
                        some: {
                            subCategoryId: { in: validSubcategoryIds }
                        }
                    },
                    type: 'INFLUENCER',
                    status: true
                },
                include: {
                    subCategories: {
                        include: {
                            subCategory: true
                        }
                    }
                }
            },
            "influencers"
        );
        return response.success(res, 'Influencers fetched successfully', influencers);

    } catch (error: any) {
        return response.error(res, error.message);
    }
};
