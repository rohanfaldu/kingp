import { Response } from 'express';

// Define the types for the parameters
interface ResponseData {
    status: boolean;
    message: string;
    data: any; // You can specify a more precise type if needed
}

const response = {
    // success response
    success: (res: Response, message: string, data: any) => {
        return res.status(200).json({
            status: true,
            message,
            data,
        });
    },

    // error response (generic)
    error: (res: Response, message: string) => {
        return res.status(200).json({
            status: false,
            message,
            data: null,
        });
    },

    // server error response
    serverError: (res: Response, message: string) => {
        return res.status(400).json({
            status: false,
            message,
            data: null,
        });
    },

    // authentication error response
    authError: (res: Response, message: string) => {
        return res.status(401).json({
            status: false,
            message,
            data: null,
        });
    },
};

export default response;