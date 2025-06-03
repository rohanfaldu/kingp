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

        const subCategoriesWithCategory = await prisma.subCategory.findMany({
            where: { id: { in: subCategoryId } },
            include: { categoryInformation: true },
        });

        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

            const country = user.countryId ? await prisma.country.findUnique({ where: { id: user.countryId }, select: { name: true } }) : null;
            const state = user.stateId ? await prisma.state.findUnique({ where: { id: user.stateId }, select: { name: true } }) : null;
            const city = user.cityId ? await prisma.city.findUnique({ where: { id: user.cityId }, select: { name: true } }) : null;

            const { password: _, socialMediaPlatform: __, ...userData } = user;

            return {
                ...userData,
                categories: userCategoriesWithSubcategories,
                countryName: country?.name ?? null,
                stateName: state?.name ?? null,
                cityName: city?.name ?? null,
            };
        };

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

        // Step 1: Create the group
        const newGroup = await prisma.group.create({
            data: {
                ...groupFields,
                subCategoryId,
                socialMediaPlatform,
                status,
            },
        });

        // Step 2: Create entry in GroupUsers for admin
        const adminGroupUser = await prisma.groupUsers.create({
            data: {
                groupId: newGroup.id,
                userId: userId,
                invitedUserId: invitedUserId,
                status: true,
            },
        });

        // Step 3: Create GroupUsersList entries for each invited user
        const groupUserListEntries = await Promise.all(
            invitedUserId.map(async (inviteId) => {
                return prisma.groupUsersList.create({
                    data: {
                        groupId: newGroup.id,
                        groupUserId: adminGroupUser.id,
                        adminUserId: userId,
                        invitedUserId: inviteId,
                        status: true,
                    },
                });
            })
        );

        // Step 4: Format users for response
        const formattedAdminUser = adminUser ? await formatUserData(adminUser) : null;
        const formattedInvitedUsers = await Promise.all(invitedUsers.map(user => formatUserData(user)));

        const formattedResponse = {
            ...newGroup,
            subCategoryId: subCategoriesWithCategory,
            groupData: [
                {
                    ...adminGroupUser,
                    adminUser: formattedAdminUser,
                    invitedUsers: formattedInvitedUsers,
                    groupListData: groupUserListEntries,
                }
            ]
        };

        return response.success(res, 'Group Created successfully!', {
            groupInformation: formattedResponse,
        });
    } catch (error: any) {
        return response.error(res, error.message);
    }
};



export const editGroup = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const updateData: Partial<IGroup> = req.body;

        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        const existingGroup = await prisma.group.findUnique({
            where: { id },
            include: { groupData: true },
        });

        if (!existingGroup) {
            return response.error(res, 'Group not found');
        }

        const {
            userId,
            invitedUserId = [],
            socialMediaPlatform,
            subCategoryId,
            status,
            ...groupFields
        } = updateData;

        const resolvedStatus = status !== undefined ? resolveStatus(status) : undefined;

        const updateGroupData: any = {
            ...groupFields,
        };
        if (socialMediaPlatform !== undefined) updateGroupData.socialMediaPlatform = socialMediaPlatform;
        if (subCategoryId !== undefined) updateGroupData.subCategoryId = subCategoryId;
        if (resolvedStatus !== undefined) updateGroupData.status = resolvedStatus;

        // 1. Update group
        const updatedGroup = await prisma.group.update({
            where: { id },
            data: updateGroupData,
        });

        // 2. Update or create GroupUsers
        let groupUserEntry = existingGroup.groupData[0];
        if (groupUserEntry) {
            groupUserEntry = await prisma.groupUsers.update({
                where: { id: groupUserEntry.id },
                data: {
                    ...(userId && { userId }),
                    ...(invitedUserId && { invitedUserId }),
                },
            });
        } else if (userId) {
            groupUserEntry = await prisma.groupUsers.create({
                data: {
                    groupId: updatedGroup.id,
                    userId,
                    invitedUserId,
                    status: true,
                },
            });
        }

        // 3. Sync GroupUsersList
        if (groupUserEntry) {
            await prisma.groupUsersList.deleteMany({
                where: { groupUserId: groupUserEntry.id },
            });

            await Promise.all(
                invitedUserId.map(async (inviteId) => {
                    await prisma.groupUsersList.create({
                        data: {
                            groupId: updatedGroup.id,
                            groupUserId: groupUserEntry.id,
                            adminUserId: userId || groupUserEntry.userId,
                            invitedUserId: inviteId,
                            status: true,
                        },
                    });
                })
            );
        }

        // 4. Fetch updated group
        const finalUpdatedGroup = await prisma.group.findUnique({
            where: { id },
            include: {
                groupData: true,
            },
        });

        // 5. Fetch SubCategory info with categories
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

        // 6. Format user
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

        // 7. Format groupData
        const formattedGroupData = await Promise.all(
            (finalUpdatedGroup?.groupData || []).map(async (groupUser) => {
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

                const formattedAdminUser = adminUser ? await formatUserData(adminUser) : null;
                const formattedInvitedUsers = await Promise.all(invitedUsers.map(user => formatUserData(user)));

                return {
                    ...groupUser,
                    adminUser: formattedAdminUser,
                    invitedUsers: formattedInvitedUsers,
                };
            })
        );

        // 8. Format response as in `groupCreate`
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


