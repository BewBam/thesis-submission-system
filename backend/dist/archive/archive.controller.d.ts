import { SubmissionPeriodsService } from "./submission-periods.service";
export declare class ArchiveController {
    private readonly submissionPeriodsService;
    constructor(submissionPeriodsService: SubmissionPeriodsService);
    listFaculties(): Promise<{
        id: any;
        code: any;
        name: any;
        universityId: any;
        universityName: any;
    }[]>;
    listSemesters(facultyId: string): Promise<{
        id: any;
        code: any;
        name: any;
        facultyId: any;
        facultyName: any;
        universityName: any;
    }[]>;
    listOpenPeriods(facultyId: string, semesterId: string): never[] | Promise<{
        id: any;
        name: any;
        opensAt: any;
        closesAt: any;
        allowResubmit: any;
        facultyId: any;
        facultyCode: any;
        facultyName: any;
        semesterId: any;
        semesterCode: any;
        semesterName: any;
        universityId: any;
        universityName: any;
    }[]>;
}
