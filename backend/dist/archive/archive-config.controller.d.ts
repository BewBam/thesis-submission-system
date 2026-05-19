import type { JwtPayload } from "../auth/jwt.strategy";
import { ArchiveConfigService } from "./archive-config.service";
import { CreateFacultyDto } from "./dto/create-faculty.dto";
import { CreateSemesterDto } from "./dto/create-semester.dto";
import { CreateSubmissionPeriodDto } from "./dto/create-submission-period.dto";
import { UpdateFacultyDto } from "./dto/update-faculty.dto";
export declare class ArchiveConfigController {
    private readonly archiveConfigService;
    constructor(archiveConfigService: ArchiveConfigService);
    listUniversities(): Promise<{
        id: any;
        code: any;
        name: any;
        status: any;
    }[]>;
    listFaculties(): Promise<{
        id: unknown;
        universityId: unknown;
        universityName: unknown;
        code: unknown;
        name: unknown;
        status: unknown;
        dspaceCommunityId: unknown;
        dspaceSyncStatus: unknown;
        semesterCount: {};
        openPeriodCount: {};
        createdAt: unknown;
        updatedAt: unknown;
    }[]>;
    createFaculty(req: {
        user: JwtPayload;
    }, body: CreateFacultyDto): Promise<{
        id: unknown;
        universityId: unknown;
        universityName: unknown;
        code: unknown;
        name: unknown;
        status: unknown;
        dspaceCommunityId: unknown;
        dspaceSyncStatus: unknown;
        semesterCount: {};
        openPeriodCount: {};
        createdAt: unknown;
        updatedAt: unknown;
    }>;
    updateFaculty(facultyId: string, body: UpdateFacultyDto): Promise<{
        id: unknown;
        universityId: unknown;
        universityName: unknown;
        code: unknown;
        name: unknown;
        status: unknown;
        dspaceCommunityId: unknown;
        dspaceSyncStatus: unknown;
        semesterCount: {};
        openPeriodCount: {};
        createdAt: unknown;
        updatedAt: unknown;
    }>;
    provisionFaculty(facultyId: string): Promise<{
        id: unknown;
        universityId: unknown;
        universityName: unknown;
        code: unknown;
        name: unknown;
        status: unknown;
        dspaceCommunityId: unknown;
        dspaceSyncStatus: unknown;
        semesterCount: {};
        openPeriodCount: {};
        createdAt: unknown;
        updatedAt: unknown;
    }>;
    listSemesters(facultyId: string): Promise<{
        id: unknown;
        facultyId: unknown;
        code: unknown;
        name: unknown;
        status: unknown;
        collectionName: unknown;
        dspaceCommunityId: unknown;
        dspaceCollectionId: unknown;
        dspaceSyncStatus: unknown;
        createdAt: unknown;
    }[]>;
    createSemester(req: {
        user: JwtPayload;
    }, facultyId: string, body: CreateSemesterDto): Promise<{
        id: unknown;
        facultyId: unknown;
        code: unknown;
        name: unknown;
        status: unknown;
        collectionName: unknown;
        dspaceCommunityId: unknown;
        dspaceCollectionId: unknown;
        dspaceSyncStatus: unknown;
        createdAt: unknown;
    }>;
    listSubmissionPeriods(facultyId: string): Promise<{
        id: any;
        facultyId: any;
        semesterId: any;
        semesterCode: any;
        semesterName: any;
        name: any;
        opensAt: any;
        closesAt: any;
        status: any;
        allowResubmit: any;
        createdAt: any;
        updatedAt: any;
    }[]>;
    createSubmissionPeriod(req: {
        user: JwtPayload;
    }, facultyId: string, body: CreateSubmissionPeriodDto): Promise<{
        id: any;
        facultyId: any;
        semesterId: any;
        semesterCode: any;
        semesterName: any;
        name: any;
        opensAt: any;
        closesAt: any;
        status: any;
        allowResubmit: any;
        createdAt: any;
        updatedAt: any;
    }>;
    openPeriod(periodId: string): Promise<{
        id: any;
        facultyId: any;
        semesterId: any;
        semesterCode: any;
        semesterName: any;
        name: any;
        opensAt: any;
        closesAt: any;
        status: any;
        allowResubmit: any;
        createdAt: any;
        updatedAt: any;
    }>;
    closePeriod(periodId: string): Promise<{
        id: any;
        facultyId: any;
        semesterId: any;
        semesterCode: any;
        semesterName: any;
        name: any;
        opensAt: any;
        closesAt: any;
        status: any;
        allowResubmit: any;
        createdAt: any;
        updatedAt: any;
    }>;
}
