import { OfferStatus, PaymentStatus } from '../enums/userType.enum'; 

export interface IOrder {
    orderId?: string;
    groupId?: string;
    influencerId?: string;
    businessId: string;
    title?: string;
    description?: string;
    completionDate?: string;
    attachment?: string;
    status?: number;
    transactionId?: string;
    totalAmount?: number;
    discountAmount?: number;
    finalAmount?: number;
    paymentStatus?: PaymentStatus;
    createdAt: Date;
    updatedAt: Date;
}

export interface EditIOrder {
    id: string;
    groupId?: string;
    influencerId?: string;
    businessId: string;
    title?: string;
    description?: string;
    completionDate?: string;
    attachment?: string;
    status?: number;
    transactionId?: string;
    totalAmount?: number;
    discountAmount?: number;
    finalAmount?: number;
    paymentStatus?: PaymentStatus;
    createdAt: Date;
    updatedAt: Date;
}