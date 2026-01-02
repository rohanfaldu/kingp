import { OfferStatus, RequestStatus } from '../enums/userType.enum';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import response from '../utils/response';

const prisma = new PrismaClient();
export const resolveStatus = (status: boolean | null | undefined): boolean => {
  return status === null || status === undefined ? true : status;
};

export const getStatusName = (code: number): OfferStatus => {
  switch (code) {
    case 0:
      return OfferStatus.PENDING;
    case 1:
      return OfferStatus.ACCEPTED;
    case 2:
      return OfferStatus.CANCELED;
    case 3:
      return OfferStatus.ACTIVATED;
    case 4:
      return OfferStatus.ORDERSUBMITTED;
    case 5:
      return OfferStatus.COMPLETED;
    case 6:
      return OfferStatus.DECLINED;
    default:
      throw new Error('Invalid status code');
  }
};

export const getCommonStatusName = (code: number): RequestStatus => {
  switch (code) {
    case 0:
      return RequestStatus.PENDING;
    case 1:
      return RequestStatus.ACCEPTED;
    case 2:
      return RequestStatus.REJECTED;
    default:
      throw new Error('Invalid status code');
  }
};

export const paymentRefund = async (
  razorpayPaymentId: string,
  refundAmount: number
): Promise<any> => {
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
    console.log('✅ Payment details:', paymentDetails.data);
    console.log('✅ Payment amount:', paymentDetails.data.amount);

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
    // const refundResponse = await axios.post(
    //     `https://api.razorpay.com/v1/payments/${razorpayPaymentId}/refund`,
    //     { amount: refundAmount * 100 }, // refundAmount is in ₹, Razorpay expects paise
    //     {
    //         auth: {
    //             username: process.env.RAZORPAY_KEY_ID!,
    //             password: process.env.RAZORPAY_KEY_SECRET!,
    //         },
    //     }
    // );

    // console.log('✅ Refund successful:', refundResponse.data);
    return true;
  } catch (error: any) {
    console.error('❌ Refund failed:', error.response?.data || error.message);
    return false;
  }
};

export const getBageData = async (userId: string): Promise<any> => {
  //const prisma = new PrismaClient();

  const usersBadges = await prisma.userBadges.findMany({
    where: { userId: userId },
    include: {
      userBadgeTitleData: true,
    },
  });
  if (usersBadges) {
    const userBadgeTitleList = usersBadges.map((b) => b.userBadgeTitleData);
    return userBadgeTitleList;
  }
};

export const initiateTransfer = async (
  amount: number,
  accountId: string,
  userName: string
): Promise<any> => {
  try {
    /* ---------- BASIC CHECK ---------- */
    if (!accountId || accountId.trim() === '') {
      return {
        status: false,
        message: 'Account ID is required',
        data: null,
      };
    }

    /* ---------- SKIP NON-RAZORPAY ACCOUNTS (PayPal etc.) ---------- */
    if (!accountId.startsWith('acc_')) {
      console.log(
        'ℹ️ Non-Razorpay account detected, transfer skipped:',
        accountId
      );

      return {
        status: true,
        message: 'Non-Razorpay payout, Razorpay transfer skipped',
        data: null,
      };
    }

    /* ---------- RAZORPAY TRANSFER ---------- */
    const response = await axios.post(
      'https://api.razorpay.com/v1/orders',
      {
        amount: amount * 100, // in paise
        currency: 'INR',
        transfers: [
          {
            account: accountId, // ✅ Razorpay sub-account only
            amount: amount * 100,
            currency: 'INR',
            notes: {
              branch: 'Acme Corp Bangalore North',
              name: userName,
            },
            linked_account_notes: ['branch'],
            on_hold: false,
          },
        ],
      },
      {
        auth: {
          username: process.env.RAZORPAY_KEY_ID!,
          password: process.env.RAZORPAY_KEY_SECRET!,
        },
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Transfer successful:', response.data);

    return {
      status: true,
      message: 'Success',
      data: response.data,
    };
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.error?.description ||
      error.response?.data?.error ||
      error.message ||
      'Something went wrong during the transfer.';

    return {
      status: false,
      message: errorMessage,
      data: null,
    };
  }
};

export const generateSlug = (text: string) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};



// Validate locations
export const validateLocation = async (
  isGlobal: boolean,
  countryId?: string | null,
  stateId?: string | null,
  cityIds: string[] = []
): Promise<void> => {

  const trimmedCountryId = countryId?.trim();
  const trimmedStateId = stateId?.trim();
  const trimmedCityIds = cityIds.map(c => c.trim()).filter(c => c);

  if (isGlobal) {
    if (!trimmedCountryId || !trimmedStateId || trimmedCityIds.length === 0) {
      throw new Error('Country, state and city are required for global post');
    }
  }

  if (trimmedStateId && !trimmedCountryId) {
    throw new Error('Country is required when state is provided');
  }

  if (trimmedCityIds.length > 0 && !trimmedStateId) {
    throw new Error('State is required when city is provided');
  }

  if (trimmedStateId && trimmedCountryId) {
    const state = await prisma.state.findUnique({
      where: { id: trimmedStateId },
      select: { countryId: true },
    });

    if (!state || state.countryId !== trimmedCountryId) {
      throw new Error('State does not belong to selected country');
    }
  }

  if (trimmedCityIds.length > 0 && trimmedStateId) {
    const count = await prisma.city.count({
      where: { id: { in: trimmedCityIds }, stateId: trimmedStateId },
    });

    if (count !== trimmedCityIds.length) {
      throw new Error('One or more cities do not belong to selected state');
    }
  }
};


