// services/userCategory.service.ts

// import { prisma } from '../prismaClient'; // adjust your path
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();



export const getUserCategoriesWithSubcategories = async (userId: string) => {
    const userSubCategoriesRaw = await prisma.userSubCategory.findMany({
        where: { userId },
        include: {
            subCategory: {
                include: {
                    categoryInformation: true,
                }
            }
        }
    });

    const categoryMap: Record<string, { categoryId: string, categoryName: string, subcategories: { subCategoryId: string, subCategoryName: string }[] }> = {};

    userSubCategoriesRaw.forEach(item => {
        const category = item.subCategory.categoryInformation;
        if (!category) return;

        if (!categoryMap[category.id]) {
            categoryMap[category.id] = {
                categoryId: category.id,
                categoryName: category.name,
                subcategories: []
            };
        }

        categoryMap[category.id].subcategories.push({
            subCategoryId: item.subCategory.id,
            subCategoryName: item.subCategory.name,
        });
        console.log(categoryMap, '>>>>>>>>>>>>>>>>> categoryMap')
    });

    return Object.values(categoryMap);
};
