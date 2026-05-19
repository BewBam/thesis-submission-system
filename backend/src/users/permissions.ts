export const PERMISSIONS = [
  "submit_thesis",
  "review_academic",
  "library_intake",
  "director_approval",
  "view_all_submissions",
  "manage_users",
  "manage_roles",
  "configure_system"
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  submit_thesis: "Submit thesis",
  review_academic: "Academic review",
  library_intake: "Library intake review",
  director_approval: "Director final approval",
  view_all_submissions: "View all submissions",
  manage_users: "Manage users",
  manage_roles: "Manage roles",
  configure_system: "Configure system"
};
