import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { IGroup } from '../interfaces/group.interface';
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { resolveStatus } from '../utils/commonFunction'
import { paginate } from '../utils/pagination';


const prisma = new PrismaClient();


// export const groupCreate = async (req: Request, res: Response): Promise<any> => {

//     try {
//         const {
//             groupImage,
//             groupName,
//             groupBio,
//             subCategoryId = [],
//             socialMediaPlatform,
//             Visibility,
//             userId,
//             invitedUserId,
//             status,
//         }: IGroup = req.body;

//         // Basic validation
//         if (!userId || !groupName || !Array.isArray(subCategoryId)) {
//             return res.status(400).json({ error: 'Missing required fields' });
//         }

//         // Create group with creator as the first member
//         const group = await prisma.group.create({
//             data: {
//                 groupImage,
//                 groupName,
//                 groupBio,
//                 subCategoryId,
//                 socialMediaPlatform,
//                 Visibility,
//                 status: status ?? true,
//                 groupDate: {
//                     create: {
//                         userId,
//                         invitedUserId: invitedUserId ?? [],
//                         status: true,
//                     }
//                 }
//             },
//             include: {
//                 groupDate: true,
//             }
//         });
//         response.success(res, 'Group created successfully!', group);

//     } catch (error: any) {
//        response.serverError(res, error.message || 'Internal server error');
//     }
// }



export const groupCreate = async (req: Request, res: Response): Promise<any> => {
    // try {
        const {
            groupImage,
            groupName,
            groupBio,
            subCategoryId = [],
            socialMediaPlatform,
            Visibility,
            userId,
            invitedUserId = [],
            status,
        }: IGroup = req.body;

        // Basic validation
        if (!userId || !groupName || subCategoryId.length === 0) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate invited users if provided
        if (invitedUserId.length > 0) {
            // Optimize by validating all users in parallel using Promise.all
            const validationResults = await Promise.all(invitedUserId.map(async (invitedId) => {
                // Check in UserSubCategory
                const userSubCategories = await prisma.userSubCategory.findMany({
                    where: {
                        userId: invitedId,
                        subCategoryId: { in: subCategoryId },
                    }
                });

                // Check in SocialMediaPlatform
                const userPlatforms = await prisma.socialMediaPlatform.findMany({
                    where: {
                        userId: invitedId,
                        platform: {
                            in: socialMediaPlatform as any, // cast as any if your Enum is string[]
                        },
                    }
                });

                // If user does not have both matching subCategory and platform
                if (userSubCategories.length === 0 || userPlatforms.length === 0) {
                    return invitedId;
                } else {
                    return null;
                }
            }));

            const invalidUsers = validationResults.filter((id) => id !== null);

            if (invalidUsers.length > 0) {
                return res.status(400).json({
                    error: 'Some invited users do not match the given subCategoryId and socialMediaPlatform.',
                    invalidUsers,
                });
            }
        }

        // Create group after validation success
        const group = await prisma.group.create({
            data: {
                groupImage,
                groupName,
                groupBio,
                subCategoryId,
                socialMediaPlatform,
                Visibility,
                status: status ?? true,
                groupDate: {
                    create: {
                        userId,
                        invitedUserId,
                        status: true,
                    }
                }
            },
            include: {
                groupDate: true,
            }
        });

        return res.status(201).json({
            message: 'Group created successfully',
            data: group,
        });

    // } catch (error) {
    //     return res.status(500).json({ error: 'Internal server error', details: error });
    // }
};