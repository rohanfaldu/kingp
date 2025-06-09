import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import response from '../utils/response';
import { getStatusName } from '../utils/commonFunction'
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { IOrder, EditIOrder } from './../interfaces/order.interface';
// import { PaymentStatus, OfferStatus } from '../enums/userType.enum';
import { addDays } from 'date-fns';
import { OfferStatus, PaymentStatus, RequestStatus, Role } from '@prisma/client';




const prisma = new PrismaClient();


export const createOrder = async (req: Request, res: Response): Promise<any> => {
    try {
        const orderData: IOrder = req.body;
        const {
            businessId,
            influencerId,
            completionDate,
            ...restFields
        } = orderData;

        if (!businessId) {
            return res.status(400).json({ error: 'businessId is required' });
        }

        let parsedCompletionDate: Date | undefined = undefined;
        const statusEnumValue = getStatusName(restFields.status ?? 0);


        if (completionDate && typeof completionDate === 'number') {
            parsedCompletionDate = addDays(new Date(), completionDate);
        } else {
            parsedCompletionDate = completionDate;
        }

        const newOrder = await prisma.orders.create({
            data: {
                ...restFields,
                businessId,
                influencerId,
                completionDate: parsedCompletionDate,
                status: statusEnumValue,
                paymentStatus: restFields.paymentStatus ?? 'PENDING',
            },
            include: {
                groupOrderData: {},
                influencerOrderData: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    }
                },
                businessOrderData: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    }
                }
            }
        });

        const formatUser = async (user: any) => {
            if (!user) return null;
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            return {
                ...user,
                categories: userCategoriesWithSubcategories,
                countryName: user.countryData?.name ?? null,
                stateName: user.stateData?.name ?? null,
                cityName: user.cityData?.name ?? null,
            };
        };

        const responseData = {
            ...newOrder,
            influencerOrderData: await formatUser(newOrder.influencerOrderData),
            businessOrderData: await formatUser(newOrder.businessOrderData),
            groupOrderData: await formatUser(newOrder.groupOrderData),
        };

        return response.success(res, 'Order created successfully!', responseData);
    } catch (error: any) {
        return response.error(res, error.message);
    }
};



