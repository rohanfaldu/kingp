import { IContact } from './../interfaces/contact.interface';
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import response from '../utils/response';
import { paginate } from '../utils/pagination';

const prisma = new PrismaClient();



export const submitContactForm = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId; 
        const { name, title, description, emailAddress, contactNumber } = req.body;

        if (!userId || !title || !description) {
            return response.error(res, 'userId, title, and description are required.');
        }

        const contactData: IContact = {
            userId,
            name, 
            title,
            description,
            emailAddress,
            contactNumber,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const contact = await prisma.contact.create({
            data: contactData,
        });

        return response.success(res, 'Contact form submitted successfully', contact);

    } catch (error: any) {
        console.error('Contact form error:', error);
        return response.serverError(res, 'Something went wrong.');
    }
};

export const updateContactRequestStatus = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const tokenUser = req.user;

    if (!tokenUser?.userId) {
      return response.error(res, 'Invalid token payload');
    }

    const { contactId, status } = req.body;

    if (!contactId || !status) {
      return response.error(res, 'contactId and status are required');
    }

    // Admin check
    const loggedInUser = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
    });

    if (!loggedInUser || loggedInUser.type !== 'ADMIN') {
      return response.error(
        res,
        'Unauthorized access. Only ADMIN can update contact request status.'
      );
    }

    // Validate contact exists
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      return response.error(res, 'Contact request not found');
    }

    // Update status
    const updatedContact = await prisma.contact.update({
      where: { id: contactId },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    return response.success(
      res,
      'Contact request status updated successfully',
      updatedContact
    );
  } catch (error: any) {
    return response.error(res, error.message || 'Something went wrong');
  }
};




export const getAllContactRequests = async (req: Request, res: Response): Promise<any> => {
    try {
        const tokenUser = req.user; 
        if (!tokenUser || !tokenUser.userId) {
            return response.error(res, "Invalid token payload");
        }

        const loggedInUser = await prisma.user.findUnique({
            where: { id: tokenUser.userId },
        });

        if (!loggedInUser || loggedInUser.type !== 'ADMIN') {
            return response.error(res, "Unauthorized access. Only ADMIN can view contact requests.");
        }

        const contacts = await paginate(
            req,
            prisma.contact,
            {
                orderBy: {
                    createdAt: 'desc',
                },
            },
            "contactRequests"
        );

        if (!contacts || contacts.contactRequests.length === 0) {
            throw new Error("Contact Request not Found");
        }

        return response.success(res, 'Get All Contact Request successfully!', contacts);

    } catch (error: any) {
        return response.error(res, error.message);
    }
};




export const deleteContactRequest = async (req: Request, res: Response): Promise<any> => {
    try {
        const tokenUser = req.user;
        if (!tokenUser || !tokenUser.userId) {
            return response.error(res, "Invalid token payload");
        }

        const loggedInUser = await prisma.user.findUnique({
            where: { id: tokenUser.userId },
        });

        if (!loggedInUser || loggedInUser.type !== 'ADMIN') {
            return response.error(res, "Unauthorized access. Only ADMIN can delete contact requests.");
        }

        const { id: contactId } = req.params;

        if (!contactId) {
            return response.error(res, "Contact ID is required for deletion.");
        }

        const deletedContact = await prisma.contact.delete({
            where: { id: contactId },
        });

        return response.success(res, "Contact request deleted successfully!", deletedContact);
    } catch (error: any) {
        return response.error(res, error.message || "Failed to delete contact request.");
    }
};
