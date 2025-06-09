import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import response from '../utils/response';
import { IImage } from '../interfaces/images.interface';

// Define file type categories
const FILE_TYPES = {
    images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico'],
    documents: ['.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.rtf', '.odt', '.ods', '.odp'],
    videos: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.mp3', '.wav', '.aac', '.flac', '.ogg', '.wma', '.m4a']
};

// Function to determine file category
const getFileCategory = (filename: string): string => {
    const ext = path.extname(filename).toLowerCase();

    if (FILE_TYPES.images.includes(ext)) return 'images';
    if (FILE_TYPES.documents.includes(ext)) return 'documents';
    if (FILE_TYPES.videos.includes(ext)) return 'videos';

    return 'documents'; // Default to documents for unknown types
};

// Create upload directories
const createUploadDirs = () => {
    const baseUploadDir = path.join(__dirname, '..', 'uploads');
    const dirs = ['images', 'documents', 'videos'];

    dirs.forEach(dir => {
        const dirPath = path.join(baseUploadDir, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    });
};

// Initialize directories
createUploadDirs();

const storage = multer.diskStorage({
    destination: (_req, file, cb) => {
        const category = getFileCategory(file.originalname);
        const uploadDir = path.join(__dirname, '..', `uploads/${category}`);
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const cleanFileName = file.originalname.replace(/\s+/g, '');
        cb(null, cleanFileName);
    }
});


const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 50 MB limit
    fileFilter: (req, file, cb) => {
        console.log('File received:', file.fieldname, file.originalname);
        cb(null, true); // Accept all files
    }
}).any();

export const uploadMultipleImages = (req: Request, res: Response) => {
    console.log('Upload function called');
    console.log('Request body:', req.body);
    console.log('Request files before multer:', req.files);

    upload(req, res, async function (error) {
        if (error) {
            console.error("Upload Error:", error);
            return response.error(res, 'File upload failed');
        }

        console.log('After multer processing');
        const files = req.files as Express.Multer.File[];
        console.log('Files received:', files);

        if (!files || files.length === 0) {
            console.log('No files found in request');
            return response.error(res, 'No files uploaded');
        }

        try {
            //  const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
            const isUrl = process.env.FRONT_URL;
            console.log(isUrl, '>>>>>>>>>>url' )
            const url = isUrl ? 'https' : req.protocol;

            const filesData = files.map((file) => {
                const category = getFileCategory(file.filename);
                const filePath = `uploads/${category}/${file.filename}`;


                return {
                    name: file.filename,
                    path: filePath,
                    // url: `${req.protocol}://${req.get('host')}/${filePath}`,
                    url: `${url}://${req.get('host')}/${filePath}`,
                    // url: `https://${req.get('host')}/${filePath}`,
                    size: `${(file.size / 1024).toFixed(2)} KB`,
                    type: category,
                    extension: path.extname(file.filename).toLowerCase()
                };
            });

            response.success(res, 'Files uploaded successfully!', filesData);
        } catch (serverError: any) {
            console.error("Server Error:", serverError);
            response.serverError(res, 'Server Error');
        }
    });
};


// import { Request, Response } from 'express';
// import multer from 'multer';
// import path from 'path';
// import fs from 'fs';
// import response from '../utils/response';
// import { IImage } from '../interfaces/images.interface';

// const uploadDir = path.join(__dirname, '..', 'uploads/images');
// if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// const storage = multer.diskStorage({
//     destination: (_req, _file, cb) => cb(null, uploadDir),
//     filename: (_req, file, cb) => {
//         const cleanFileName = file.originalname.replace(/\s+/g, '');
//         cb(null, cleanFileName);
//     }
// });

// const upload = multer({ storage }).array('images', 10);

// export const uploadMultipleImages = (req: Request, res: Response) => {
//     upload(req, res, async function (error) {
//         if (error) {
//             console.error("Upload Error:", error);
//             return response.error(res, 'File upload failed');
//         }

//         const files = req.files as Express.Multer.File[];

//         if (!files || files.length === 0) {
//             return response.error(res, 'No files uploaded');
//         }

//         try {
//             const imagesData = files.map((file) => {
//                 const imagePath = `uploads/images/${file.filename}`;
//                 return {
//                     name: file.filename,
//                     path: imagePath,
//                     url: `${req.protocol}://${req.get('host')}/${imagePath}`,
//                     size: `${(file.size / 1024).toFixed(2)} KB`
//                 };
//             });

//             response.success(res, 'Image Uploaded successfully!', imagesData);
//         } catch (serverError: any) {
//             console.error("Server Error:", serverError);
//             response.serverError(res, 'Server Error');
//         }
//     });
// }