export const getByIdOrder = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.body;
        if (!id) return response.error(res, 'Order ID is required');

        const order = await prisma.orders.findUnique({
            where: { id },
            include: {
                groupOrderData: true,
                influencerOrderData: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                },
                businessOrderData: {
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

        if (!order) {
            return response.error(res, 'Order not found');
        }
        if (!order?.groupOrderData) {
            return response.success(res, 'Order fetched', order);
        }

        const group = order.groupOrderData;

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

        const subCategoriesWithCategory = await prisma.subCategory.findMany({
            where: { id: { in: group.subCategoryId } },
            include: { categoryInformation: true },
        });

        const groupUsers = await prisma.groupUsers.findMany({
            where: { groupId: group.id },
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
                    groupId: group.id,
                    groupUserId: groupUser.id,
                    requestAccept: 'ACCEPTED',
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
                            entry.requestAccept === 'ACCEPTED'
                                ? 1
                                : entry.requestAccept === 'REJECTED'
                                    ? 2
                                    : 0,
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

        // Replace raw groupOrderData with formatted one
        const formattedGroup = {
            ...group,
            subCategoryId: subCategoriesWithCategory,
            groupData: Array.from(groupMap.values())[0] || null,
        };
        const finalResponse = {
            ...order,
            groupOrderData: formattedGroup,
        };
        // console.log(finalResponse, '>>>>finalResponse')

        return response.success(res, 'Order fetched with group data', finalResponse);
    } catch (error: any) {
        console.error('getByIdOrder error:', error);
        return response.error(res, error.message);
    }
};





export const updateOrderStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const orderData: EditIOrder = req.body;

        if (typeof orderData.id !== 'string' || typeof orderData.status !== 'number') {
            return response.error(res, 'Both id (string) and status (number) are required');
        }

        const {
            id,
            status,
            completionDate,
            groupId,
            influencerId,
            businessId,
            paymentStatus,
            ...safeUpdateFields
        } = orderData;

        const statusEnumValue = getStatusName(status ?? 0);

        if (status === 5 && statusEnumValue === OfferStatus.COMPLETED) {
            const currentOrder = await prisma.orders.findUnique({ where: { id }, select: { status: true } });
            if (!currentOrder) return response.error(res, 'Order not found');
            if (currentOrder.status === OfferStatus.COMPLETED) {
                const existingEarnings = await prisma.earnings.findFirst({ where: { orederId: id } });
                if (existingEarnings) {
                    return response.error(res, 'Order is already completed and earnings have been distributed');
                } else {
                    return response.error(res, 'Order is already completed');
                }
            }
            if (currentOrder.status !== OfferStatus.ORDERSUBMITTED) {
                return response.error(res, 'Order must be in ORDERSUBMITTED status before it can be marked as COMPLETED');
            }
        }

        const updated = await prisma.orders.update({
            where: { id },
            data: { ...safeUpdateFields, status: statusEnumValue },
        });

        const order = await prisma.orders.findUnique({
            where: { id },
            include: {
                groupOrderData: true,
                influencerOrderData: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                },
                businessOrderData: {
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

        if (!order) return response.error(res, 'Order not found after update');

        const formatUserData = async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            const { password: _, socialMediaPlatform: __, ...userData } = user;
            return {
                ...userData,
                categories: userCategoriesWithSubcategories,
                countryName: user.countryData?.name ?? null,
                stateName: user.stateData?.name ?? null,
                cityName: user.cityData?.name ?? null,
            };
        };

        let formattedGroup: any = null;

        if (order.groupOrderData) {
            const group = order.groupOrderData;

            const subCategoriesWithCategory = await prisma.subCategory.findMany({
                where: { id: { in: group.subCategoryId } },
                include: { categoryInformation: true },
            });

            const groupUsers = await prisma.groupUsers.findMany({ where: { groupId: group.id } });

            const groupMap = new Map<string, any>();

            for (const groupUser of groupUsers) {
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
                        requestAccept: 'ACCEPTED',
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
                            requestStatus: 1,
                        };
                    })
                );

                groupMap.set(`${groupUser.groupId}-${groupUser.id}`, {
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

            formattedGroup = {
                ...group,
                subCategoryId: subCategoriesWithCategory,
                groupData: Array.from(groupMap.values())[0] || null,
            };
        }

        // Earnings logic if COMPLETED
        if (status === 5 && statusEnumValue === OfferStatus.COMPLETED) {
            const amount = updated.finalAmount ?? updated.totalAmount;
            if (!amount) return response.error(res, 'Order amount is missing');

            const baseEarning = {
                orederId: updated.id,
                groupId: updated.groupId ?? null,
                businessId: updated.businessId,
                paymentStatus: PaymentStatus.COMPLETED,
            };

            const earningsData: any[] = [];

            // Admin earns 20%
            const adminUser = await prisma.user.findFirst({ where: { type: 'ADMIN' }, select: { id: true } });
            if (!adminUser) return response.error(res, 'Admin user not found');

            const adminAmount = amount * 0.2;
            earningsData.push({
                ...baseEarning,
                userId: adminUser.id,
                amount,
                earningAmount: adminAmount,
            });

            // Remaining 80% split among eligible users
            const eligibleUserIds: string[] = [];

            if (updated.influencerId) eligibleUserIds.push(updated.influencerId);

            if (updated.groupId) {
                const acceptedUsers = await prisma.groupUsersList.findMany({
                    where: { groupId: updated.groupId, requestAccept: 'ACCEPTED' },
                    select: { invitedUserId: true },
                });
                acceptedUsers.forEach(({ invitedUserId }) => eligibleUserIds.push(invitedUserId));

                const groupAdmins = await prisma.groupUsers.findMany({
                    where: { groupId: updated.groupId },
                    select: { userId: true },
                });
                groupAdmins.forEach(({ userId }) => eligibleUserIds.push(userId));
            }

            if (eligibleUserIds.length > 0) {
                const sharedAmount = (amount * 0.8) / eligibleUserIds.length;
                for (const userId of eligibleUserIds) {
                    earningsData.push({
                        ...baseEarning,
                        userId,
                        amount,
                        earningAmount: sharedAmount,
                    });
                }
            }

            await prisma.earnings.createMany({ data: earningsData, skipDuplicates: true });

            const detailedEarnings = await Promise.all(
                earningsData.map(async (entry) => {
                    const user = await prisma.user.findUnique({
                        where: { id: entry.userId },
                        include: {
                            socialMediaPlatforms: true,
                            brandData: true,
                            countryData: true,
                            stateData: true,
                            cityData: true,
                        },
                    });
                    if (!user) return null;
                    const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
                    const { password: _, ...userData } = user;
                    return {
                        user: {
                            ...userData,
                            categories: userCategoriesWithSubcategories,
                            countryName: user?.countryData?.name ?? null,
                            stateName: user?.stateData?.name ?? null,
                            cityName: user?.cityData?.name ?? null,
                        },
                        earningAmount: entry.earningAmount,
                        orderAmount: entry.amount,
                    };
                })
            );

            return response.success(res, 'Order status updated and earnings distributed successfully', {
                ...order,
                groupOrderData: formattedGroup,
                earnings: detailedEarnings.filter(Boolean),
            });
        }

        // Non-completed order return
        return response.success(res, 'Order status updated successfully', {
            ...order,
            groupOrderData: formattedGroup,
        });

    } catch (error: any) {
        console.error('Update order status failed:', error);
        return response.error(res, error.message || 'Something went wrong');
    }
};





export const getAllOrderList = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status } = req.body;

        if (status === "" || status === undefined || status === null) {
            return response.error(res, 'Status is required');
        }

        const statusEnumValue = getStatusName(status);
        const getOrder = await prisma.orders.findMany({
            where: {
                status: statusEnumValue
            },
            include: {
                groupOrderData: {},
                influencerOrderData: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    }
                },
                businessOrderData: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    }
                }
            }
        });
        return response.success(res, 'Get All order List', getOrder);

    } catch (error: any) {
        return response.error(res, error.message || 'Something went wrong');
    }
};