// export const getAllGroups = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { page, limit, search = '' } = req.body;
//         const skip = (Number(page) - 1) * Number(limit);

//         const whereClause = search
//             ? {
//                 OR: [
//                     { groupName: { contains: search as string, mode: 'insensitive' } },
//                     { groupBio: { contains: search as string, mode: 'insensitive' } },
//                 ]
//             }
//             : {};

//         // 1️⃣ Paginate groups FIRST
//         const [groups, totalCount] = await Promise.all([
//             prisma.group.findMany({
//                 where: whereClause,
//                 include: { groupData: true },
//                 skip,
//                 take: Number(limit),
//                 orderBy: { createsAt: 'desc' },
//             }),
//             prisma.group.count({ where: whereClause }),
//         ]);

//         // 2️⃣ Format user and group data
//         const formatUserData = async (user: any) => {
//             const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
//             const country = user.countryId ? await prisma.country.findUnique({ where: { id: user.countryId }, select: { name: true } }) : null;
//             const state = user.stateId ? await prisma.state.findUnique({ where: { id: user.stateId }, select: { name: true } }) : null;
//             const city = user.cityId ? await prisma.city.findUnique({ where: { id: user.cityId }, select: { name: true } }) : null;
//             const { password: _, ...userData } = user;
//             return {
//                 ...userData,
//                 categories: userCategoriesWithSubcategories,
//                 countryName: country?.name ?? null,
//                 stateName: state?.name ?? null,
//                 cityName: city?.name ?? null,
//             };
//         };

//         const formattedGroups = await Promise.all(groups.map(async (group) => {
//             const subCategoriesWithCategory = group.subCategoryId.length
//                 ? await prisma.subCategory.findMany({
//                     where: { id: { in: group.subCategoryId } },
//                     include: { categoryInformation: true },
//                 })
//                 : [];

//             const formattedGroupData = await Promise.all(group.groupData.map(async (groupUser) => {
//                 const adminUser = await prisma.user.findUnique({
//                     where: { id: groupUser.userId },
//                     include: {
//                         UserDetail: true, socialMediaPlatforms: true, brandData: true,
//                         countryData: true, stateData: true, cityData: true,
//                     },
//                 });
//                 const invitedUsers = groupUser.invitedUserId.length
//                     ? await prisma.user.findMany({
//                         where: { id: { in: groupUser.invitedUserId } },
//                         include: {
//                             UserDetail: true, socialMediaPlatforms: true, brandData: true,
//                             countryData: true, stateData: true, cityData: true,
//                         },
//                     }) : [];

//                 const formattedAdminUser = adminUser ? await formatUserData(adminUser) : null;
//                 const formattedInvitedUsers = await Promise.all(invitedUsers.map(user => formatUserData(user)));

//                 return {
//                     ...groupUser,
//                     adminUser: formattedAdminUser,
//                     invitedUsers: formattedInvitedUsers,
//                 };
//             }));

//             return {
//                 ...group,
//                 subCategoryId: subCategoriesWithCategory,
//                 groupData: formattedGroupData,
//             };
//         }));

//         // Return paginated result with formattedGroups
//         return response.success(res, 'Groups fetched successfully!', {
//             pagination: {
//                 total: totalCount,
//                 page: Number(page),
//                 limit: Number(limit),
//                 totalPages: Math.ceil(totalCount / Number(limit)),
//             },
//             groups: formattedGroups,
//         });
//     } catch (error: any) {
//         return response.error(res, error.message);
//     }
// };




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



