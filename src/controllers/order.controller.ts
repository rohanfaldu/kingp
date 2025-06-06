import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { IOrder } from '../interfaces/order.interface';
import { parse } from 'date-fns';
import response from '../utils/response';
import { resolveStatus } from '../utils/commonFunction'
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';
import { calculateProfileCompletion, calculateBusinessProfileCompletion } from '../utils/calculateProfileCompletion';
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { omit } from 'lodash';
import { Resend } from 'resend';
import { Role } from '@prisma/client';
import { RequestStatus } from '@prisma/client';



const prisma = new PrismaClient();

export const createOrder = async (req: Request, res: Response) => {
    try {
        const orderData: IOrder = req.body;

        const { completionDate, businessId, ...restFields } = orderData;

        if (!businessId) {
            return res.status(400).json({ error: 'businessId is required' });
        }

        let parsedCompletionDate: Date | undefined = undefined;
        if (completionDate) {
            try {
                parsedCompletionDate = parse(completionDate, 'dd/MM/yyyy', new Date());
                if (isNaN(parsedCompletionDate.getTime())) {
                    return response.error(res, 'Invalid completionDate format. Use DD/MM/YYYY');
                }
            } catch {
                return response.error(res, 'Invalid completionDate format. Use DD/MM/YYYY');
            }
        }
        
        const newOrder = await prisma.orders.create({
            data: {
                ...restFields,
                businessId,
                completionDate: parsedCompletionDate,
            },
            include: {
                groupOrderData: true,
                influencerOrderData: true,
                businessOrderData: true,
            },
        });

        response.success(res, 'Order created successfully!', newOrder);

    } catch (error: any) {
        response.error(res, error.message);
    }
};


