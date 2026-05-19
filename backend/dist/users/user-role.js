"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_ROLES = void 0;
exports.isUserRole = isUserRole;
exports.USER_ROLES = ["student", "reviewer", "library_staff", "director", "admin"];
function isUserRole(value) {
    return exports.USER_ROLES.includes(value);
}
//# sourceMappingURL=user-role.js.map