export const getAllGroups = async (req: Request, res: Response): Promise<any> => {
    try {
        const { page = 1, limit = 10, search = '' } = req.body;
        const lowerSearch = search.toLowerCase();

        const matchingUserGroupEntries = await prisma.groupUsersList.findMany({
            where: {
                OR: [
                    {
                        groupAdminListData: {
                            name: { contains: search, mode: 'insensitive' },
                        },
                    },
                    {
                        groupInvitesListData: {
                            name: { contains: search, mode: 'insensitive' },
                        },
                    },
                ],
            },
            select: { groupId: true },
        });

        const matchedGroupIdsFromUsers = [...new Set(matchingUserGroupEntries.map(e => e.groupId))];

        const allGroups = await prisma.group.findMany({
            where: {
                OR: [
                    { groupName: { contains: search, mode: 'insensitive' } },
                    { groupBio: { contains: search, mode: 'insensitive' } },
                    { id: { in: matchedGroupIdsFromUsers } },
                ],
            },
            orderBy: { createsAt: 'desc' },
        });

        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            const country = user.countryId
                ? await prisma.country.findUnique({ where: { id: user.countryId }, select: { name: true } })
                : null;
            const state = user.stateId
                ? await prisma.state.findUnique({ where: { id: user.stateId }, select: { name: true } })
                : null;
            const city = user.cityId
                ? await prisma.city.findUnique({ where: { id: user.cityId }, select: { name: true } })
                : null;

            const { password: _, ...userData } = user;
            return {
                ...userData,
                categories: userCategoriesWithSubcategories,
                countryName: country?.name ?? null,
                stateName: state?.name ?? null,
                cityName: city?.name ?? null,
            };
        };

        const formattedGroups = await Promise.all(allGroups.map(async (group) => {
            const subCategoriesWithCategory = group.subCategoryId?.length
                ? await prisma.subCategory.findMany({
                    where: { id: { in: group.subCategoryId } },
                    include: { categoryInformation: true },
                })
                : [];

            const groupUserEntries = await prisma.groupUsersList.findMany({
                where: { groupId: group.id },
                include: {
                    groupAdminListData: {
                        include: {
                            UserDetail: true,
                            socialMediaPlatforms: true,
                            brandData: true,
                            countryData: true,
                            stateData: true,
                            cityData: true,
                        },
                    },
                    groupInvitesListData: {
                        include: {
                            UserDetail: true,
                            socialMediaPlatforms: true,
                            brandData: true,
                            countryData: true,
                            stateData: true,
                            cityData: true,
                        },
                    },
                },
            });

            const grouped = new Map<string, any>();

            for (const entry of groupUserEntries) {
                const key = `${entry.groupId}-${entry.groupUserId}`;

                if (!grouped.has(key)) {
                    const formattedAdminUser = entry.groupAdminListData
                        ? await formatUserData(entry.groupAdminListData)
                        : null;

                    grouped.set(key, {
                        id: entry.id,
                        userId: entry.groupUserId,
                        groupId: entry.groupId,
                        status: entry.status,
                        createdAt: entry.createdAt,
                        updatedAt: entry.updatedAt,
                        adminUser: formattedAdminUser,
                        invitedUsers: [],
                    });
                }

                if (entry.invitedUserId) {
                    const invitedUser = await prisma.user.findUnique({
                        where: { id: entry.invitedUserId },
                        include: {
                            UserDetail: true,
                            socialMediaPlatforms: true,
                            brandData: true,
                            countryData: true,
                            stateData: true,
                            cityData: true,
                        },
                    });

                    if (invitedUser) {
                        const formattedInvitedUser = await formatUserData(invitedUser);
                        grouped.get(key).invitedUsers.push(formattedInvitedUser);
                    }
                }
            }

            const formattedGroupData = Array.from(grouped.values());

            return {
                groupInformation: {
                    ...group,
                    subCategoryId: subCategoriesWithCategory,
                    groupData: formattedGroupData,
                },
            };
        }));

        const fullyFilteredGroups = formattedGroups.filter(({ groupInformation }) => {
            const groupMatch =
                groupInformation.groupName.toLowerCase().includes(lowerSearch) ||
                groupInformation.groupBio?.toLowerCase().includes(lowerSearch);

            const adminMatch = groupInformation.groupData.some((gd: any) =>
                gd.adminUser?.name?.toLowerCase().includes(lowerSearch)
            );

            const invitedMatch = groupInformation.groupData.some((gd: any) =>
                gd.invitedUsers?.some((user: any) => user.name?.toLowerCase().includes(lowerSearch))
            );

            return groupMatch || adminMatch || invitedMatch;
        });

        const paginatedGroups = fullyFilteredGroups.slice((page - 1) * limit, page * limit);

        return response.success(res, 'Groups fetched successfully!', {
            pagination: {
                total: fullyFilteredGroups.length,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(fullyFilteredGroups.length / limit),
            },
            groups: paginatedGroups,
        });
    } catch (error: any) {
        return response.error(res, error.message);
    }
};






