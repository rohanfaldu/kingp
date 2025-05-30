import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { IGroup } from '../interfaces/group.interface';
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { resolveStatus } from '../utils/commonFunction'
import { VisibilityType, Platform } from '../enums/userType.enum';
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { paginate } from '../utils/pagination';

const prisma = new PrismaClient();



export const groupCreate = async (req: Request, res: Response): Promise<any> => {
    try {
        const groupData: IGroup = req.body;

        const existingGroup = await prisma.group.findFirst({
            where: { groupName: groupData.groupName },
        });
        if (existingGroup) {
            return response.error(res, 'Group with this name already exists.');
        }

        const status = resolveStatus(groupData.status);

        const {
            userId,
            invitedUserId = [],
            socialMediaPlatform = [],
            subCategoryId = [],
            ...groupFields
        } = groupData;

        // Fetch SubCategory data with Category info
        const subCategoriesWithCategory = await prisma.subCategory.findMany({
            where: {
                id: { in: subCategoryId },
            },
            include: {
                categoryInformation: true,
            },
        });

        // Helper function to format user data (same as getByIdUser)
        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

            const country = user.countryId ? await prisma.country.findUnique({
                where: { id: user.countryId },
                select: { name: true }
            }) : null;

            const state = user.stateId ? await prisma.state.findUnique({
                where: { id: user.stateId },
                select: { name: true }
            }) : null;

            const city = user.cityId ? await prisma.city.findUnique({
                where: { id: user.cityId },
                select: { name: true }
            }) : null;

            const { password: _, socialMediaPlatform: __, ...userData } = user;

            return {
                ...userData,
                categories: userCategoriesWithSubcategories,
                countryName: country?.name ?? null,
                stateName: state?.name ?? null,
                cityName: city?.name ?? null,
            };
        };

        // Fetch user info for userId (admin)
        const adminUser = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                UserDetail: true,
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
        });

        // Fetch info for all invited users
        const invitedUsers = invitedUserId.length
            ? await prisma.user.findMany({
                where: { id: { in: invitedUserId } },
                include: {
                    UserDetail: true,
                    socialMediaPlatforms: true,
                    brandData: true,
                    countryData: true,
                    stateData: true,
                    cityData: true,
                },
            })
            : [];

        // Create the group
        const newGroup = await prisma.group.create({
            data: {
                ...groupFields,
                subCategoryId,
                socialMediaPlatform,
                status,
                groupData: {
                    create: {
                        userId,
                        invitedUserId,
                        status: true,
                    },
                },
            },
            include: {
                groupData: true,
            },
        });

        // Format admin user data
        const formattedAdminUser = adminUser ? await formatUserData(adminUser) : null;

        // Format invited users data
        const formattedInvitedUsers = await Promise.all(
            invitedUsers.map(user => formatUserData(user))
        );

        // Build final response structure
        const formattedResponse = {
            ...newGroup,
            subCategoryId: subCategoriesWithCategory, // Replace IDs with full subcategory info
            groupData: await Promise.all(
                newGroup.groupData.map(async (groupUser) => {
                    return {
                        ...groupUser,
                        adminUser: formattedAdminUser,
                        invitedUsers: formattedInvitedUsers,
                    };
                })
            ),
        };

        return response.success(res, 'Group Created successfully!', {
            groupInformation: formattedResponse,
        });
    } catch (error: any) {
        return response.error(res, error.message);
    }
};


// export const editGroup = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { id: groupId } = req.params;
//         const groupData: Partial<IGroup> = req.body;

//         if (!groupId) {
//             return response.error(res, 'GroupId is required.');
//         }

//         // Check if group exists
//         const existingGroup = await prisma.group.findUnique({
//             where: { id: groupId },
//             include: { groupData: true },
//         });

//         if (!existingGroup) {
//             return response.error(res, 'Group not found.');
//         }

//         // Check groupName unique (except current group)
//         if (groupData.groupName) {
//             const duplicateGroup = await prisma.group.findFirst({
//                 where: {
//                     groupName: groupData.groupName,
//                     NOT: { id: groupId },
//                 },
//             });

//             if (duplicateGroup) {
//                 return response.error(res, 'Group with this name already exists.');
//             }
//         }

//         const loggedInUserId = req.user.id; // Get from token/session
//         if (existingGroup.userId !== loggedInUserId) {
//             return response.error(res, 'Unauthorized: You are not allowed to edit this group.');
//         }

