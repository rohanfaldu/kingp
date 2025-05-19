import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import response from '../utils/response';
import { IImage } from '../interfaces/images.interface';

const uploadDir = path.join(__dirname, '..', 'uploads/images');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads/';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true }); // Ensure upload directory exists
            fs.chmodSync(uploadPath, 0o777); // Set folder permissions to 755
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const originalName = file.originalname;
        const uploadPath = 'uploads/';
        const fullPath = path.join(uploadPath, originalName);

        // Check if the file already exists
        if (fs.existsSync(fullPath)) {
            // If file exists, attach its details to the request object
            req.existingFile = {
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: fs.statSync(fullPath).size,
                path: fullPath,
                url: `${process.env.BASE_URL}/uploads/${originalName}`,
            };
            return cb(null, originalName); // Continue without saving a new file
        } else {
            cb(null, originalName); // Use the original filename if the file doesn't exist
        }
    },
});

const upload = multer({ storage });

export const uploadMultipleImages = (req: Request, res: Response) => {

    upload.array('image', 5)(req, res, (err) => {
        if (err) {
            console.error('Multer Error:', err);
            return res.status(500).json({ error: err.message });
        }


        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files received' });
        }

        const imagesData = req.files.map((file: any) => {
                const imagePath = `uploads/images/${file.filename}`;
                return {
                    name: file.filename,
                    path: imagePath,
                    url: `${req.protocol}://${req.get('host')}/${imagePath}`,
                    size: `${(file.size / 1024).toFixed(2)} KB`
                };
            });

        res.status(200).json({ message: 'Files uploaded successfully', files: imagesData });
    });
}
