import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { IGroup } from '../interfaces/group.interface';
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { resolveStatus } from '../utils/commonFunction'
import { RequestStatus } from '../enums/userType.enum';
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { paginate } from '../utils/pagination';
import admin from 'firebase-admin';
import { sendFCMNotificationToUsers } from '../utils/notification';


const prisma = new PrismaClient();



export const groupCreate = async (req: Request, res: Response): Promise<any> => {
    try {
        const groupData: IGroup = req.body;

        const {
            userId,
            invitedUserId = [],
            socialMediaPlatform = [],
            subCategoryId = [],
            ...groupFields
        } = groupData;

        // Check: Limit group creation to 5 per user
        const userGroupCount = await prisma.groupUsers.count({
            where: {
                userId,
                status: true,
            },
        });

        if (userGroupCount >= 5) {
            return response.error(res, 'User can create a maximum of 5 groups only.');
        }

        // Check: Group name uniqueness
        const existingGroup = await prisma.group.findFirst({
            where: { groupName: groupData.groupName },
        });
        if (existingGroup) {
            return response.error(res, 'Group with this name already exists.');
        }

        const status = resolveStatus(groupData.status);

        //  Check: Admin user exists
        const adminUser = await prisma.user.findUnique({
            where: { id: userId, status: true },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
        });

        if (!adminUser) {
            return response.error(res, 'Admin user does not exist.');
        }

        // Fetch subCategories with parent category
        const subCategoriesWithCategory = await prisma.subCategory.findMany({
            where: { id: { in: subCategoryId } },
            include: { categoryInformation: true },
        });

        //  Fetch invited users
        const invitedUsers = invitedUserId.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: invitedUserId }, status: true },
                include: {
                    socialMediaPlatforms: true,
                    brandData: true,
                    countryData: true,
                    stateData: true,
                    cityData: true,
                },
            })
            : [];

        //  Step 1: Create the group
        const newGroup = await prisma.group.create({
            data: {
                ...groupFields,
                subCategoryId,
                socialMediaPlatform,
                status,
            },
        });

        //  Step 2: Create GroupUsers entry for admin
        const adminGroupUser = await prisma.groupUsers.create({
            data: {
                groupId: newGroup.id,
                userId: userId,
                invitedUserId: invitedUserId,
                status: true,
            },
        });

        //  Step 3: Create GroupUsersList entries for invited users
        await Promise.all(invitedUserId.map(async (invitedId) => {
            await prisma.groupUsersList.create({
                data: {
                    groupId: newGroup.id,
                    groupUserId: adminGroupUser.id,
                    adminUserId: userId,
                    invitedUserId: invitedId,
                    status: false,
                    requestAccept: RequestStatus.PENDING,
                },
            });
        }));

        //  Step 4: Re-fetch GroupUsersList entries for response mapping
        const updatedGroupUsersListEntries = await prisma.groupUsersList.findMany({
            where: {
                groupId: newGroup.id,
                adminUserId: userId,
                invitedUserId: { in: invitedUserId },
            },
        });

        //  Send FCM to invited users
        await sendFCMNotificationToUsers(
            invitedUsers,
            'New group created!',
            `You've been invited to join the group: ${newGroup.groupName}`,
            'GROUP_INVITE'
        );

        //  Helper: Numeric requestStatus
        const getNumericStatus = (requestStatus: string) => {
            switch (requestStatus) {
                case 'PENDING': return 0;
                case 'ACCEPTED': return 1;
                case 'REJECTED': return 2;
                default: return 0;
            }
        };

        //  Helper: Format user data
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
                socialMediaPlatforms: userData.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
                categories: userCategoriesWithSubcategories,
                countryName: country?.name ?? null,
                stateName: state?.name ?? null,
                cityName: city?.name ?? null,
            };
        };

        //  Format admin and invited users
        const formattedAdminUser = await formatUserData(adminUser);

        const formattedInvitedUsers = await Promise.all(invitedUsers.map(async (user) => {
            const formattedUser = await formatUserData(user);
            const groupUserListEntry = updatedGroupUsersListEntries.find(entry => entry.invitedUserId === user.id);

            return {
                ...formattedUser,
                requestStatus: groupUserListEntry ? getNumericStatus(groupUserListEntry.requestAccept) : 0,
            };
        }));

        //  Final response
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
            where: {
                id: id,
                status: true,
            },
            include: {
                groupData: true,
            },
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
                            requestAccept: RequestStatus.PENDING, // set to PENDING
                        },
                    });
                })
            );
        }

        // 4. Fetch updated group
        const finalUpdatedGroup = await prisma.group.findFirst({
            where: { id, status: true, },
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
                socialMediaPlatforms: userData.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
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
                    where: { id: groupUser.userId, status: true },
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
                        where: { id: { in: invitedUserIds }, status: true },
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

        const group = await prisma.group.findFirst({
            where: { id, status: true, },
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
                socialMediaPlatforms: userData.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
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
                where: { id: groupUser.userId, status: true },
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

            const activeInvitedEntries = invitedEntries.filter(
                (entry) => entry.invitedUser?.status === true
            );

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
                                : status,
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

        if (!isUuid(groupId)) {
            return response.error(res, 'Invalid UUID format');
        }

        if (!groupId) {
            return response.error(res, 'GroupId is required.');
        }

        // Check if group exists
        const existingGroup = await prisma.group.findFirst({
            where: {
                id: groupId,
                status: true, //  Only fetch active groups
            },
        });

        if (!existingGroup) {
            return response.error(res, 'Group not found with this Group ID.');
        }

        const now = new Date();

        // Soft delete in Group table
        await prisma.group.update({
            where: { id: groupId },
            data: {
                status: false,
                updatedAt: now,
            },
        });

        // Soft delete related GroupUsers
        await prisma.groupUsers.updateMany({
            where: { groupId },
            data: {
                status: false,
                updatedAt: now,
            },
        });

        // Soft delete related GroupUsersList
        await prisma.groupUsersList.updateMany({
            where: { groupId },
            data: {
                status: false,
                updatedAt: now,
            },
        });

        await prisma.orders.updateMany({
            where: {
                groupId: groupId,
                NOT: {
                    status: 'COMPLETED',
                },
            },
            data: {
                status: 'DECLINED',
            },
        });


        return response.success(res, 'Group deleted successfully!', null);

    } catch (error: any) {
        console.error('Delete group error:', error);
        return response.error(res, error.message || 'Failed to delete group');
    }
};



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
                status: true,
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
                socialMediaPlatforms: userData.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
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
                    where: { id: groupUser.userId, status: true },
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
                                    : status,
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
        const updatedEntry = await prisma.groupUsersList.update({
            where: { id: existingEntry.id },
            data: {
                requestAccept: accept ? 'ACCEPTED' : 'REJECTED',
                updatedAt: new Date(),
            },
        });

        // Step 3: Fetch group info
        const group = await prisma.group.findFirst({ where: { id: groupId, status: true, } });
        if (!group) {
            return response.error(res, 'Group not found.');
        }

        // Step 4: Send FCM notification to admin
        const adminGroupUser = await prisma.groupUsers.findFirst({ where: { groupId } });
        if (!adminGroupUser) {
            return response.error(res, 'Admin GroupUsers entry not found.');
        }

        const adminUser = await prisma.user.findUnique({ where: { id: adminGroupUser.userId } });
        const invitedUser = await prisma.user.findUnique({ where: { id: userId } });

        const displayName = invitedUser?.name || invitedUser?.name || 'A user';
        const actionStatus = accept ? 'accepted' : 'rejected';
        const notifTitle = `Group invitation ${actionStatus}`;
        const notifMessage = `User ${displayName} has ${actionStatus} your invitation to join group: ${group.groupName}`;

        if (adminUser?.fcmToken) {
            await sendFCMNotificationToUsers(
                [{ id: adminUser.id, fcmToken: adminUser.fcmToken }],
                notifTitle,
                notifMessage,
                'GROUP_INVITE_RESPONSE'
            );
        }

        // Optional: Notify invited user of successful join
        if (accept && invitedUser?.fcmToken) {
            await sendFCMNotificationToUsers(
                [{ id: invitedUser.id, fcmToken: invitedUser.fcmToken }],
                'You’ve joined a group!',
                `You have successfully joined the group: ${group.groupName}`,
                'GROUP_JOIN_CONFIRM'
            );
        }

        if (!accept) {
            return response.success(res, 'Request rejected successfully.', null);
        }

        // Step 5: Fetch subcategories with categories
        const subCategoriesWithCategory = group.subCategoryId?.length
            ? await prisma.subCategory.findMany({
                where: { id: { in: group.subCategoryId } },
                include: { categoryInformation: true },
            })
            : [];

        // Step 6: Get formatted admin user
        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            return {
                ...user,
                socialMediaPlatforms: user.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
                categories: userCategoriesWithSubcategories,
                countryName: user.countryData?.name ?? null,
                stateName: user.stateData?.name ?? null,
                cityName: user.cityData?.name ?? null,
            };
        };

        const formattedAdminUser = adminUser
            ? await formatUserData(
                await prisma.user.findUnique({
                    where: { id: adminUser.id, status: true },
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                })
            )
            : null;

        // Step 7: Get group members
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

        const getNumericStatus = (requestAccept: string) => {
            switch (requestAccept) {
                case 'ACCEPTED': return 1;
                case 'REJECTED': return 2;
                default: return 0;
            }
        };

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

        // ******************* BADGE : 7 START ***************************//
        const participatingGroups = await prisma.groupUsersList.findMany({
            where: {
                invitedUserId: userId,
                requestAccept: 'ACCEPTED',
            },
            select: {
                groupId: true,
            },
            distinct: ['groupId'],
        });

        if (participatingGroups.length >= 5) {
            const badge = await prisma.badges.findFirst({
                where: { type: '7' },
                select: { id: true },
            });

            const alreadyAssigned = await prisma.userBadges.findFirst({
                where: {
                    userId,
                    badgeId: badge?.id,
                },
            });

            if (badge && !alreadyAssigned) {
                await prisma.userBadges.create({
                    data: {
                        userId,
                        badgeId: badge.id,
                    },
                });
            }
        }


        // Step 8: Return response
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
        const group = await prisma.group.findFirst({ where: { id: groupId, status: true, } });
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
                socialMediaPlatforms: user.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
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

        const group = await prisma.group.findFirst({ where: { id: groupId, status: true, } });
        if (!group) return response.error(res, 'Invalid groupId. Group does not exist.');

        const isAdmin = await prisma.groupUsers.findFirst({
            where: { groupId, userId, status: true },
        });
        if (!isAdmin) {
            return response.error(res, 'You are not authorized to add members to this group.');
        }

        const adminUser = await prisma.user.findUnique({
            where: { id: userId, status: true },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
        });
        if (!adminUser) return response.error(res, 'Invalid userId. User does not exist.');

        const invitedUsers = await prisma.user.findMany({
            where: { id: { in: invitedUserId }, status: true },
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

        const getNumericStatus = (requestStatus: string) => {
            switch (requestStatus) {
                case 'PENDING': return 0;
                case 'ACCEPTED': return 1;
                case 'REJECTED': return 2;
                default: return 0;
            }
        };

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

        const alreadyPendingInvites: string[] = [];
        const alreadyAcceptedInvites: string[] = [];
        const newlyInvited: string[] = [];

        await Promise.all(validInvitedIds.map(async (invitedId) => {
            const existingEntry = await prisma.groupUsersList.findFirst({
                where: {
                    groupId,
                    invitedUserId: invitedId,
                    groupUserId: adminGroupUser!.id,
                },
            });

            if (existingEntry) {
                if (existingEntry.requestAccept === 'REJECTED') {
                    await prisma.groupUsersList.update({
                        where: { id: existingEntry.id },
                        data: {
                            requestAccept: 'PENDING',
                            status: false,
                            updatedAt: new Date(),
                        },
                    });
                    newlyInvited.push(invitedId);
                } else if (existingEntry.requestAccept === 'PENDING') {
                    alreadyPendingInvites.push(invitedId);
                } else if (existingEntry.requestAccept === 'ACCEPTED') {
                    alreadyAcceptedInvites.push(invitedId);
                }
            } else {
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
                newlyInvited.push(invitedId);
            }
        }));

        const subCategoriesWithCategory = await prisma.subCategory.findMany({
            where: { id: { in: group.subCategoryId } },
            include: { categoryInformation: true },
        });

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
                socialMediaPlatforms: userData.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
                categories: userCategoriesWithSubcategories,
                countryName: country?.name ?? null,
                stateName: state?.name ?? null,
                cityName: city?.name ?? null,
            };
        };

        //  Send FCM notification to each invited user
        await sendFCMNotificationToUsers(
            invitedUsers,
            'You’ve been invited to a group!',
            `You've been invited to join the group: ${group.groupName}`,
            'GROUP_INVITE'
        );

        const formattedAdminUser = await formatUserData(adminUser);

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

        // Final message
        let message = 'Group updated successfully!';
        if (newlyInvited.length > 0) {
            message += ` Invites sent to: ${newlyInvited.join(', ')}.`;
        }
        if (alreadyPendingInvites.length > 0) {
            message += ` These users already have a pending invite: ${alreadyPendingInvites.join(', ')}.`;
        }
        if (alreadyAcceptedInvites.length > 0) {
            message += ` These users have already accepted the invite: ${alreadyAcceptedInvites.join(', ')}.`;
        }

        return response.success(res, message, {
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
                socialMediaPlatforms: user.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
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




export const getMyGroups = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, status, search, page = 1, limit = 10 } = req.body;

        const currentPage = parseInt(page.toString()) || 1;
        const itemsPerPage = parseInt(limit.toString()) || 10;
        const skip = (currentPage - 1) * itemsPerPage;

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
            return response.success(res, 'No groups found.', {
                pagination: {
                    total: 0,
                    page: currentPage,
                    limit: itemsPerPage,
                    totalPages: 0,
                },
                users: [],
            });
        }

        // Fetch all matching groups (before pagination)
        const allGroups = await prisma.group.findMany({
            where: {
                id: { in: groupIds },
                status: true,
            },
            orderBy: { createsAt: 'desc' },
        });

        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            return {
                ...user,
                socialMediaPlatforms: user.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
                categories: userCategoriesWithSubcategories,
                countryName: user.countryData?.name ?? null,
                stateName: user.stateData?.name ?? null,
                cityName: user.cityData?.name ?? null,
            };
        };

        const matchesSearch = (text: string, searchTerm: string): boolean => {
            if (!text || !searchTerm) return false;
            return text.toLowerCase().includes(searchTerm.toLowerCase());
        };

        const formattedGroups = await Promise.all(
            allGroups.map(async (group) => {
                const subCategories = group.subCategoryId?.length
                    ? await prisma.subCategory.findMany({
                        where: { id: { in: group.subCategoryId } },
                        include: { categoryInformation: true },
                    })
                    : [];

                const groupUsersList = await prisma.groupUsersList.findMany({
                    where: {
                        groupId: group.id
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
                        console.log(status, '>>>>>>>>>> requestAcceptValue');
                        const group = groupMap.get(key);
                        if (requestAcceptValue !== undefined) {
                            const alreadyHasAccepted = group.invitedUsers.some(user => user.requestStatus === requestAcceptValue);
                            if (!alreadyHasAccepted && entry.requestAccept === requestAcceptValue) {
                                group.invitedUsers.push({
                                    ...formattedInvitedUser,
                                    requestStatus: entry.requestAccept === 'ACCEPTED' ? 1
                                        : entry.requestAccept === 'REJECTED' ? 2
                                            : 0,
                                });
                            }
                        } else {
                            group.invitedUsers.push({
                                ...formattedInvitedUser,
                                requestStatus: entry.requestAccept === 'ACCEPTED' ? 1
                                    : entry.requestAccept === 'REJECTED' ? 2
                                        : 0,
                            });
                        }

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

        // Apply search filter
        let finalGroups = formattedGroups;

        if (search && search.trim()) {
            const searchTerm = search.trim();
            finalGroups = formattedGroups.filter(item => {
                const group = item.groupInformation;

                if (
                    matchesSearch(group.groupName, searchTerm) ||
                    matchesSearch(group.description, searchTerm) ||
                    matchesSearch(group.title, searchTerm) ||
                    matchesSearch(group.groupTitle, searchTerm)
                ) return true;

                if (group.subCategoryId?.some(subCat =>
                    matchesSearch(subCat.name, searchTerm) ||
                    matchesSearch(subCat.categoryInformation?.name, searchTerm)
                )) return true;

                return group.groupData?.some(groupDataItem => {
                    const adminUser = groupDataItem.adminUser;
                    if (adminUser && (
                        matchesSearch(adminUser.name, searchTerm) ||
                        matchesSearch(adminUser.email, searchTerm) ||
                        matchesSearch(adminUser.username, searchTerm) ||
                        matchesSearch(adminUser.phone, searchTerm) ||
                        matchesSearch(adminUser.countryName, searchTerm) ||
                        matchesSearch(adminUser.stateName, searchTerm) ||
                        matchesSearch(adminUser.cityName, searchTerm) ||
                        matchesSearch(adminUser.brandData?.name, searchTerm)
                    )) return true;

                    return groupDataItem.invitedUsers?.some(invitedUser =>
                        matchesSearch(invitedUser.name, searchTerm) ||
                        matchesSearch(invitedUser.email, searchTerm) ||
                        matchesSearch(invitedUser.username, searchTerm) ||
                        matchesSearch(invitedUser.phone, searchTerm) ||
                        matchesSearch(invitedUser.countryName, searchTerm) ||
                        matchesSearch(invitedUser.stateName, searchTerm) ||
                        matchesSearch(invitedUser.cityName, searchTerm) ||
                        matchesSearch(invitedUser.brandData?.name, searchTerm)
                    );
                });
            });
        }

        // Final pagination on filtered result
        const paginatedFilteredGroups = finalGroups.slice(skip, skip + itemsPerPage);

        const finalPaginatedResponse = {
            pagination: {
                total: finalGroups.length,
                page: currentPage,
                limit: itemsPerPage,
                totalPages: Math.ceil(finalGroups.length / itemsPerPage),
            },
            users: paginatedFilteredGroups,
        };

        return response.success(res, 'My groups fetched successfully!', finalPaginatedResponse);
    } catch (error: any) {
        console.error('Error fetching groups:', error);
        return response.error(res, error.message);
    }
};




export const deleteMemberFromGroup = async (req: Request, res: Response): Promise<any> => {
    try {
        const { groupId, userId, invitedUserId } = req.body;

        // Validate required parameters
        if (!groupId || !userId) {
            return response.error(res, 'groupId and userId are required.');
        }

        // Verify group exists
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        if (!group) {
            return response.error(res, 'Invalid groupId. Group does not exist.');
        }

        // Check if user is admin of the group
        const adminCheck = await prisma.groupUsers.findFirst({
            where: { groupId, userId },
        });

        const isAdmin = !!adminCheck;

        if (!isAdmin) {
            // INVITED USER LEAVING THE GROUP
            console.log(`Invited user ${userId} is leaving group ${groupId}`);

            // Find the admin's GroupUsers entry that contains this invited user
            const groupUserEntry = await prisma.groupUsers.findFirst({
                where: {
                    groupId,
                    invitedUserId: {
                        has: userId,
                    },
                },
            });

            if (!groupUserEntry) {
                return response.error(res, 'Group user entry not found.');
            }

            // Remove user from the invitedUserId array
            const updatedInvitedUserIds = groupUserEntry.invitedUserId.filter((id) => id !== userId);

            await prisma.groupUsers.update({
                where: { id: groupUserEntry.id },
                data: {
                    invitedUserId: updatedInvitedUserIds,
                },
            });

            // Delete the corresponding GroupUsersList entry
            await prisma.groupUsersList.deleteMany({
                where: {
                    groupId,
                    groupUserId: groupUserEntry.id,
                    invitedUserId: userId,
                },
            });

            console.log(`Invited user ${userId} successfully left group ${groupId}`);

        } else {
            // ADMIN ACTIONS
            if (!invitedUserId) {
                // ADMIN LEAVING THE GROUP - Need to promote or cleanup
                console.log(`Admin ${userId} is leaving group ${groupId}`);

                // Find next user to promote as admin
                const nextAdminEntry = await prisma.groupUsersList.findFirst({
                    where: {
                        groupId,
                        requestAccept: 'ACCEPTED',
                    },
                    orderBy: { updatedAt: 'asc' },
                });

                if (!nextAdminEntry) {
                    // No accepted users found - cleanup all group data
                    console.log(`No accepted users found for group ${groupId}. Cleaning up group.`);

                    const currentAdminData = await prisma.groupUsers.findFirst({
                        where: { groupId, userId }
                    });

                    if (currentAdminData) {
                        // Delete all group user list entries
                        await prisma.groupUsersList.deleteMany({
                            where: {
                                groupId,
                                groupUserId: currentAdminData.id,
                            },
                        });

                        // Delete the group user entry
                        await prisma.groupUsers.delete({
                            where: { id: currentAdminData.id }
                        });
                    }

                    // Deactivate group
                    await prisma.group.update({
                        where: { id: groupId },
                        data: { status: false }
                    });

                    // Decline all non-completed orders
                    await prisma.orders.updateMany({
                        where: {
                            groupId,
                            NOT: { status: 'COMPLETED' },
                        },
                        data: { status: 'DECLINED' },
                    });

                    console.log(`Group ${groupId} deactivated and cleaned up`);

                } else {
                    // Promote next user as admin
                    console.log(`Promoting user ${nextAdminEntry.invitedUserId} as new admin for group ${groupId}`);

                    const newAdminUserId = nextAdminEntry.invitedUserId;

                    // Update group user entry with new admin
                    const updatedGroupData = await prisma.groupUsers.update({
                        where: { id: nextAdminEntry.groupUserId },
                        data: {
                            userId: newAdminUserId,
                            status: true
                        },
                    });

                    // Remove new admin from invitedUserId array
                    const updatedInvitedUserIds = updatedGroupData.invitedUserId.filter(
                        (id) => id !== newAdminUserId
                    );

                    await prisma.groupUsers.update({
                        where: { id: nextAdminEntry.groupUserId },
                        data: {
                            invitedUserId: updatedInvitedUserIds,
                            status: true
                        },
                    });

                    // Update all group user list entries with new admin
                    await prisma.groupUsersList.updateMany({
                        where: {
                            groupId: nextAdminEntry.groupId,
                            groupUserId: nextAdminEntry.groupUserId,
                        },
                        data: {
                            adminUserId: newAdminUserId,
                            updatedAt: new Date(),
                        },
                    });

                    // Remove promoted user's entry from groupUsersList
                    await prisma.groupUsersList.deleteMany({
                        where: {
                            groupId: nextAdminEntry.groupId,
                            groupUserId: nextAdminEntry.groupUserId,
                            invitedUserId: newAdminUserId,
                        },
                    });

                    console.log(`Successfully promoted user ${newAdminUserId} as new admin`);
                }

            } else {
                // ADMIN REMOVING A SPECIFIC INVITED USER
                console.log(`Admin ${userId} removing invited user ${invitedUserId} from group ${groupId}`);

                if (!adminCheck) {
                    return response.error(res, 'Admin group entry not found.');
                }

                // Remove invited user from the invitedUserId array
                const updatedInvitedUserIds = adminCheck.invitedUserId.filter(
                    (id) => id !== invitedUserId
                );

                // Update the group user entry
                await prisma.groupUsers.update({
                    where: { id: adminCheck.id },
                    data: {
                        invitedUserId: updatedInvitedUserIds,
                        status: true
                    },
                });

                // Delete user's entry from groupUsersList
                await prisma.groupUsersList.deleteMany({
                    where: {
                        groupId,
                        groupUserId: adminCheck.id,
                        invitedUserId,
                    }
                });

                console.log(`Successfully removed invited user ${invitedUserId} from group ${groupId}`);
            }
        }

        // PREPARE RESPONSE DATA
        const subCategoriesWithCategory = await prisma.subCategory.findMany({
            where: { id: { in: group.subCategoryId } },
            include: { categoryInformation: true },
        });

        const formatUserData = async (user) => {
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

            const { password, socialMediaPlatform, ...userData } = user;

            return {
                ...userData,
                socialMediaPlatforms: userData.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
                categories: userCategoriesWithSubcategories,
                countryName: country?.name ?? null,
                stateName: state?.name ?? null,
                cityName: city?.name ?? null,
            };
        };

        // Get current admin user data
        const currentAdminId = isAdmin ? userId : (await prisma.groupUsers.findFirst({ where: { groupId } }))?.userId;
        console.log(currentAdminId, '>>>>>>>>>>>>>>>>> currentAdminId');
        console.log(isAdmin, '>>>>>>>>>>>>>>>>> isAdmin');

        let formattedAdminUser = null;

        if (currentAdminId) {
            const adminUser = await prisma.user.findUnique({
                where: { id: currentAdminId, status: true },
                include: {
                    socialMediaPlatforms: true,
                    brandData: true,
                    countryData: true,
                    stateData: true,
                    cityData: true,
                },
            });

            if (adminUser) {
                formattedAdminUser = await formatUserData(adminUser);
            }
        }

        // Get all invited users
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

        const getNumericStatus = (requestStatus) => {
            switch (requestStatus) {
                case 'PENDING': return 0;
                case 'ACCEPTED': return 1;
                case 'REJECTED': return 2;
                default: return 0;
            }
        };

        const formattedInvitedUsers = await Promise.all(
            allGroupInvitedUsers.map(async (entry) => {
                const formattedUser = await formatUserData(entry.invitedUser);
                return {
                    ...formattedUser,
                    requestStatus: getNumericStatus(entry.requestAccept || 'PENDING'),
                };
            })
        );

        return response.success(res, 'Operation completed successfully.', {
            groupInformation: {
                ...group,
                subCategoryId: subCategoriesWithCategory,
                adminUser: formattedAdminUser,
                invitedUsers: formattedInvitedUsers,
            },
        });

    } catch (error) {
        console.error('Error in group member removal:', error);
        return response.error(res, 'An error occurred while processing the request.');
    }
};

