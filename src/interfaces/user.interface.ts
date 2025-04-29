import { UserType, BrandType } from '../enums/userType.enum'; 

export interface IUser {
  type?: UserType;
  name?: string;
  emailAddress: string;
  password: string;
  countryId?: string;
  brandType?: BrandType;
  referralCode?: string;
  userImage?: string;
  applicationLink?: string;
  description?: string;
  contactPersonName?: string;
  contactPersonPhoneNumber?: string;
  gstNumber?: string;
  status?: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}



export type RequiredUser = Required<Pick<IUser, 'emailAddress' | 'password' >> & Omit<IUser, 'emailAddress' | 'password' >;

// export interface ICreateUser {
//   email: string;
//   name?: string;
// }

// export interface IUpdateUser {
//   email?: string;
//   name?: string;
// }