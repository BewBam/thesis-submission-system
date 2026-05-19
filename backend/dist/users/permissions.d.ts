export declare const PERMISSIONS: readonly ["submit_thesis", "review_academic", "library_intake", "director_approval", "view_all_submissions", "manage_users", "manage_roles", "configure_system"];
export type Permission = (typeof PERMISSIONS)[number];
export declare const PERMISSION_LABELS: Record<Permission, string>;
