import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import response from '../utils/response';
import { getStatusName } from '../utils/commonFunction'
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { IOrder, EditIOrder } from './../interfaces/order.interface';
import { PaymentStatus } from '../enums/userType.enum';
import { addDays } from 'date-fns';

const prisma = new PrismaClient();

export const createOrder = async (req: Request, res: Response) => {
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

        if (completionDate) {
            parsedCompletionDate = new Date(completionDate);
        } else if (completionDate && typeof completionDate === 'number') {
            parsedCompletionDate = addDays(new Date(), completionDate);
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

export const getByIdOrder = async (req: Request, res: Response) => {
    try {
        const { id } = req.body;

        if (!id) {
            return response.error(res, 'Both id and status are required');
        }

        const getOrder = await prisma.orders.findUnique({
            where: {
                id
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
        return response.success(res, 'Get order Detail', getOrder);
    } catch (error: any) {
        return response.error(res, error.message);
    }
};


export const updateOrderStatus = async (req: Request, res: Response) => {
    try {
        const orderData: EditIOrder = req.body;

        // Validate required fields
        if (typeof orderData.id !== 'string' || typeof orderData.status !== 'number') {
            return response.error(res, 'Both id (string) and status (number) are required');
        }

        // Extract and convert status

        // Destructure and safely omit `id`
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

        // Build final update object
        const statusEnumValue = getStatusName(status ?? 0);

        // let parsedCompletionDate: Date | undefined = undefined;
        // if (!isNaN(Number(completionDate))) {
        //     parsedCompletionDate = addDays(new Date(), Number(completionDate));
        // } else if (typeof completionDate === 'string') {
        //     const date = new Date(completionDate);
        //     if (!isNaN(date.getTime())) {
        //         parsedCompletionDate = date;
        //     }
        // }

        // Build update payload
        const dataToUpdate: any = {
            ...safeUpdateFields,
            status: statusEnumValue,
        };

        // Handle group relation correctly
        // if (groupId === null) {
        //     dataToUpdate.groupOrderData = { disconnect: true };
        // } else if (typeof groupId === 'string') {
        //     dataToUpdate.groupOrderData = { connect: { id: groupId } };
        // }


        // if (influencerId === null) {
        //     dataToUpdate.influencerOrderData = { disconnect: true };
        // } else if (typeof influencerId === 'string') {
        //     dataToUpdate.influencerOrderData = { connect: { id: influencerId } };
        // }

        // if (businessId === null) {
        //     dataToUpdate.businessOrderData = { disconnect: true };
        // } else if (typeof businessId === 'string') {
        //     dataToUpdate.businessOrderData = { connect: { id: businessId } };
        // }

        // if (paymentStatus === null) {
        //     dataToUpdate.paymentStatus = PaymentStatus.PENDING;
        // } else {
        //     dataToUpdate.paymentStatus = paymentStatus;
        // }

        const updated = await prisma.orders.update({
            where: { id },
            data: dataToUpdate,
        });

        if (updated) {
            return response.success(res, 'Successfully updated status', null);
        } else {
            return response.error(res, 'Order not found or status not updated');
        }
    } catch (error: any) {
        console.error('Update order failed:', error);
        return response.error(res, error.message || 'Something went wrong');
    }
};

export const getAllOrderList = async (req: Request, res: Response) => {
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