import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { IGroup } from '../interfaces/group.interface';
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { resolveStatus } from '../utils/commonFunction'
import { RequestStatus } from '../enums/userType.enum';
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { paginate } from '../utils/pagination';

const prisma = new PrismaClient();



export const groupCreate = async (req: Request, res: Response): Promise<any> => {
    try {
        const groupData: IGroup = req.body;

        // Check duplicate group name
        const existingGroup = await prisma.group.findFirst({
            where: { groupName: groupData.groupName },
        });
        if (existingGroup) {
            return response.error(res, 'Group with this name already exists.');
        }

        const status = resolveStatus(groupData.status);

        const {
            userId, // Admin user ID
            invitedUserId = [], // Array of invited user IDs
            socialMediaPlatform = [],
            subCategoryId = [],
            ...groupFields
        } = groupData;

        // Fetch subCategory info with categories
        const subCategoriesWithCategory = await prisma.subCategory.findMany({
            where: { id: { in: subCategoryId } },
            include: { categoryInformation: true },
        });

        // Helper: Convert request status to numeric code
        const getNumericStatus = (requestStatus: string) => {
            switch (requestStatus) {
                case 'PENDING':
                    return 0;
                case 'ACCEPTED':
                    return 1;
                case 'REJECTED':
                    return 2;
                default:
                    return 0; // Default to pending
            }
        };

        // Helper: Format user info with categories and location names
        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

            const country = user.countryId ? await prisma.country.findUnique({
                where: { id: user.countryId }, select: { name: true }
            }) : null;
            const state = user.stateId ? await prisma.state.findUnique({
                where: { id: user.stateId }, select: { name: true }
            }) : null;
            const city = user.cityId ? await prisma.city.findUnique({
                where: { id: user.cityId }, select: { name: true }
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

        // Fetch admin user with related info
        const adminUser = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
        });

        // Fetch invited users details
        const invitedUsers = invitedUserId.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: invitedUserId } },
                include: {
                    socialMediaPlatforms: true,
                    brandData: true,
                    countryData: true,
                    stateData: true,
                    cityData: true,
                },
            })
            : [];

        // Step 1: Create Group
        const newGroup = await prisma.group.create({
            data: {
                ...groupFields,
                subCategoryId,
                socialMediaPlatform,
                status,
            },
        });

        // Fetch GroupUsersList entries for invited users in this group & admin
        const groupUsersListEntries = await prisma.groupUsersList.findMany({
            where: {
                groupId: newGroup.id,
                adminUserId: userId,
                invitedUserId: { in: invitedUserId }
            }
        });



        // Step 2: Create GroupUsers entry for admin, store invitedUserId array here
        const adminGroupUser = await prisma.groupUsers.create({
            data: {
                groupId: newGroup.id,
                userId: userId, // Admin user
                invitedUserId: invitedUserId, // invited user IDs array
                status: true,
            },
        });

        // Step 3: Create GroupUsersList entry for each invited user referencing adminGroupUser
        await Promise.all(invitedUserId.map(async (invitedId) => {
            await prisma.groupUsersList.create({
                data: {
                    groupId: newGroup.id,
                    groupUserId: adminGroupUser.id, // admin GroupUsers ID
                    adminUserId: userId,            // admin userId
                    invitedUserId: invitedId,       // single invited userId
                    status: false,                  // invitation pending
                    requestAccept: RequestStatus.PENDING,
                },
            });
        }));

        // Re-fetch GroupUsersList entries AFTER creating them
        const updatedGroupUsersListEntries = await prisma.groupUsersList.findMany({
            where: {
                groupId: newGroup.id,
                adminUserId: userId,
                invitedUserId: { in: invitedUserId }
            }
        });

        // Step 4: Format response data
        const formattedAdminUser = adminUser ? await formatUserData(adminUser) : null;

        const formattedInvitedUsers = await Promise.all(invitedUsers.map(async (user) => {
            const formattedUser = await formatUserData(user);
            const groupUserListEntry = updatedGroupUsersListEntries.find(entry => entry.invitedUserId === user.id);

            return {
                ...formattedUser,
                requestStatus: groupUserListEntry ? getNumericStatus(groupUserListEntry.requestAccept) : 0,
            };
        }));

        return response.success(res, 'Group Created successfully!', {
            groupInformation: {
                ...newGroup,
                subCategoryId: subCategoriesWithCategory,
                adminUser: formattedAdminUser,
                invitedUsers: formattedInvitedUsers,
            }
        });
    } catch (error: any) {
        console.error('Group creation error:', error);
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

        const updateGroupData: any = { ...groupFields };
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
                            requestAccept: RequestStatus.PENDING, // 👈 set to PENDING
                        },
                    });
                })
            );
        }

        // 4. Fetch updated group
        const finalUpdatedGroup = await prisma.group.findUnique({
            where: { id },
            include: { groupData: true },
        });

        // 5. Fetch SubCategory info with categories
        const subCategoriesWithCategory = finalUpdatedGroup?.subCategoryId.length
            ? await prisma.subCategory.findMany({
                where: { id: { in: finalUpdatedGroup.subCategoryId } },
                include: { categoryInformation: true },
            })
            : [];

        // 6. Format user
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

        // Helper: Map requestAccept to numeric
        const getNumericStatus = (requestStatus: string) => {
            switch (requestStatus) {
                case 'ACCEPTED':
                    return 1;
                case 'REJECTED':
                    return 2;
                case 'PENDING':
                default:
                    return 0;
            }
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

                const groupUsersList = await prisma.groupUsersList.findMany({
                    where: {
                        groupId: updatedGroup.id,
                        groupUserId: groupUser.id,
                    },
                });

                const acceptedInvites = groupUsersList.filter(entry => entry.requestAccept !== 'REJECTED');

                const invitedUserIds = acceptedInvites.map(entry => entry.invitedUserId);
                const invitedUsers = invitedUserIds.length
                    ? await prisma.user.findMany({
                        where: { id: { in: invitedUserIds } },
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

                const formattedInvitedUsers = await Promise.all(
                    invitedUsers.map(async (user) => {
                        const formatted = await formatUserData(user);
                        const userEntry = acceptedInvites.find(entry => entry.invitedUserId === user.id);
                        return {
                            ...formatted,
                            requestStatus: userEntry ? getNumericStatus(userEntry.requestAccept) : 0,
                        };
                    })
                );

                return {
                    ...groupUser,
                    adminUser: formattedAdminUser,
                    invitedUsers: formattedInvitedUsers,
                };
            })
        );

        // 8. Format final response
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
        const { id } = req.params;
        const { status } = req.body; // 0 = PENDING, 1 = ACCEPTED, 2 = REJECTED

        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        const group = await prisma.group.findUnique({
            where: { id },
            include: { groupData: true },
        });

        if (!group) {
            return response.error(res, 'Group not found');
        }

        const subCategoriesWithCategory = await prisma.subCategory.findMany({
            where: { id: { in: group.subCategoryId } },
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

        // Map numeric status to enum string
        const requestStatusMap = {
            0: 'PENDING',
            1: 'ACCEPTED',
            2: 'REJECTED',
        };

        const whereClause: any = { groupId: id };
        if ([0, 1, 2].includes(status)) {
            whereClause.requestAccept = requestStatusMap[status];
        }

        const groupUserListEntries = await prisma.groupUsersList.findMany({
            where: whereClause,
            include: {
                adminUser: {
                    include: {
                        UserDetail: true,
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                },
                invitedUser: {
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

        const groupUsers = await prisma.groupUsers.findMany({
            where: { groupId: id },
        });

        const groupMap = new Map<string, any>();

        for (const groupUser of groupUsers) {
            const key = `${groupUser.groupId}-${groupUser.id}`;

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

            const formattedAdmin = adminUser ? await formatUserData(adminUser) : null;

            const invitedEntries = await prisma.groupUsersList.findMany({
                where: {
                    groupId: id,
                    groupUserId: groupUser.id,
                    ...(typeof status === 'number' && [0, 1, 2].includes(status)
                        ? { requestAccept: requestStatusMap[status] }
                        : {}),
                },
                include: {
                    invitedUser: {
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

            const formattedInvitedUsers = await Promise.all(
                invitedEntries.map(async (entry) => {
                    if (!entry.invitedUser) return null;

                    const formatted = await formatUserData(entry.invitedUser);

                    return {
                        ...formatted,
                        requestStatus:
                            status === null || status === undefined
                                ? entry.requestAccept === 'ACCEPTED'
                                    ? 1
                                    : entry.requestAccept === 'REJECTED'
                                        ? 2
                                        : 0
                                : status, // This is only used if filtering is applied, so just return it
                    };
                })
            );

            groupMap.set(key, {
                id: groupUser.id,
                userId: groupUser.userId,
                groupId: groupUser.groupId,
                status: groupUser.status,
                createdAt: groupUser.createsAt,
                updatedAt: groupUser.updatedAt,
                adminUser: formattedAdmin,
                invitedUsers: formattedInvitedUsers.filter(Boolean),
            });
        }

        const formattedResponse = {
            ...group,
            subCategoryId: subCategoriesWithCategory,
            groupData: Array.from(groupMap.values()),
        };

        return response.success(res, 'Group fetched successfully!', {
            groupInformation: formattedResponse,
        });
    } catch (error: any) {
        console.error('getGroupById error:', error);
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



export const getAllGroups = async (req: Request, res: Response): Promise<any> => {
    try {
        const { page, limit, search = '', status } = req.body;
        const lowerSearch = search.toLowerCase();

        const requestStatusMap = {
            0: 'PENDING',
            1: 'ACCEPTED',
            2: 'REJECTED',
        };

        const matchingUserGroupEntries = await prisma.groupUsersList.findMany({
            where: {
                OR: [
                    {
                        adminUser: {
                            name: { contains: lowerSearch, mode: 'insensitive' },
                        },
                    },
                    {
                        invitedUser: {
                            name: { contains: lowerSearch, mode: 'insensitive' },
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
                    { groupName: { contains: lowerSearch, mode: 'insensitive' } },
                    { groupBio: { contains: lowerSearch, mode: 'insensitive' } },
                    { id: { in: matchedGroupIdsFromUsers } },
                ],
            },
            orderBy: { createsAt: 'desc' },
        });

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

        const formattedGroups = await Promise.all(allGroups.map(async (group) => {
            const subCategoriesWithCategory = group.subCategoryId?.length
                ? await prisma.subCategory.findMany({
                    where: { id: { in: group.subCategoryId } },
                    include: { categoryInformation: true },
                })
                : [];

            const groupUsers = await prisma.groupUsers.findMany({
                where: { groupId: group.id },
            });

            const grouped = new Map<string, any>();

            for (const groupUser of groupUsers) {
                const key = `${groupUser.groupId}-${groupUser.id}`;

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

                const formattedAdmin = adminUser ? await formatUserData(adminUser) : null;

                const invitedEntries = await prisma.groupUsersList.findMany({
                    where: {
                        groupId: group.id,
                        groupUserId: groupUser.id,
                        ...(typeof status === 'number' && [0, 1, 2].includes(status)
                            ? { requestAccept: requestStatusMap[status] }
                            : {}),
                    },
                    include: {
                        invitedUser: {
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

                const formattedInvitedUsers = await Promise.all(
                    invitedEntries.map(async (entry) => {
                        if (!entry.invitedUser) return null;

                        const formatted = await formatUserData(entry.invitedUser);

                        return {
                            ...formatted,
                            requestStatus:
                                status === null || status === undefined
                                    ? entry.requestAccept === 'ACCEPTED'
                                        ? 1
                                        : entry.requestAccept === 'REJECTED'
                                            ? 2
                                            : 0
                                    : status, // This is only used if filtering is applied, so just return it
                        };

                    })
                );

                grouped.set(key, {
                    id: groupUser.id,
                    userId: groupUser.userId,
                    groupId: groupUser.groupId,
                    status: groupUser.status,
                    createdAt: groupUser.createsAt,
                    updatedAt: groupUser.updatedAt,
                    adminUser: formattedAdmin,
                    invitedUsers: formattedInvitedUsers.filter(Boolean),
                });
            }

            return {
                groupInformation: {
                    ...group,
                    subCategoryId: subCategoriesWithCategory,
                    groupData: Array.from(grouped.values()),
                },
            };
        }));

        const fullyFilteredGroups = formattedGroups.filter(({ groupInformation }) => {
            const groupMatch =
                groupInformation.groupName?.toLowerCase().includes(lowerSearch) ||
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




export const getMyGroups = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, status } = req.body;

        if (!userId) {
            return response.error(res, 'User ID is required.');
        }

        // Map numeric requestStatus to actual DB values
        const requestStatusMap = {
            0: 'PENDING',
            1: 'ACCEPTED',
            2: 'REJECTED',
        };

        const requestAcceptValue = status !== null && status !== undefined
            ? requestStatusMap[status]
            : undefined;

        // Step 1: Get groupIds where user is either admin or invited
        const userGroupLinks = await prisma.groupUsersList.findMany({
            where: {
                OR: [
                    { adminUserId: userId },
                    {
                        invitedUserId: userId,
                        ...(requestAcceptValue ? { requestAccept: requestAcceptValue } : {}),
                    },
                ],
            },
            select: { groupId: true },
        });

        const groupIds = [...new Set(userGroupLinks.map(link => link.groupId))];

        if (groupIds.length === 0) {
            return response.success(res, 'No groups found.', { groups: [] });
        }

        const paginated = await paginate(
            req,
            prisma.group,
            {
                where: { id: { in: groupIds } },
                orderBy: { createsAt: 'desc' },
            },
            'groups'
        );

        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            return {
                ...user,
                categories: userCategoriesWithSubcategories,
                countryName: user.countryData?.name ?? null,
                stateName: user.stateData?.name ?? null,
                cityName: user.cityData?.name ?? null,
            };
        };

        const formattedGroups = await Promise.all(
            paginated.groups.map(async (group) => {
                const subCategories = group.subCategoryId?.length
                    ? await prisma.subCategory.findMany({
                        where: { id: { in: group.subCategoryId } },
                        include: { categoryInformation: true },
                    })
                    : [];

                const groupUsersList = await prisma.groupUsersList.findMany({
                    where: {
                        groupId: group.id,
                        ...(requestAcceptValue ? { requestAccept: requestAcceptValue } : {}),
                    },
                    include: {
                        adminUser: {
                            include: {
                                socialMediaPlatforms: true,
                                brandData: true,
                                countryData: true,
                                stateData: true,
                                cityData: true,
                            },
                        },
                        invitedUser: {
                            include: {
                                socialMediaPlatforms: true,
                                brandData: true,
                                countryData: true,
                                stateData: true,
                                cityData: true,
                            },
                        },
                        groupUser: true,
                    },
                });

                const groupMap = new Map<string, any>();

                for (const entry of groupUsersList) {
                    const key = `${entry.groupId}-${entry.groupUserId}`;

                    if (!groupMap.has(key)) {
                        const formattedAdminUser = await formatUserData(entry.adminUser);
                        groupMap.set(key, {
                            id: entry.id,
                            groupId: entry.groupId,
                            groupUserId: entry.groupUserId,
                            status: entry.status,
                            createdAt: entry.createdAt,
                            updatedAt: entry.updatedAt,
                            adminUser: formattedAdminUser,
                            invitedUsers: [],
                        });
                    }

                    if (entry.invitedUser) {
                        const formattedInvitedUser = await formatUserData(entry.invitedUser);
                        groupMap.get(key).invitedUsers.push({
                            ...formattedInvitedUser,
                            requestStatus: entry.requestAccept === 'ACCEPTED' ? 1
                                : entry.requestAccept === 'REJECTED' ? 2
                                : 0,
                        });
                    }
                }

                return {
                    groupInformation: {
                        ...group,
                        subCategoryId: subCategories,
                        groupData: Array.from(groupMap.values()),
                    },
                };
            })
        );

        paginated.groups = formattedGroups;

        return response.success(res, 'My groups fetched successfully!', paginated);
    } catch (error: any) {
        console.error('Error fetching groups:', error);
        return response.error(res, error.message);
    }
};




export const respondToGroupInvite = async (req: Request, res: Response): Promise<any> => {
    try {
        const { groupId, userId, accept } = req.body;

        if (!groupId || !userId || typeof accept !== 'boolean') {
            return response.error(res, 'groupId, userId and a boolean accept value are required.');
        }

        // Step 1: Validate invitation entry
        const existingEntry = await prisma.groupUsersList.findFirst({
            where: { groupId, invitedUserId: userId },
        });

        if (!existingEntry) {
            return response.error(res, 'Invitation not found for the user in this group.');
        }

        // Step 2: Update invitation status using string literals 'ACCEPTED' or 'REJECTED'
        const updatedEntry = await prisma.groupUsersList.update({
            where: { id: existingEntry.id },
            data: {
                requestAccept: accept ? 'ACCEPTED' : 'REJECTED',
                updatedAt: new Date(),
            },
        });

        if (!accept) {
            return response.success(res, 'Request rejected successfully.', null);
        }

        // Step 3: Fetch group info
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        if (!group) {
            return response.error(res, 'Group not found.');
        }

        // Step 4: Fetch subCategories with category info
        const subCategoriesWithCategory = group.subCategoryId?.length
            ? await prisma.subCategory.findMany({
                where: { id: { in: group.subCategoryId } },
                include: { categoryInformation: true },
            })
            : [];

        // Step 5: Fetch adminGroupUser (only one admin per group)
        const adminGroupUser = await prisma.groupUsers.findFirst({ where: { groupId } });
        if (!adminGroupUser) {
            return response.error(res, 'Admin GroupUsers entry not found.');
        }

        const adminUserId = adminGroupUser.userId;

        // Step 6: Fetch admin user with relations
        const adminUser = await prisma.user.findUnique({
            where: { id: adminUserId },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
        });

        // Step 7: Fetch all groupUsersList entries for this group
        const groupUsersListEntries = await prisma.groupUsersList.findMany({
            where: { groupId },
            include: {
                invitedUser: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                },
            },
        });

        // Helper: Map requestAccept string to numeric requestStatus
        const getNumericStatus = (requestAccept: string) => {
            switch (requestAccept) {
                case 'ACCEPTED': return 1;
                case 'REJECTED': return 2;
                default: return 0;
            }
        };

        // Helper: Format user data with categories and location
        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            return {
                ...user,
                categories: userCategoriesWithSubcategories,
                countryName: user.countryData?.name ?? null,
                stateName: user.stateData?.name ?? null,
                cityName: user.cityData?.name ?? null,
            };
        };

        // Step 8: Format admin user
        const formattedAdminUser = adminUser ? await formatUserData(adminUser) : null;

        // Step 9: Format invited users
        const formattedInvitedUsers = await Promise.all(
            groupUsersListEntries
                .filter(entry => entry.invitedUser)
                .map(async (entry) => {
                    const formatted = await formatUserData(entry.invitedUser);
                    return {
                        ...formatted,
                        requestStatus: getNumericStatus(entry.requestAccept),
                    };
                })
        );

        // Step 10: Return unified groupData format
        return response.success(res, 'Request accepted and group fetched successfully!', {
            groupInformation: {
                ...group,
                subCategoryId: subCategoriesWithCategory,
                groupData: [
                    {
                        id: updatedEntry.id,
                        groupId: updatedEntry.groupId,
                        groupUserId: updatedEntry.groupUserId,
                        status: updatedEntry.status,
                        createdAt: updatedEntry.createdAt,
                        updatedAt: updatedEntry.updatedAt,
                        adminUser: formattedAdminUser,
                        invitedUsers: formattedInvitedUsers,
                    },
                ],
            },
        });

    } catch (error) {
        console.error('respondToGroupInvite error:', error);
        return response.error(res, 'Something went wrong.');
    }
};




// list of request of all group Users
export const listGroupInvitesByStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const { groupId, status } = req.body;

        const statusMap = {
            0: 'PENDING',
            1: 'ACCEPTED',
            2: 'REJECTED',
        };

        const reverseStatusMap = {
            PENDING: 0,
            ACCEPTED: 1,
            REJECTED: 2,
        };

        if (!groupId || ![0, 1, 2].includes(status)) {
            return response.error(res, 'groupId and a valid numeric status (0, 1, 2) are required.');
        }

        const statusStr = statusMap[status];

        // Fetch the group
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        if (!group) {
            return response.error(res, 'Group not found.');
        }

        // Fetch subcategories
        const subCategories = group.subCategoryId?.length
            ? await prisma.subCategory.findMany({
                where: { id: { in: group.subCategoryId } },
                include: { categoryInformation: true },
            })
            : [];

        // Fetch all groupUsersList entries for this group
        const allGroupUsersList = await prisma.groupUsersList.findMany({
            where: { groupId },
            include: {
                adminUser: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                },
                invitedUser: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                },
                groupUser: true,
            },
        });

        // Helper: Format user with categories + location names
        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            return {
                ...user,
                categories: userCategoriesWithSubcategories,
                countryName: user.countryData?.name ?? null,
                stateName: user.stateData?.name ?? null,
                cityName: user.cityData?.name ?? null,
            };
        };

        const groupMap = new Map<string, any>();

        for (const entry of allGroupUsersList) {
            const key = `${entry.groupId}-${entry.groupUserId}`;

            if (!groupMap.has(key)) {
                const formattedAdminUser = await formatUserData(entry.adminUser);
                groupMap.set(key, {
                    id: entry.id,
                    groupId: entry.groupId,
                    groupUserId: entry.groupUserId,
                    status: entry.status,
                    createdAt: entry.createdAt,
                    updatedAt: entry.updatedAt,
                    adminUser: formattedAdminUser,
                    invitedUsers: [],
                });
            }

            // Only include invited users who match requestAccept === mapped status string
            if (entry.requestAccept === statusStr && entry.invitedUser) {
                const formattedInvitedUser = await formatUserData(entry.invitedUser);
                groupMap.get(key).invitedUsers.push({
                    ...formattedInvitedUser,
                    requestStatus: reverseStatusMap[entry.requestAccept] ?? 0,
                });
            }
        }

        const responseGroup = {
            groupInformation: {
                ...group,
                subCategoryId: subCategories,
                groupData: Array.from(groupMap.values()),
            },
        };

        return response.success(res, 'Invite list retrieved.', responseGroup);

    } catch (error) {
        console.error('listGroupInvitesByStatus error:', error);
        return response.error(res, 'Something went wrong.');
    }
};



export const addMemberToGroup = async (req: Request, res: Response): Promise<any> => {
    try {
        const { groupId, userId, invitedUserId = [] } = req.body;

        if (!groupId || !userId || !Array.isArray(invitedUserId) || invitedUserId.length === 0) {
            return response.error(res, 'groupId, userId, and invitedUserId array are required.');
        }

        // Step 1: Validate group
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        if (!group) return response.error(res, 'Invalid groupId. Group does not exist.');

        // Step 2: Verify the user is the group admin (status: true)
        const isAdmin = await prisma.groupUsers.findFirst({
            where: {
                groupId,
                userId,
                status: true, // only admin has status: true
            },
        });

        if (!isAdmin) {
            return response.error(res, 'You are not authorized to add members to this group.');
        }

        // Step 3: Fetch and validate admin user data
        const adminUser = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
        });
        if (!adminUser) return response.error(res, 'Invalid userId. User does not exist.');

        // Step 4: Fetch and validate invited users
        const invitedUsers = await prisma.user.findMany({
            where: { id: { in: invitedUserId } },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
        });

        const validInvitedIds = invitedUsers.map(u => u.id);
        const invalidIds = invitedUserId.filter(id => !validInvitedIds.includes(id));
        if (invalidIds.length > 0) {
            return response.error(res, `Invalid invitedUserId(s): ${invalidIds.join(', ')}`);
        }

        // Helper: Convert request status to numeric code
        const getNumericStatus = (requestStatus: string) => {
            switch (requestStatus) {
                case 'PENDING':
                    return 0;
                case 'ACCEPTED':
                    return 1;
                case 'REJECTED':
                    return 2;
                default:
                    return 0; // Default to pending
            }
        };

        // Step 5: Get or create GroupUsers entry for admin
        let adminGroupUser = await prisma.groupUsers.findFirst({
            where: { groupId, userId },
        });

        if (!adminGroupUser) {
            adminGroupUser = await prisma.groupUsers.create({
                data: {
                    groupId,
                    userId,
                    invitedUserId: validInvitedIds,
                    status: true,
                },
            });
        } else {
            const updatedInvitedUserIds = Array.from(new Set([
                ...(adminGroupUser.invitedUserId || []),
                ...validInvitedIds,
            ]));

            adminGroupUser = await prisma.groupUsers.update({
                where: { id: adminGroupUser.id },
                data: { invitedUserId: updatedInvitedUserIds },
            });
        }

        // Step 6: Create GroupUsersList entries if not already existing
        await Promise.all(validInvitedIds.map(async (invitedId) => {
            const exists = await prisma.groupUsersList.findFirst({
                where: {
                    groupId,
                    invitedUserId: invitedId,
                    groupUserId: adminGroupUser!.id,
                },
            });

            if (!exists) {
                await prisma.groupUsersList.create({
                    data: {
                        groupId,
                        groupUserId: adminGroupUser!.id,
                        adminUserId: userId,
                        invitedUserId: invitedId,
                        status: false,
                        requestAccept: RequestStatus.PENDING,
                    },
                });
            }
        }));

        // Step 7: Fetch subCategory info with category
        const subCategoriesWithCategory = await prisma.subCategory.findMany({
            where: { id: { in: group.subCategoryId } },
            include: { categoryInformation: true },
        });

        // Step 8: Format user data
        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

            const country = user.countryId ? await prisma.country.findUnique({
                where: { id: user.countryId }, select: { name: true }
            }) : null;
            const state = user.stateId ? await prisma.state.findUnique({
                where: { id: user.stateId }, select: { name: true }
            }) : null;
            const city = user.cityId ? await prisma.city.findUnique({
                where: { id: user.cityId }, select: { name: true }
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

        const formattedAdminUser = await formatUserData(adminUser);

        // Step 9: Fetch all invited users for this group with their request status
        const allGroupInvitedUsers = await prisma.groupUsersList.findMany({
            where: { groupId },
            include: {
                invitedUser: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                },
            },
        });

        const formattedInvitedUsers = await Promise.all(
            allGroupInvitedUsers.map(async (entry) => {
                const formattedUser = await formatUserData(entry.invitedUser);
                return {
                    ...formattedUser,
                    requestStatus: getNumericStatus(entry.requestAccept || 'PENDING'),
                };
            })
        );

        // Step 10: Final response
        return response.success(res, 'Group updated successfully!', {
            groupInformation: {
                ...group,
                subCategoryId: subCategoriesWithCategory,
                adminUser: formattedAdminUser,
                invitedUsers: formattedInvitedUsers,
            },
        });

    } catch (error: any) {
        console.error('Add member error:', error);
        return response.error(res, error.message);
    }
};



// list of request of Users from Group
export const listUserGroupInvitesByStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, status } = req.body;

        if (!userId) {
            return response.error(res, 'User ID is required.');
        }

        const requestStatusMap = {
            0: 'PENDING',
            1: 'ACCEPTED',
            2: 'REJECTED',
        };

        const requestAcceptValue = status !== null && status !== undefined
            ? requestStatusMap[status]
            : undefined;

        // Step 1: Get groupIds where user is invited
        const userGroupLinks = await prisma.groupUsersList.findMany({
            where: {
                invitedUserId: userId,
                ...(requestAcceptValue ? { requestAccept: requestAcceptValue } : {}),
            },
            select: { groupId: true },
        });

        const groupIds = [...new Set(userGroupLinks.map(link => link.groupId))];

        if (groupIds.length === 0) {
            return response.success(res, 'No groups found.', { groups: [] });
        }

        const paginated = await paginate(
            req,
            prisma.group,
            {
                where: { id: { in: groupIds } },
                orderBy: { createsAt: 'desc' },
            },
            'groups'
        );

        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            return {
                ...user,
                categories: userCategoriesWithSubcategories,
                countryName: user.countryData?.name ?? null,
                stateName: user.stateData?.name ?? null,
                cityName: user.cityData?.name ?? null,
            };
        };

        const formattedGroups = await Promise.all(
            paginated.groups.map(async (group) => {
                const subCategories = group.subCategoryId?.length
                    ? await prisma.subCategory.findMany({
                        where: { id: { in: group.subCategoryId } },
                        include: { categoryInformation: true },
                    })
                    : [];

                const groupUsersList = await prisma.groupUsersList.findMany({
                    where: {
                        groupId: group.id,
                        ...(requestAcceptValue ? { requestAccept: requestAcceptValue } : {}),
                    },
                    include: {
                        adminUser: {
                            include: {
                                socialMediaPlatforms: true,
                                brandData: true,
                                countryData: true,
                                stateData: true,
                                cityData: true,
                            },
                        },
                        invitedUser: {
                            include: {
                                socialMediaPlatforms: true,
                                brandData: true,
                                countryData: true,
                                stateData: true,
                                cityData: true,
                            },
                        },
                        groupUser: true,
                    },
                });

                const groupMap = new Map<string, any>();

                for (const entry of groupUsersList) {
                    const key = `${entry.groupId}-${entry.groupUserId}`;

                    if (!groupMap.has(key)) {
                        const formattedAdminUser = await formatUserData(entry.adminUser);
                        groupMap.set(key, {
                            id: entry.id,
                            groupId: entry.groupId,
                            groupUserId: entry.groupUserId,
                            status: entry.status,
                            createdAt: entry.createdAt,
                            updatedAt: entry.updatedAt,
                            adminUser: formattedAdminUser,
                            invitedUsers: [],
                        });
                    }

                    if (entry.invitedUser) {
                        const formattedInvitedUser = await formatUserData(entry.invitedUser);
                        groupMap.get(key).invitedUsers.push({
                            ...formattedInvitedUser,
                            requestStatus: entry.requestAccept === 'ACCEPTED' ? 1
                                : entry.requestAccept === 'REJECTED' ? 2
                                : 0,
                        });
                    }
                }

                return {
                    groupInformation: {
                        ...group,
                        subCategoryId: subCategories,
                        groupData: Array.from(groupMap.values()),
                    },
                };
            })
        );

        paginated.groups = formattedGroups;

        return response.success(res, 'User group invites fetched successfully!', paginated);
    } catch (error: any) {
        console.error('Error fetching user group invites:', error);
        return response.error(res, error.message);
    }
};

