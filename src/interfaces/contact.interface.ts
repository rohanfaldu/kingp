export interface IContact {
    userId?: string;
    name?: string;
    title?: string;
    description?: string;
    emailAddress?: string;
    contactNumber?: string;
    createdAt: Date;
    updatedAt: Date;
}