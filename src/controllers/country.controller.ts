import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ICountry } from './../interfaces/country.interface';
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';
import { resolveStatus } from '../utils/commonFunction'



const prisma = new PrismaClient();


export const createCountry = async (req: Request, res: Response): Promise<any> => {
    try {
        const countryData: ICountry = req.body;

        if(!countryData.name || !countryData.countryCode){
            response.error(res, 'Country Name and Country code is required');
        }
        
        const status = resolveStatus(countryData.status);
        const { ...countryFields } = countryData;

        const newCountry = await prisma.country.create({
            data: {
                ...countryFields
            },
           
        });
        response.success(res, 'Country Created successfully!', newCountry);
    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const editCountry = async (req: Request, res: Response): Promise<any> => {
    try{
        const {id} = req.params;
        const categoryData: ICountry  = req.body;
        const { ...countryFields } = categoryData;

        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }

        const updateCountry = await prisma.country.update({
            where: { id: id }, 
            data: {
                ...countryFields,
            },
        });
        response.success(res, 'Country Updated successfully!', updateCountry);

    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const getByIdCountry = async (req: Request, res: Response): Promise<any> => {
    try {
        const {id} = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }
        
        const country = await prisma.country.findUnique({
            where: { id: id },
        });
        response.success(res, 'Country Get successfully!', country);
    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const getAllCountry = async (req: Request, res: Response): Promise<any> => {
    try {
        const countries = await paginate(req, prisma.country, {}, "countries");
        // const countries = await prisma.country.findMany ();

        if(!countries || countries.countries.length === 0){
            throw new Error("Country not Found");    
        }
    
        response.success(res, 'Get All Countries successfully!', countries);

    } catch (error: any) {
        response.error(res, error.message);
    }
}

export const deleteCountry = async (req: Request, res: Response): Promise<any> => {
    try {
        const {id} = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID formate')
        }
        const deletedCountry = await prisma.country.delete({
            where: {id: id},
        });
        response.success(res, 'Country Deleted successfully!',null);

    } catch (error: any) {
        response.error(res, error.message);
    }
}