//         const {
//             subCategoryId = [],
//             invitedUserId = [],
//             socialMediaPlatform = [],
//             status,
//             ...groupFields
//         } = groupData;

//         // Update group data
//         const updatedGroup = await prisma.group.update({
//             where: { id: groupId },
//             data: {
//                 ...groupFields,
//                 subCategoryId,
//                 socialMediaPlatform,
//                 status: status !== undefined ? resolveStatus(status) : existingGroup.status,
//             },
//             include: { groupData: true },
//         });

//         // Update groupData.invitedUserId if provided
//         if (invitedUserId.length) {
//             await prisma.groupUsers.updateMany({
//                 where: { groupId },
//                 data: { invitedUserId },
//             });
//         }

//         // Fetch subCategory with Category info
//         const subCategoriesWithCategory = await prisma.subCategory.findMany({
//             where: { id: { in: updatedGroup.subCategoryId } },
//             include: { categoryInformation: true },
//         });

//         // Build final response structure (Same as Create API)
//         const formattedResponse = {
//             ...updatedGroup,
//             subCategoryId: subCategoriesWithCategory,
//             groupData: await Promise.all(
//                 updatedGroup.groupData.map(async (groupUser) => {
//                     const adminUser = await prisma.user.findUnique({
//                         where: { id: groupUser.userId },
//                         include: {
//                             UserDetail: true,
//                             socialMediaPlatforms: true,
//                             brandData: true,
//                             CountryData: true,
//                             CityData: true,
//                             StateData: true,
//                         },
//                     });

//                     const invitedUserInfo = groupUser.invitedUserId.length
//                         ? await prisma.user.findMany({
//                             where: { id: { in: groupUser.invitedUserId } },
//                             include: {
//                                 UserDetail: true,
//                                 socialMediaPlatforms: true,
//                                 brandData: true,
//                                 CountryData: true,
//                                 CityData: true,
//                                 StateData: true,
//                             },
//                         })
//                         : [];

//                     return {
//                         ...groupUser,
//                         adminUser,
//                         invitedUsers: invitedUserInfo,
//                     };
//                 })
//             ),
//         };

//         return response.success(res, 'Group updated successfully!', {
//             groupInformation: formattedResponse,
//         });

//     } catch (error: any) {
//         console.error(error);
//         return response.error(res, error.message);
//     }
// };



