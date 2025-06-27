
import { OfferStatus, RequestStatus } from '../enums/userType.enum';
import axios from 'axios';

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

export const getCommonStatusName = (code: number): RequestStatus => {
    switch (code) {
        case 0: return RequestStatus.PENDING;
        case 1: return RequestStatus.ACCEPTED;
        case 2: return RequestStatus.REJECTED;
        default:
            throw new Error('Invalid status code');
    }
};

export const paymentRefund = async (razorpayPaymentId: string, refundAmount: number): Promise<any> => {
    try {
        // Step 1: Fetch payment details
        const paymentDetails = await axios.get(
            `https://api.razorpay.com/v1/payments/${razorpayPaymentId}`,
            {
                auth: {
                    username: process.env.RAZORPAY_KEY_ID!,
                    password: process.env.RAZORPAY_KEY_SECRET!,
                },
            }
        );

        // Step 2: Capture if not already captured
        if (paymentDetails.data.status !== 'captured') {
            const captureResponse = await axios.post(
                `https://api.razorpay.com/v1/payments/${razorpayPaymentId}/capture`,
                { amount: paymentDetails.data.amount }, // amount must match payment amount
                {
                    auth: {
                        username: process.env.RAZORPAY_KEY_ID!,
                        password: process.env.RAZORPAY_KEY_SECRET!,
                    },
                }
            );
            console.log('✅ Payment captured:', captureResponse.data);
        }

        // Step 3: Refund the amount (in paise)
        const refundResponse = await axios.post(
            `https://api.razorpay.com/v1/payments/${razorpayPaymentId}/refund`,
            { amount: refundAmount * 100 }, // refundAmount is in ₹, Razorpay expects paise
            {
                auth: {
                    username: process.env.RAZORPAY_KEY_ID!,
                    password: process.env.RAZORPAY_KEY_SECRET!,
                },
            }
        );

        console.log('✅ Refund successful:', refundResponse.data);
        return true;

    } catch (error: any) {
        console.error('❌ Refund failed:', error.response?.data || error.message);
        return false;
    }
};