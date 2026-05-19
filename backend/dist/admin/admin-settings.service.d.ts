export declare class AdminSettingsService {
    private readonly db;
    list(): Promise<{
        key: string;
        value: string;
        description: string;
        updatedAt: Date;
    }[]>;
    update(settings: Record<string, string>): Promise<{
        key: string;
        value: string;
        description: string;
        updatedAt: Date;
    }[]>;
    getValue(key: string): Promise<string | undefined>;
}
