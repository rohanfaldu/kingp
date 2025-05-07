import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { IState } from './../interfaces/state.interface';
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';
import { resolveStatus } from '../utils/commonFunction';

const prisma = new PrismaClient();


export const createState = async (req: Request, res: Response): Promise<any> => {
    try {
        const stateData: IState = req.body;

        if (!stateData.countryId) {
            return response.error(res, 'countryId is required.');
        }

        const existingCountry = await prisma.country.findUnique({
            where: { id: stateData.countryId },
        });
        if (!existingCountry) {
            return response.error(res, 'Invalid countryId: Country not found.');
        }

        const existingState = await prisma.state.findFirst({
            where: {
                name: stateData.name,
                countryId: stateData.countryId,
            },
        });
        if (existingState) {
            return response.error(res, 'State with this name already exists in the selected Country.');
        }


        const { ...stateFields } = stateData;

        const newState = await prisma.state.create({
            data: {
                ...stateFields
            },
           
        });
        response.success(res, 'State Created successfully!', newState);
    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const editState = async (req: Request, res: Response): Promise<any> => {
    try{
        const {id} = req.params;
        const stateData: IState  = req.body;
        const status = resolveStatus(stateData.status);
        
        const { ...stateFields } = stateData;

        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }

        const updateState = await prisma.state.update({
            where: { id: id }, 
            data: {
                ...stateFields,
            },
            include: {
                countryKey: true,
            },
        });
        response.success(res, 'Country Updated successfully!', updateState);

    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const getByIdState = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }
        const state = await prisma.state.findUnique({
            where: { id: id },
            include: { 
                countryKey: true,
            },
        });
        response.success(res, 'State Get successfully!', state);
    } catch (error: any) {
        return response.serverError(res, error.message || 'Failed to fetch state.');
    }
}

// get state listing by CountryId
export const getStateByCountryId = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        const country = await prisma.country.findUnique({
            where: { id },
            include: {
                countryKey: { }
            }
        });

        if (!country) {
            return response.error(res, 'Country not found');
        }

        return response.success(res, 'States fetched successfully!', country.countryKey);
    } catch (error: any) {
        return response.error(res, error.message);
    }
};



export const getAllStates = async (req: Request, res: Response): Promise<any> => {
    try {
        const states = await paginate(req, prisma.state, {
            include: {
                countryKey: true,
            },
        });

        return response.success(res, 'Fetched all States successfully.', states);
    } catch (error: any) {
        return response.serverError(res, error.message || 'Failed to fetch States.');
    }
};

export const deleteState = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID formate')
        }
        const deleteState = await prisma.state.delete({
            where: { id: id },
        });
        response.success(res, 'State Deleted successfully!', null);

    } catch (error: any) {
        response.error(res, error.message);
    }
}