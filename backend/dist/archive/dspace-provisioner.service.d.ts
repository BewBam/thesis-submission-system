export type DspaceProvisionResult = {
    id: string;
    mode: "dspace" | "dev";
};
export declare class DspaceProvisionerService {
    private readonly db;
    private readonly logger;
    private getSetting;
    private isDspaceConfigured;
    private dspaceRequest;
    createFacultyCommunity(name: string): Promise<DspaceProvisionResult>;
    createSemesterStructure(facultyCommunityId: string, semesterCode: string, semesterName: string, collectionName: string): Promise<{
        communityId: string;
        collectionId: string;
        mode: "dspace" | "dev";
    }>;
    publishItemPlaceholder(collectionId: string, title: string): Promise<string>;
}
