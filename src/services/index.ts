import { TokenPayload } from '../services/authorization';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}
