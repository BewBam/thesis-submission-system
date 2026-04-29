import type { JwtPayload } from "../auth/jwt.strategy";
import { ReviewActionDto } from "./dto/review-action.dto";
import { ReviewsService } from "./reviews.service";
export declare class ReviewsController {
    private readonly reviewsService;
    constructor(reviewsService: ReviewsService);
    myQueue(req: {
        user: JwtPayload;
    }): Promise<any[]>;
    act(req: {
        user: JwtPayload;
    }, body: ReviewActionDto): Promise<{
        ok: boolean;
    }>;
    adminQueue(req: {
        user: JwtPayload;
    }): Promise<any[]>;
    adminAct(req: {
        user: JwtPayload;
    }, body: ReviewActionDto): Promise<{
        ok: boolean;
    }>;
}