// EDIT/UPDATE GROUP API
export const editGroup = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params; // Group ID from URL params
        const updateData: Partial<IGroup> = req.body;

        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        // Check if group exists
        const existingGroup = await prisma.group.findUnique({
            where: { id },
            include: { groupData: true },
        });

        if (!existingGroup) {
            return response.error(res, 'Group not found');
        }


        const {
            userId,
            invitedUserId,
            socialMediaPlatform,
            subCategoryId,
            status,
            ...groupFields
        } = updateData;

        // Resolve status if provided
        const resolvedStatus = status ? resolveStatus(status) : undefined;

        // Prepare update data
        const updateGroupData: any = {
            ...groupFields,
        };

        if (socialMediaPlatform !== undefined) {
            updateGroupData.socialMediaPlatform = socialMediaPlatform;
        }
        if (subCategoryId !== undefined) {
            updateGroupData.subCategoryId = subCategoryId;
        }
        if (resolvedStatus !== undefined) {
            updateGroupData.status = resolvedStatus;
        }

        // Update the group
        const updatedGroup = await prisma.group.update({
            where: { id },
            data: updateGroupData,
            include: {
                groupData: true,
            },
        });

        // Update group data if userId or invitedUserId is provided
        if (userId !== undefined || invitedUserId !== undefined) {
            // Update the first groupData record (assuming one record per group)
            const groupDataId = existingGroup.groupData[0]?.id;
            if (groupDataId) {
                const updateGroupDataFields: any = {};
                if (userId !== undefined) updateGroupDataFields.userId = userId;
                if (invitedUserId !== undefined) updateGroupDataFields.invitedUserId = invitedUserId;

                await prisma.groupUsers.update({
                    where: { id: groupDataId },
                    data: updateGroupDataFields,
                });
            }
        }

        // Fetch updated group with all relations
        const finalUpdatedGroup = await prisma.group.findUnique({
            where: { id },
            include: {
                groupData: true,
            },
        });

        // Fetch SubCategory data with Category info
        const subCategoriesWithCategory = finalUpdatedGroup?.subCategoryId.length
            ? await prisma.subCategory.findMany({
                where: {
                    id: { in: finalUpdatedGroup.subCategoryId },
                },
                include: {
                    categoryInformation: true,
                },
            })
            : [];

        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            const country = user.countryId ? await prisma.country.findUnique({ where: { id: user.countryId }, select: { name: true } }) : null;
            const state = user.stateId ? await prisma.state.findUnique({ where: { id: user.stateId }, select: { name: true } }) : null;
            const city = user.cityId ? await prisma.city.findUnique({ where: { id: user.cityId }, select: { name: true } }) : null;
            const { password: _, ...userData } = user;
            return {
                ...userData,
                categories: userCategoriesWithSubcategories,
                countryName: country?.name ?? null,
                stateName: state?.name ?? null,
                cityName: city?.name ?? null,
            };
        };
        
        // Format group data with user information
        const formattedGroupData = await Promise.all(
            (finalUpdatedGroup?.groupData || []).map(async (groupUser) => {
                // Fetch admin user info
                const adminUser = await prisma.user.findUnique({
                    where: { id: groupUser.userId },
                    include: {
                        UserDetail: true,
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                });

                // Fetch invited users info
                const invitedUsers = groupUser.invitedUserId.length
                    ? await prisma.user.findMany({
                        where: { id: { in: groupUser.invitedUserId } },
                        include: {
                            UserDetail: true,
                            socialMediaPlatforms: true,
                            brandData: true,
                            countryData: true,
                            stateData: true,
                            cityData: true,
                        },
                    })
                    : [];

                // Format admin user
                const formattedAdminUser = adminUser ? await formatUserData(adminUser) : null;

                // Format invited users
                const formattedInvitedUsers = await Promise.all(
                    invitedUsers.map(user => formatUserData(user))
                );

                return {
                    ...groupUser,
                    adminUser: formattedAdminUser,
                    invitedUsers: formattedInvitedUsers,
                };
            })
        );

        const formattedResponse = {
            ...finalUpdatedGroup,
            subCategoryId: subCategoriesWithCategory,
            groupData: formattedGroupData,
        };

        return response.success(res, 'Group updated successfully!', {
            groupInformation: formattedResponse,
        });
    } catch (error: any) {
        return response.error(res, error.message);
    }
};

export const getGroupById = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params; // or req.body based on your route structure

        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        const group = await prisma.group.findUnique({
            where: { id },
            include: {
                groupData: true,
            },
        });

        if (!group) {
            return response.error(res, 'Group not found');
        }

        // Fetch SubCategory data with Category info
        const subCategoriesWithCategory = await prisma.subCategory.findMany({
            where: {
                id: { in: group.subCategoryId },
            },
            include: {
                categoryInformation: true,
            },
        });

        // 2️⃣ Format user and group data
        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            const country = user.countryId ? await prisma.country.findUnique({ where: { id: user.countryId }, select: { name: true } }) : null;
            const state = user.stateId ? await prisma.state.findUnique({ where: { id: user.stateId }, select: { name: true } }) : null;
            const city = user.cityId ? await prisma.city.findUnique({ where: { id: user.cityId }, select: { name: true } }) : null;
            const { password: _, ...userData } = user;
            return {
                ...userData,
                categories: userCategoriesWithSubcategories,
                countryName: country?.name ?? null,
                stateName: state?.name ?? null,
                cityName: city?.name ?? null,
            };
        };

        // Format group data with user information
        const formattedGroupData = await Promise.all(
            group.groupData.map(async (groupUser) => {
                // Fetch admin user info
                const adminUser = await prisma.user.findUnique({
                    where: { id: groupUser.userId },
                    include: {
                        UserDetail: true,
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                });

                // Fetch invited users info
                const invitedUsers = groupUser.invitedUserId.length
                    ? await prisma.user.findMany({
                        where: { id: { in: groupUser.invitedUserId } },
                        include: {
                            UserDetail: true,
                            socialMediaPlatforms: true,
                            brandData: true,
                            countryData: true,
                            stateData: true,
                            cityData: true,
                        },
                    })
                    : [];

                // Format admin user
                const formattedAdminUser = adminUser ? await formatUserData(adminUser) : null;

                // Format invited users
                const formattedInvitedUsers = await Promise.all(
                    invitedUsers.map(user => formatUserData(user))
                );

                return {
                    ...groupUser,
                    adminUser: formattedAdminUser,
                    invitedUsers: formattedInvitedUsers,
                };
            })
        );

        const formattedResponse = {
            ...group,
            subCategoryId: subCategoriesWithCategory,
            groupData: formattedGroupData,
        };

        return response.success(res, 'Group fetched successfully!', {
            groupInformation: formattedResponse,
        });
    } catch (error: any) {
        return response.error(res, error.message);
    }
};


