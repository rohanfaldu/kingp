import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { IUser } from '../interfaces/user.interface';
import { validateUser } from '../utils/userValidation';
import * as bcrypt from 'bcryptjs';
import { UserType, BrandType } from '../enums/userType.enum';
import response from '../utils/response';
import { resolveStatus } from '../utils/commonFunction'


const prisma = new PrismaClient();


export const signup = async (req: Request, res: Response): Promise<any> => {
    try {
        const userData: IUser = req.body;

        validateUser(userData);
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const { countryId, password, emailAddress, ...userFields } = userData;
        
        if (!countryId) {
            return response.error(res, 'countryId is required.');
        }

        const existingUser = await prisma.user.findUnique({
            where: { emailAddress },
        });

        if (existingUser) {
            return response.error(res, 'A user with this email already exists.');
        }
        
        const status = resolveStatus(userData.status);
        const newUser = await prisma.user.create({
            data: {
                ...userFields,
                password: hashedPassword,
                type: userData.type ?? UserType.BUSINESS,
                brandType: userData.brandType ?? BrandType.STARTUP,
                status: status,
                emailAddress,
                CountryData: {
                    connect: { id: countryId }
                }
            },
            include: {
                CountryData: false // Include country in response if needed
            }
        });

        return response.success(res, 'Sign Up successfully!', newUser);

    } catch (error: any) {
        return response.error(res, error.message);
    }
}