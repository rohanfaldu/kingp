import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { IState } from './../interfaces/state.interface';
import response from '../utils/response';
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';


const prisma = new PrismaClient();


export const createState = async (req: Request, res: Response): Promise<any> => {
    try {
        const stateData: IState = req.body;

        const { ...stateFields } = stateData;

        const newState = await prisma.state.create({
            data: {
                ...stateFields
            },
           
        });
        response.success(res, 'Country Created successfully!', newState);
    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const editState = async (req: Request, res: Response): Promise<any> => {
    try{
        const {id} = req.params;
        const stateData: IState  = req.body;
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


// export const getByIdCountry = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const {id} = req.params;
//         if (!isUuid(id)) {
//             response.error(res, 'Invalid UUID format');
//         }
        
//         const country = await prisma.country.findUnique({
//             where: { id: id },
//         });
//         response.success(res, 'Country Get successfully!', country);
//     } catch (error: any) {
//         response.error(res, error.message);
//     }
// }


// export const getAllCountry = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const countries = await paginate(req, prisma.country, {}, "countries");
//         // const countries = await prisma.country.findMany ();

//         if(!countries || countries.countries.length === 0){
//             throw new Error("Country not Found");    
//         }
    
//         response.success(res, 'Get All Countries successfully!', countries);

//     } catch (error: any) {
//         response.error(res, error.message);
//     }
// }

// export const deleteCountry = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const {id} = req.params;
//         if (!isUuid(id)) {
//             response.error(res, 'Invalid UUID formate')
//         }
//         const deletedCountry = await prisma.country.delete({
//             where: {id: id},
//         });
//         response.success(res, 'Country Deleted successfully!',null);

//     } catch (error: any) {
//         response.error(res, error.message);
//     }
// }