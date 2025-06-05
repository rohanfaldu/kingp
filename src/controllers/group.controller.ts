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
                // UserDetail: true,
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
                    // UserDetail: true,
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
                },
            });
        }));

        // Step 4: Format response data
        const formattedAdminUser = adminUser ? await formatUserData(adminUser) : null;
        const formattedInvitedUsers = await Promise.all(invitedUsers.map(u => formatUserData(u)));

        // Optionally fetch groupUsers and groupUsersList data for response
        const groupUsersData = await prisma.groupUsers.findMany({
            where: { groupId: newGroup.id },
            include: {
                groupUserData: true, // user info for admin and others
            },
        });
        const groupUsersListData = await prisma.groupUsersList.findMany({
            where: { groupId: newGroup.id },
            include: {
                adminUser: true,
                invitedUser: true,
            },
        });

        return response.success(res, 'Group Created successfully!', {
            groupInformation: {
                ...newGroup,
                subCategoryId: subCategoriesWithCategory,
                adminUser: formattedAdminUser,
                invitedUsers: formattedInvitedUsers,
                // groupUsers: groupUsersData,
                // groupUsersList: groupUsersListData,
                // totalInvitedUsers: invitedUserId.length,
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
        const { id } = req.params;
        const { status } = req.body;

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
            const { password: _, ...userData } = user;
            return {
                ...userData,
                categories: userCategoriesWithSubcategories,
                countryName: country?.name ?? null,
                stateName: state?.name ?? null,
                cityName: city?.name ?? null,
            };
        };

        // Get all GroupUsersList entries for admin info (like in getAllGroups)
        const allGroupUserEntries = await prisma.groupUsersList.findMany({
            where: { groupId: id },
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
            },
        });

        // Filter invited users based on requestAccepted (like in getAllGroups)
        const filteredGroupUserEntries = await prisma.groupUsersList.findMany({
            where: {
                groupId: id,
                ...(typeof status === 'boolean' ? { requestAccept: status } : {}),
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

        const groupMap = new Map<string, any>();

        // First, create entries with admin users (like in getAllGroups)
        for (const entry of allGroupUserEntries) {
            const key = `${entry.groupId}-${entry.groupUserId}`;
            if (!groupMap.has(key)) {
                const formattedAdminUser = entry.adminUser ? await formatUserData(entry.adminUser) : null;
                groupMap.set(key, {
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
        }

        // Add invited users to grouped entries (like in getAllGroups)
        for (const entry of filteredGroupUserEntries) {
            const key = `${entry.groupId}-${entry.groupUserId}`;
            if (entry.invitedUser && groupMap.has(key)) {
                const formattedInvitedUser = await formatUserData(entry.invitedUser);
                groupMap.get(key).invitedUsers.push(formattedInvitedUser);
            }
        }

        const formattedResponse = {
            ...group,
            subCategoryId: subCategoriesWithCategory,
            groupData: Array.from(groupMap.values()),
        };

        // Wrap the response in groupInformation to match getAllGroups structure
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

        // Step 1: Match group IDs by admin/invited user name
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

        // Step 2: Fetch groups
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

        // Helper: Format user data
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

        // Step 3: Format group data
        const formattedGroups = await Promise.all(allGroups.map(async (group) => {
            const subCategoriesWithCategory = group.subCategoryId?.length
                ? await prisma.subCategory.findMany({
                    where: { id: { in: group.subCategoryId } },
                    include: { categoryInformation: true },
                })
                : [];

            // Get all GroupUsersList entries for admin info
            const allGroupUserEntries = await prisma.groupUsersList.findMany({
                where: { groupId: group.id },
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
                },
            });

            // Filter invited users based on requestAccepted
            const filteredGroupUserEntries = await prisma.groupUsersList.findMany({
                where: {
                    groupId: group.id,
                    ...(typeof status === 'boolean' ? { requestAccept: status } : {}),
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

            const grouped = new Map<string, any>();

            for (const entry of allGroupUserEntries) {
                const key = `${entry.groupId}-${entry.groupUserId}`;
                if (!grouped.has(key)) {
                    const formattedAdminUser = entry.adminUser ? await formatUserData(entry.adminUser) : null;
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
            }

            // Add invited users to grouped entries
            for (const entry of filteredGroupUserEntries) {
                const key = `${entry.groupId}-${entry.groupUserId}`;
                if (entry.invitedUser && grouped.has(key)) {
                    const formattedInvitedUser = await formatUserData(entry.invitedUser);
                    grouped.get(key).invitedUsers.push(formattedInvitedUser);
                }
            }

            return {
                groupInformation: {
                    ...group,
                    subCategoryId: subCategoriesWithCategory,
                    groupData: Array.from(grouped.values()),
                },
            };
        }));

        // Step 4: Filter again based on search
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

        // Step 5: Paginate
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

        let requestAcceptCondition: boolean | undefined;

        if (status === true) {
            requestAcceptCondition = true;
        } else if (status === false) {
            requestAcceptCondition = false;
        }

        // Step 1: Get all group IDs where the user is either admin or invited with the correct requestAccept status
        const userGroupLinks = await prisma.groupUsersList.findMany({
            where: {
                OR: [
                    { adminUserId: userId },
                    {
                        invitedUserId: userId,
                        ...(typeof requestAcceptCondition === 'boolean' && { requestAccept: requestAcceptCondition }),
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

        // Helper to format user
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
                        ...(typeof requestAcceptCondition === 'boolean' && { requestAccept: requestAcceptCondition }),
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
                        groupMap.get(key).invitedUsers.push(formattedInvitedUser);
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

        // Step 2: Update invitation status
        await prisma.groupUsersList.update({
            where: { id: existingEntry.id },
            data: { requestAccept: accept, updatedAt: new Date() },
        });

        if (!accept) {
            return response.success(res, 'Request rejected successfully.', null);
        }

        // ✅ Step 3: Fetch group data (only the provided groupId)
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        if (!group) {
            return response.error(res, 'Group not found.');
        }

        // Step 4: Fetch subcategories with category
        const subCategories = group.subCategoryId?.length
            ? await prisma.subCategory.findMany({
                where: { id: { in: group.subCategoryId } },
                include: { categoryInformation: true },
            })
            : [];

        // Step 5: Get all related groupUsersList entries for this group
        const groupUsersList = await prisma.groupUsersList.findMany({
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
            },
        });

        // Helper to format user
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

        // Step 6: Prepare admin and all invited users
        let adminUserFormatted: any = null;
        const invitedUsersMap = new Map<string, any>();

        for (const entry of groupUsersList) {
            if (!adminUserFormatted) {
                adminUserFormatted = await formatUserData(entry.adminUser);
            }

            if (entry.invitedUser && !invitedUsersMap.has(entry.invitedUser.id)) {
                const formattedInvitedUser = await formatUserData(entry.invitedUser);
                invitedUsersMap.set(entry.invitedUser.id, formattedInvitedUser);
            }
        }

        // ✅ Step 7: Return response in same structure as groupCreate
        return response.success(res, 'Request accepted and group fetched successfully!', {
            groupInformation: {
                ...group,
                subCategoryId: subCategories,
                adminUser: adminUserFormatted,
                invitedUsers: Array.from(invitedUsersMap.values()),
            },
        });

    } catch (error) {
        console.error('respondToGroupInvite error:', error);
        return response.error(res, 'Something went wrong.');
    }
};




export const listGroupInvitesByStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const { groupId, status } = req.body;

        if (!groupId || typeof status !== 'boolean') {
            return response.error(res, 'groupId and a valid boolean status are required.');
        }

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

        // Fetch ALL groupUsersList entries for admin info
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

        // Format helper
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

            // Only include invited users who match `requestAccept === status`
            if (entry.requestAccept === status && entry.invitedUser) {
                const formattedInvitedUser = await formatUserData(entry.invitedUser);
                groupMap.get(key).invitedUsers.push(formattedInvitedUser);
            }
        }

        const responseGroup = {
            groupInformation: {
                ...group,
                subCategoryId: subCategories,
                groupData: Array.from(groupMap.values()),
            },
        };

        return response.success(res, 'Invite list retrieved.',responseGroup );

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

        // Step 9: Fetch all invited users for this group
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
                return await formatUserData(entry.invitedUser);
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