export const getAllGroups = async (req: Request, res: Response): Promise<any> => {
    try {
        const { page, limit, search = '' } = req.body;
        const skip = (Number(page) - 1) * Number(limit);

        const whereClause = search
            ? {
                OR: [
                    { groupName: { contains: search as string, mode: 'insensitive' } },
                    { groupBio: { contains: search as string, mode: 'insensitive' } },
                ]
            }
            : {};

        // 1️⃣ Paginate groups FIRST
        const [groups, totalCount] = await Promise.all([
            prisma.group.findMany({
                where: whereClause,
                include: { groupData: true },
                skip,
                take: Number(limit),
                orderBy: { createsAt: 'desc' },
            }),
            prisma.group.count({ where: whereClause }),
        ]);

        // 2️⃣ Format user and group data
        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            const country = user.countryId ? await prisma.country.findUnique({ where: { id: user.countryId }, select: { name: true } }) : null;
            const state = user.stateId ? await prisma.state.findUnique({ where: { id: user.stateId }, select: { name: true } }) : null;
            const city = user.cityId ? await prisma.city.findUnique({ where: { id: user.cityId }, select: { name: true } }) : null;
            const { password: _, ...userData } = user;
            return {
                ...userData,
                categories: userCategoriesWithSubcategories,
                countryName: country?.name ?? null,
                stateName: state?.name ?? null,
                cityName: city?.name ?? null,
            };
        };

        const formattedGroups = await Promise.all(groups.map(async (group) => {
            const subCategoriesWithCategory = group.subCategoryId.length
                ? await prisma.subCategory.findMany({
                    where: { id: { in: group.subCategoryId } },
                    include: { categoryInformation: true },
                })
                : [];

            const formattedGroupData = await Promise.all(group.groupData.map(async (groupUser) => {
                const adminUser = await prisma.user.findUnique({
                    where: { id: groupUser.userId },
                    include: {
                        UserDetail: true, socialMediaPlatforms: true, brandData: true,
                        countryData: true, stateData: true, cityData: true,
                    },
                });
                const invitedUsers = groupUser.invitedUserId.length
                    ? await prisma.user.findMany({
                        where: { id: { in: groupUser.invitedUserId } },
                        include: {
                            UserDetail: true, socialMediaPlatforms: true, brandData: true,
                            countryData: true, stateData: true, cityData: true,
                        },
                    }) : [];

                const formattedAdminUser = adminUser ? await formatUserData(adminUser) : null;
                const formattedInvitedUsers = await Promise.all(invitedUsers.map(user => formatUserData(user)));

                return {
                    ...groupUser,
                    adminUser: formattedAdminUser,
                    invitedUsers: formattedInvitedUsers,
                };
            }));

            return {
                ...group,
                subCategoryId: subCategoriesWithCategory,
                groupData: formattedGroupData,
            };
        }));

        // Return paginated result with formattedGroups
        return response.success(res, 'Groups fetched successfully!', {
            pagination: {
                total: totalCount,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(totalCount / Number(limit)),
            },
            groups: formattedGroups,
        });
    } catch (error: any) {
        return response.error(res, error.message);
    }
};




export const deleteGroup = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id: groupId } = req.params;
        const groupData: Partial<IGroup> = req.body;

        if (!isUuid(groupId)) {
            response.error(res, 'Invalid UUID formate')
        }

        if (!groupId) {
            return response.error(res, 'GroupId is required.');
        }

        // Check if group exists
        const existingGroup = await prisma.group.findUnique({
            where: { id: groupId },
            include: { groupData: true },
        });

        if (!existingGroup) {
            return response.error(res, 'Group not found with this Group ID.');
        }

        await prisma.groupUsers.deleteMany({
            where: { groupId },
        });

        const deletedGroup = await prisma.group.delete({
            where: { id: groupId },
        });
        response.success(res, 'Group Deleted successfully!', null);

    } catch (error: any) {
        console.error(error);
        return response.error(res, error.message || 'Failed to delete group');
    }
}


