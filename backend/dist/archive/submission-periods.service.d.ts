export type OpenPeriodContext = {
    periodId: string;
    periodName: string;
    facultyId: string;
    facultyCode: string;
    facultyName: string;
    semesterId: string;
    semesterCode: string;
    semesterName: string;
    universityId: string;
    universityName: string;
    allowResubmit: boolean;
};
export declare class SubmissionPeriodsService {
    private readonly db;
    private openPeriodFilter;
    listFacultiesWithOpenPeriods(): Promise<{
        id: any;
        code: any;
        name: any;
        universityId: any;
        universityName: any;
    }[]>;
    listSemestersWithOpenPeriods(facultyId: string): Promise<{
        id: any;
        code: any;
        name: any;
        facultyId: any;
        facultyName: any;
        universityName: any;
    }[]>;
    listOpenPeriods(facultyId: string, semesterId: string): Promise<{
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
    resolveOpenPeriod(periodId: string): Promise<OpenPeriodContext>;
    assertPeriodAllowsResubmit(periodId: string | null): Promise<void>;
}
