import { RequiredUser } from "../interfaces/user.interface";

export function validateUser(user: RequiredUser): boolean {
    if (!user.emailAddress || !user.password) {
        throw new Error('Both emailAddress and password are required.');
    }
    return true;
}