export interface IUserBankDetails {
  userId: string;
  accountId?: string;
  accountNumber: number;
  ifscCode: string;
  accountHolderName: string;
  status: Boolean;
}