export const orderSubmit = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id, submittedDescription, socialMediaLink, attachment, mediaType } = req.body;
        if (!id || typeof id !== 'string') {
            return response.error(res, 'Order ID is required and must be a string');
        }

        // Update order with submission details and change status to ORDERSUBMITTED
        await prisma.orders.update({
            where: { id },
            data: {
                submittedDescription,
                socialMediaLink,
                attachment,
                mediaType: Number(mediaType),
                status: OfferStatus.ORDERSUBMITTED,
            },
        });

        // Now reuse getByIdOrder response format
        const order = await prisma.orders.findUnique({
            where: { id },
            include: {
                groupOrderData: true,
                influencerOrderData: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                },
                businessOrderData: {
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


        if (!order) return response.error(res, 'Order not found after update');

        if (!order.groupOrderData) {
            return response.success(res, 'Order submitted successfully', order);
        }

        const group = order.groupOrderData;

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

        const subCategoriesWithCategory = await prisma.subCategory.findMany({
            where: { id: { in: group.subCategoryId } },
            include: { categoryInformation: true },
        });

        const groupUsers = await prisma.groupUsers.findMany({
            where: { groupId: group.id },
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
                    groupId: group.id,
                    groupUserId: groupUser.id,
                    requestAccept: 'ACCEPTED',
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
                            entry.requestAccept === 'ACCEPTED'
                                ? 1
                                : entry.requestAccept === 'REJECTED'
                                    ? 2
                                    : 0,
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

        const formattedGroup = {
            ...group,
            subCategoryId: subCategoriesWithCategory,
            groupData: Array.from(groupMap.values())[0] || null,
        };

        const finalResponse = {
            ...order,
            groupOrderData: formattedGroup,
        };

        return response.success(res, 'Order submitted successfully', finalResponse);

    } catch (error: any) {
        return response.error(res, error.message || 'Something went wrong');
    }
}






export const updateOrderStatusAndInsertEarnings = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id, status } = req.body;

        if (typeof id !== 'string' || typeof status !== 'number') {
            return response.error(res, 'Both id string and status number are required');
        }

        if (!id) {
            return response.error(res, 'Invalid Uuid formate.');
        }

        const statusEnum = getStatusName(status);

        // 1. Update Order Status
        const order = await prisma.orders.update({
            where: { id },
            data: { status: statusEnum },
            include: {
                groupOrderData: true,
                influencerOrderData: true,
                businessOrderData: true,
            },
        });

        if (!order) {
            return response.error(res, 'Order not found');
        }


        if (statusEnum === OfferStatus.COMPLETED) {
            const amount = order.finalAmount ?? order.totalAmount;

            if (!amount) {
                return response.error(res, 'Order amount is missing, cannot generate earnings');
            }

            const earningsData: any[] = [];

            const baseEarning = {
                orederId: order.id,
                groupId: order.groupId ?? null,
                businessId: order.businessId,
                paymentStatus: PaymentStatus.COMPLETED,
            };

            // 1. Admin gets 20%
            const adminUser = await prisma.user.findFirst({
                where: { type: 'ADMIN' },
                select: { id: true },
            });

            if (!adminUser) {
                return response.error(res, 'Admin user not found');
            }

            const adminAmount = amount * 0.2;
            earningsData.push({
                ...baseEarning,
                userId: adminUser.id,
                amount: amount,
                earningAmount: adminAmount,
            });

            // 2. Collect all other eligible user IDs: influencer, invited users, and group admin(s)
            const eligibleUserIds: string[] = [];

            // a. Add influencer if exists
            if (order.influencerId) {
                eligibleUserIds.push(order.influencerId);
            }

            // b. Add accepted invited group users
            if (order.groupId) {
                const acceptedInvited = await prisma.groupUsersList.findMany({
                    where: {
                        groupId: order.groupId,
                        requestAccept: RequestStatus.ACCEPTED,
                    },
                    select: {
                        invitedUserId: true,
                    },
                });

                acceptedInvited.forEach(user => eligibleUserIds.push(user.invitedUserId));

                // c. Add group admin(s) from groupUsers table
                const groupAdmins = await prisma.groupUsers.findMany({
                    where: {
                        groupId: order.groupId,
                    },
                    select: {
                        userId: true,
                    },
                });

                groupAdmins.forEach(admin => eligibleUserIds.push(admin.userId));
            }

            // 3. Distribute 80% equally
            if (eligibleUserIds.length > 0) {
                const sharedAmountPerUser = (amount * 0.8) / eligibleUserIds.length;

                for (const userId of eligibleUserIds) {
                    earningsData.push({
                        ...baseEarning,
                        userId,
                        amount: amount,
                        earningAmount: sharedAmountPerUser,
                    });
                }
            }

            /// 4. Insert all earnings
            if (earningsData.length > 0) {
                await prisma.earnings.createMany({ data: earningsData, skipDuplicates: true });

                // Fetch user details for response
                const detailedEarnings = await Promise.all(
                    earningsData.map(async (entry) => {
                        const user = await prisma.user.findUnique({
                            where: { id: entry.userId },
                            include: {
                                // UserDetail: true,
                                socialMediaPlatforms: true,
                                brandData: true,
                                countryData: true,
                                stateData: true,
                                cityData: true,
                            },
                        });

                        const { password: _, ...userData } = user || {};
                        const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);


                        return {
                            user: {
                                ...userData,
                                categories: userCategoriesWithSubcategories,
                                countryName: user?.countryData?.name ?? null,
                                stateName: user?.stateData?.name ?? null,
                                cityName: user?.cityData?.name ?? null,
                            },
                            earningAmount: entry.earningAmount,
                            orderAmount: entry.amount,
                        };
                    })
                );

                return response.success(
                    res,
                    'Order status updated and earnings inserted (if applicable)',
                    detailedEarnings
                    // detailedEarnings.filter(Boolean)
                );
            }
        }

        return response.success(res, 'Order status updated', null);
    } catch (error: any) {
        console.error('Earnings generation failed:', error);
        return response.error(res, error.message || 'Something went wrong');
    }
};