import { DspaceProvisionerService } from "./dspace-provisioner.service";
export declare class DspacePublishService {
    private readonly dspaceProvisioner;
    private readonly db;
    private readonly logger;
    constructor(dspaceProvisioner: DspaceProvisionerService);
    publishApprovedSubmission(submissionId: string): Promise<{
        dspaceItemId: string;
    }>;
}
