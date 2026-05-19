"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DspaceProvisionerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DspaceProvisionerService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const db_pool_1 = require("../users/db-pool");
let DspaceProvisionerService = DspaceProvisionerService_1 = class DspaceProvisionerService {
    constructor() {
        this.db = (0, db_pool_1.createPgPool)();
        this.logger = new common_1.Logger(DspaceProvisionerService_1.name);
    }
    async getSetting(key) {
        const result = await this.db.query(`SELECT value FROM system_settings WHERE key = $1 LIMIT 1`, [key]);
        return result.rows[0]?.value?.trim() || "";
    }
    async isDspaceConfigured() {
        const baseUrl = await this.getSetting("dspace_api_base_url");
        const token = await this.getSetting("dspace_api_token");
        return Boolean(baseUrl && token);
    }
    async dspaceRequest(method, path, body) {
        const baseUrl = (await this.getSetting("dspace_api_base_url")).replace(/\/$/, "");
        const token = await this.getSetting("dspace_api_token");
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`DSpace ${method} ${path} failed (${response.status}): ${text}`);
        }
        const payload = (await response.json());
        const id = payload.id || payload.uuid;
        if (!id) {
            throw new Error("DSpace response missing community/collection id");
        }
        return { id };
    }
    async createFacultyCommunity(name) {
        if (!(await this.isDspaceConfigured())) {
            return { id: `dev-community-${(0, node_crypto_1.randomUUID)()}`, mode: "dev" };
        }
        try {
            const parentId = await this.getSetting("dspace_root_community_id");
            const body = {
                name,
                metadata: {
                    "dc.title": [{ value: name, language: null, authority: null, confidence: -1, place: 0 }]
                }
            };
            if (parentId) {
                const created = await this.dspaceRequest("POST", `/api/core/communities/${parentId}/subcommunities`, body);
                return { id: created.id, mode: "dspace" };
            }
            const created = await this.dspaceRequest("POST", "/api/core/communities", body);
            return { id: created.id, mode: "dspace" };
        }
        catch (error) {
            this.logger.warn(`DSpace faculty community fallback: ${error instanceof Error ? error.message : error}`);
            return { id: `dev-community-${(0, node_crypto_1.randomUUID)()}`, mode: "dev" };
        }
    }
    async createSemesterStructure(facultyCommunityId, semesterCode, semesterName, collectionName) {
        if (!(await this.isDspaceConfigured())) {
            return {
                communityId: `dev-semester-${(0, node_crypto_1.randomUUID)()}`,
                collectionId: `dev-collection-${(0, node_crypto_1.randomUUID)()}`,
                mode: "dev"
            };
        }
        try {
            const sub = await this.dspaceRequest("POST", `/api/core/communities/${facultyCommunityId}/subcommunities`, {
                name: semesterName,
                metadata: {
                    "dc.title": [{ value: semesterName, language: null, authority: null, confidence: -1, place: 0 }]
                }
            });
            const collection = await this.dspaceRequest("POST", "/api/core/collections", {
                name: collectionName,
                metadata: {
                    "dc.title": [{ value: collectionName, language: null, authority: null, confidence: -1, place: 0 }]
                },
                parentCommunity: { id: sub.id }
            });
            return { communityId: sub.id, collectionId: collection.id, mode: "dspace" };
        }
        catch (error) {
            this.logger.warn(`DSpace semester structure fallback: ${error instanceof Error ? error.message : error}`);
            return {
                communityId: `dev-semester-${(0, node_crypto_1.randomUUID)()}`,
                collectionId: `dev-collection-${(0, node_crypto_1.randomUUID)()}`,
                mode: "dev"
            };
        }
    }
    async publishItemPlaceholder(collectionId, title) {
        if (!(await this.isDspaceConfigured())) {
            return `dev-item-${(0, node_crypto_1.randomUUID)()}`;
        }
        try {
            const item = await this.dspaceRequest("POST", "/api/core/items", {
                name: title,
                inArchive: true,
                discoverable: true,
                withdrawn: false,
                metadata: {
                    "dc.title": [{ value: title, language: null, authority: null, confidence: -1, place: 0 }]
                }
            });
            await this.dspaceRequest("POST", `/api/core/items/${item.id}/owningCollection`, {
                id: collectionId
            });
            return item.id;
        }
        catch (error) {
            this.logger.warn(`DSpace publish fallback: ${error instanceof Error ? error.message : error}`);
            return `dev-item-${(0, node_crypto_1.randomUUID)()}`;
        }
    }
};
exports.DspaceProvisionerService = DspaceProvisionerService;
exports.DspaceProvisionerService = DspaceProvisionerService = DspaceProvisionerService_1 = __decorate([
    (0, common_1.Injectable)()
], DspaceProvisionerService);
//# sourceMappingURL=dspace-provisioner.service.js.map