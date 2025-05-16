import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import response from '../utils/response';
import { IImage } from '../interfaces/images.interface';

const uploadDir = path.join(__dirname, '..', 'uploads/images');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const cleanFileName = file.originalname.replace(/\s+/g, '');
        cb(null, cleanFileName);
    }
});

const upload = multer({ storage }).array('images', 10);

export const uploadMultipleImages = (req: Request, res: Response) => {
    upload(req, res, async function (error) {
        if (error) {
            console.error("Upload Error:", error);
            return response.error(res, 'File upload failed');
        }

        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) {
            return response.error(res, 'No files uploaded');
        }

        try {
            const imagesData = files.map((file) => {
                const imagePath = `uploads/images/${file.filename}`;
                return {
                    name: file.filename,
                    path: imagePath,
                    url: `${req.protocol}://${req.get('host')}/${imagePath}`,
                    size: `${(file.size / 1024).toFixed(2)} KB`
                };
            });

            response.success(res, 'Image Uploaded successfully!', imagesData);
        } catch (serverError: any) {
            console.error("Server Error:", serverError);
            response.serverError(res, 'Server Error');
        }
    });
}
