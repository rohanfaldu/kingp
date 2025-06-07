
import { OfferStatus } from '../enums/userType.enum';

export const resolveStatus = (status: boolean | null | undefined): boolean => {
    return status === null || status === undefined ? true : status;
};


export const getStatusName = (code: number): OfferStatus => {
    switch (code) {
        case 0: return OfferStatus.PENDING;
        case 1: return OfferStatus.ACCEPTED;
        case 2: return OfferStatus.CANCELED;
        case 3: return OfferStatus.ACTIVATED;
        case 4: return OfferStatus.ORDERSUBMITTED;
        case 5: return OfferStatus.COMPLETED;
        case 6: return OfferStatus.DECLINED;
        default:
            throw new Error('Invalid status code');
    }
};