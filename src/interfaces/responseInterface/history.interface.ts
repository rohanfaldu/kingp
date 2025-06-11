// formatters/transactionFormatter.ts

import { Earnings, Withdraw } from '@prisma/client';
import { TransactionType } from '../../enums/userType.enum';

export interface TransactionHistoryItem {
  id: string;
  type: 'EARNING' | 'WITHDRAWAL';
  transactionType: TransactionType;
  amount: number;
  totalAmount?: number;
  status: string;
  source: string | null;
  orderId?: string | null;
  groupId?: string | null;
  createdAt: Date | string;
  orderDetails?: any | null;
}

export function formatEarningToTransaction(earning: Earnings & any): TransactionHistoryItem {
  return {
    id: earning.id,
    type: 'EARNING',
    transactionType: TransactionType.CREDIT,
    amount: earning.earningAmount ?? 0,
    totalAmount: earning.amount ?? 0,
    status: earning.paymentStatus,
    source:
      earning.orderData?.businessOrderData?.name ||
      earning.businessPaymentData?.name ||
      null,
    orderId: earning.orederId,
    title: earning.orderData.title,
    description: earning.orderData.description,
    groupId: earning.groupId,
    createdAt: earning.createdAt ?? new Date(),
    orderDetails: earning.orderData?.businessOrderData || null,
  };
}

export function formatWithdrawToTransaction(withdraw: Withdraw): TransactionHistoryItem {
  return {
    id: withdraw.id,
    type: 'WITHDRAWAL',
    transactionType: TransactionType.DEBIT,
    amount: withdraw.withdrawAmount ?? 0,
    totalAmount: 0,
    status: 'COMPLETED',
    source: 'Withdrawal',
    orderId: null,
    title: null,
    description: null,
    groupId: null,
    createdAt: withdraw.createdAt ?? new Date(),
    orderDetails: null,
  };
}
