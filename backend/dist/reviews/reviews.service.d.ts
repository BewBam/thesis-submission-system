import { DspacePublishService } from "../archive/dspace-publish.service";
import type { JwtPayload } from "../auth/jwt.strategy";
import { ReviewActionDto } from "./dto/review-action.dto";
export declare class ReviewsService {
    private readonly dspacePublishService;
    private readonly db;
    constructor(dspacePublishService: DspacePublishService);
    private libraryIntakeReadyClause;
    getMyQueue(user: JwtPayload): Promise<any[]>;
    act(user: JwtPayload, dto: ReviewActionDto): Promise<{
        ok: boolean;
    }>;
    private getQueueRows;
    getLibraryQueue(user: JwtPayload): Promise<any[]>;
    getDirectorQueue(user: JwtPayload): Promise<any[]>;
    private assertLibraryIntakeReady;
    libraryAct(user: JwtPayload, dto: ReviewActionDto): Promise<{
        ok: boolean;
    }>;
    directorAct(user: JwtPayload, dto: ReviewActionDto): Promise<{
        ok: boolean;
    }>;
}
