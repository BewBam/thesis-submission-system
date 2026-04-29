import type { JwtPayload } from "../auth/jwt.strategy";
import { ReviewActionDto } from "./dto/review-action.dto";
export declare class ReviewsService {
    private readonly db;
    getMyQueue(user: JwtPayload): Promise<any[]>;
    act(user: JwtPayload, dto: ReviewActionDto): Promise<{
        ok: boolean;
    }>;
    getAdminQueue(user: JwtPayload): Promise<any[]>;
    adminAct(user: JwtPayload, dto: ReviewActionDto): Promise<{
        ok: boolean;
    }>;
}
