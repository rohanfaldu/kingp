import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { IGroup } from '../interfaces/group.interface';
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { resolveStatus } from '../utils/commonFunction'
import { VisibilityType, Platform } from '../enums/userType.enum';

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

        // Fetch user info for userId
        const adminUser = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                UserDetail: true,
                socialMediaPlatforms: true,
                brandData: true,
                CountryData: true,
                CityData: true,
                StateData: true,
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
                    CountryData: true,
                    CityData: true,
                    StateData: true,
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

        // Build final response structure
        const formattedResponse = {
            ...newGroup,
            subCategoryId: subCategoriesWithCategory, // Replace IDs with full subcategory info
            groupData: await Promise.all(
                newGroup.groupData.map(async (groupUser) => {
                    const adminUser = await prisma.user.findUnique({
                        where: { id: groupUser.userId },
                        include: {
                            UserDetail: true,
                            socialMediaPlatforms: true,
                            brandData: true,
                            CountryData: true,
                            CityData: true,
                            StateData: true,
                        },
                    });

                    const invitedUserInfo = groupUser.invitedUserId.length
                        ? await prisma.user.findMany({
                            where: { id: { in: groupUser.invitedUserId } },
                            include: {
                                UserDetail: true,
                                socialMediaPlatforms: true,
                                brandData: true,
                                CountryData: true,
                                CityData: true,
                                StateData: true,
                            },
                        })
                        : [];

                    return {
                        ...groupUser,
                        adminUser,
                        invitedUsers: invitedUserInfo,
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


export const editGroup = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id: groupId } = req.params;
        const groupData: Partial<IGroup> = req.body;

        if (!groupId) {
            return response.error(res, 'GroupId is required.');
        }

        // Check if group exists
        const existingGroup = await prisma.group.findUnique({
            where: { id: groupId },
            include: { groupData: true },
        });

        if (!existingGroup) {
            return response.error(res, 'Group not found.');
        }

        // Check groupName unique (except current group)
        if (groupData.groupName) {
            const duplicateGroup = await prisma.group.findFirst({
                where: {
                    groupName: groupData.groupName,
                    NOT: { id: groupId },
                },
            });

            if (duplicateGroup) {
                return response.error(res, 'Group with this name already exists.');
            }
        }

        const loggedInUserId = req.user.id; // Get from token/session
        if (existingGroup.userId !== loggedInUserId) {
            return response.error(res, 'Unauthorized: You are not allowed to edit this group.');
        }
        
        const {
            subCategoryId = [],
            invitedUserId = [],
            socialMediaPlatform = [],
            status,
            ...groupFields
        } = groupData;

        // Update group data
        const updatedGroup = await prisma.group.update({
            where: { id: groupId },
            data: {
                ...groupFields,
                subCategoryId,
                socialMediaPlatform,
                status: status !== undefined ? resolveStatus(status) : existingGroup.status,
            },
            include: { groupData: true },
        });

        // Update groupData.invitedUserId if provided
        if (invitedUserId.length) {
            await prisma.groupUsers.updateMany({
                where: { groupId },
                data: { invitedUserId },
            });
        }

        // Fetch subCategory with Category info
        const subCategoriesWithCategory = await prisma.subCategory.findMany({
            where: { id: { in: updatedGroup.subCategoryId } },
            include: { categoryInformation: true },
        });

        // Build final response structure (Same as Create API)
        const formattedResponse = {
            ...updatedGroup,
            subCategoryId: subCategoriesWithCategory,
            groupData: await Promise.all(
                updatedGroup.groupData.map(async (groupUser) => {
                    const adminUser = await prisma.user.findUnique({
                        where: { id: groupUser.userId },
                        include: {
                            UserDetail: true,
                            socialMediaPlatforms: true,
                            brandData: true,
                            CountryData: true,
                            CityData: true,
                            StateData: true,
                        },
                    });

                    const invitedUserInfo = groupUser.invitedUserId.length
                        ? await prisma.user.findMany({
                            where: { id: { in: groupUser.invitedUserId } },
                            include: {
                                UserDetail: true,
                                socialMediaPlatforms: true,
                                brandData: true,
                                CountryData: true,
                                CityData: true,
                                StateData: true,
                            },
                        })
                        : [];

                    return {
                        ...groupUser,
                        adminUser,
                        invitedUsers: invitedUserInfo,
                    };
                })
            ),
        };

        return response.success(res, 'Group updated successfully!', {
            groupInformation: formattedResponse,
        });

    } catch (error: any) {
        console.error(error);
        return response.error(res, error.message);
    }
};





