import { UserType, Gender, LoginType, AvailabilityType } from '../enums/userType.enum'; 
import { ISocialMediaPlatform } from '../interfaces/socialMedia.interface'

export interface IUser {
  type?: UserType;
  name?: string;
  emailAddress: string;
  password?: string;
  countryId?: string;
  subcategoriesId?: string[];
  brandTypeId?: string;
  referralCode?: string;
  userImage?: string;
  applicationLink?: string;
  description?: string;
  contactPersonName?: string;
  contactPersonPhoneNumber?: string;
  gstNumber?: string;
  status?: boolean;
  workEmail?: string;
  socialMediaPlatform?: ISocialMediaPlatform[];
  birthDate?: Date;
  gender?: Gender;
  cityId?: string;
  stateId?: string;
  socialMediaLink?: string;
  sampleWorkLink?: string;
  aboutYou?: string;
  bio?: string;
  socialId?: String;
  LoginType?: LoginType,
  availability? : AvailabilityType,
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}


export type RequiredUser = Required<Pick<IUser, 'emailAddress' | 'password' >> & Omit<IUser, 'emailAddress' | 'password' >;