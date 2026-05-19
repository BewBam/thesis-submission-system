"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DspacePublishService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DspacePublishService = void 0;
const common_1 = require("@nestjs/common");
const db_pool_1 = require("../users/db-pool");
const dspace_provisioner_service_1 = require("./dspace-provisioner.service");
let DspacePublishService = DspacePublishService_1 = class DspacePublishService {
    constructor(dspaceProvisioner) {
        this.dspaceProvisioner = dspaceProvisioner;
        this.db = (0, db_pool_1.createPgPool)();
        this.logger = new common_1.Logger(DspacePublishService_1.name);
    }
    async publishApprovedSubmission(submissionId) {
        const result = await this.db.query(`SELECT COALESCE(NULLIF(s.title_en, ''), s.title) AS title,
              s.status,
              s.dspace_item_id,
              sem.dspace_collection_id
       FROM submissions s
       LEFT JOIN submission_periods sp ON sp.id = s.submission_period_id
       LEFT JOIN semesters sem ON sem.id = sp.semester_id
       WHERE s.id = $1::uuid
       LIMIT 1`, [submissionId]);
        const row = result.rows[0];
        if (!row) {
            throw new common_1.NotFoundException("Submission not found");
        }
        if (row.status !== "approved" && row.status !== "archived") {
            return { dspaceItemId: row.dspace_item_id || "" };
        }
        if (row.dspace_item_id) {
            return { dspaceItemId: row.dspace_item_id };
        }
        if (!row.dspace_collection_id) {
            this.logger.warn(`Submission ${submissionId} has no DSpace collection; skipping publish`);
            return { dspaceItemId: "" };
        }
        const itemId = await this.dspaceProvisioner.publishItemPlaceholder(row.dspace_collection_id, row.title);
        await this.db.query(`UPDATE submissions SET dspace_item_id = $1 WHERE id = $2::uuid`, [itemId, submissionId]);
        return { dspaceItemId: itemId };
    }
};
exports.DspacePublishService = DspacePublishService;
exports.DspacePublishService = DspacePublishService = DspacePublishService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dspace_provisioner_service_1.DspaceProvisionerService])
], DspacePublishService);
//# sourceMappingURL=dspace-publish.service.js.map