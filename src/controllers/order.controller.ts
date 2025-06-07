import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import response from '../utils/response';
import { getStatusName } from '../utils/commonFunction'
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { IOrder } from './../interfaces/order.interface';
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
        const { id, status } = req.body;

        if (typeof id !== 'string' || typeof status !== 'number') {
            return response.error(res, 'Both id (string) and status (number) are required');
        }

        // Map status code (number) to enum value

        const statusEnumValue = getStatusName(status);

        // Update the order
        const updated = await prisma.orders.updateMany({
            where: { id },
            data: { status: statusEnumValue },
        });

        if (updated.count > 0) {
            return response.success(res, 'Successfully updated status', null);
        } else {
            return response.error(res, 'Order not found or status not updated');
        }
    } catch (error: any) {
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