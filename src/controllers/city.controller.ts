import { ICity } from './../interfaces/city.interface';
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';
import { resolveStatus } from '../utils/commonFunction';

const prisma = new PrismaClient();


export const createCity = async (req: Request, res: Response): Promise<any> => {
    try {
        const cityData: ICity = req.body;

        if (!cityData.stateId) {
            return response.error(res, 'stateId is required.');
        }

        const existingState = await prisma.state.findUnique({
            where: { id: cityData.stateId },
        });
        if (!existingState) {
            return response.error(res, 'Invalid stateId: State not found.');
        }

        const existingCity = await prisma.city.findFirst({
            where: {
                name: cityData.name,
                stateId: cityData.stateId,
            },
        });
        if (existingCity) {
            return response.error(res, 'City with this name already exists in the selected State.');
        }


        const { ...cityFields } = cityData;

        const newCity = await prisma.city.create({
            data: {
                ...cityFields
            },
           
        });
        response.success(res, 'City Created successfully!', newCity);
    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const editCity = async (req: Request, res: Response): Promise<any> => {
    try{
        const {id} = req.params;
        const cityData: ICity  = req.body;
        const status = resolveStatus(cityData.status);
        
        const { ...cityFields } = cityData;

        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }

        const updateCity = await prisma.city.update({
            where: { id: id }, 
            data: {
                ...cityFields,
            },
            include: {
                stateKey: {
                    include: {
                        countryKey: true, 
                    },
                },
            },
        });
        response.success(res, 'City Updated successfully!', updateCity);

    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const getByIdCity = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }
        const city = await prisma.city.findUnique({
            where: { id: id },
            include: {
                stateKey: {
                    include: {
                        countryKey: true, 
                    },
                },
            },
        });
        response.success(res, 'City Get successfully!', city);
    } catch (error: any) {
        return response.serverError(res, error.message || 'Failed to fetch City.');
    }
}

// get city listing by StateId
export const getCityByStateId = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        const state = await prisma.state.findUnique({
            where: { id },
            include: {
                stateKey: true // Include all cities under this state
            }
        });

        if (!state) {
            return response.error(res, 'State not found');
        }

        return response.success(res, 'Cities fetched successfully!', state.stateKey);
    } catch (error: any) {
        return response.error(res, error.message);
    }
};



export const getAllCity = async (req: Request, res: Response): Promise<any> => {
    try {
        const cities = await paginate(req, prisma.city, {
            include: {
                stateKey: {
                    include: {
                        countryKey: true, 
                    },
                },
            },
            orderBy: {
                createsAt: 'desc', 
            },
        });

        return response.success(res, 'Fetched all Cities successfully.', cities);
    } catch (error: any) {
        return response.serverError(res, error.message || 'Failed to fetch Cities.');
    }
};

export const deleteCity = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID formate')
        }
        const deleteCity = await prisma.city.delete({
            where: { id: id },
        });
        response.success(res, 'City Deleted successfully!', null);

    } catch (error: any) {
        response.error(res, error.message);
    }
}