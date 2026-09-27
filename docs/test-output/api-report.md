# API test

- Thời điểm: 2026-09-25T06:25:26.777Z
- Đích: local (thesis_test)
- Tổng: 42
- Passed: 42
- Failed: 0
- Skipped: 0

| File | Test | Kết quả | Thời gian |
|---|---|---|---|
| reviews.e2e-spec.ts | TC-REV-001 shows only submissions assigned to the reviewer | passed | 313 ms |
| reviews.e2e-spec.ts | TC-REV-002 keeps status reviewing and opens the library queue after the only reviewer approves | passed | 141 ms |
| reviews.e2e-spec.ts | TC-REV-003 waits for every reviewer before library intake | passed | 188 ms |
| reviews.e2e-spec.ts | TC-REV-004 requires a comment when a reviewer rejects | passed | 103 ms |
| reviews.e2e-spec.ts | TC-REV-005 stores the reject reason and leaves the library queue | passed | 118 ms |
| reviews.e2e-spec.ts | TC-REV-006 blocks a reviewer who is not assigned | passed | 117 ms |
| reviews.e2e-spec.ts | TC-REV-007 blocks a second decision | passed | 130 ms |
| reviews.e2e-spec.ts | TC-REV-008 forbids students and library staff from reviewer actions | passed | 95 ms |
| reviews.e2e-spec.ts | TC-LIB-001 approves intake and shows the thesis to the director | passed | 129 ms |
| reviews.e2e-spec.ts | TC-LIB-002 rejects intake and stores the reason | passed | 128 ms |
| reviews.e2e-spec.ts | TC-LIB-003 requires a library reject comment | passed | 112 ms |
| reviews.e2e-spec.ts | TC-LIB-004 refuses intake while a reviewer is still pending | passed | 125 ms |
| reviews.e2e-spec.ts | TC-LIB-005 refuses archive from library staff | passed | 69 ms |
| reviews.e2e-spec.ts | TC-DIR-001 archives an approved thesis without publishing immediately | passed | 130 ms |
| reviews.e2e-spec.ts | TC-DIR-002 lets the director reject an approved thesis | passed | 133 ms |
| reviews.e2e-spec.ts | TC-DIR-003 refuses archive unless the thesis is approved | passed | 84 ms |
| reviews.e2e-spec.ts | TC-DIR-004 forbids reviewer and library staff from director actions | passed | 92 ms |
| submissions.e2e-spec.ts | TC-SUB-001 creates a reviewing submission with a pending review | passed | 248 ms |
| submissions.e2e-spec.ts | TC-SUB-002 saves a draft then submits it | passed | 142 ms |
| submissions.e2e-spec.ts | TC-SUB-003 rejects a submission without titles | passed | 45 ms |
| submissions.e2e-spec.ts | TC-SUB-004 rejects a submission without an open period | passed | 42 ms |
| submissions.e2e-spec.ts | TC-SUB-005 rejects a submission without reviewers | passed | 46 ms |
| submissions.e2e-spec.ts | TC-SUB-006 forbids submitting as another student | passed | 79 ms |
| submissions.e2e-spec.ts | TC-SUB-007 rejects an anonymous submission | passed | 38 ms |
| submissions.e2e-spec.ts | TC-SUB-008 allows only one non-draft thesis per student | passed | 153 ms |
| submissions.e2e-spec.ts | TC-PDF-001 stores a thesis PDF that the owner can download | passed | 126 ms |
| submissions.e2e-spec.ts | TC-PDF-002 rejects submit when the PDF is missing | passed | 55 ms |
| submissions.e2e-spec.ts | TC-PDF-003 rejects a non-PDF upload | passed | 38 ms |
| submissions.e2e-spec.ts | TC-PDF-004 rejects a PDF larger than 30 MB | passed | 308 ms |
| submissions.e2e-spec.ts | TC-PDF-005 accepts a PDF filename with spaces and unicode | passed | 108 ms |
| submissions.e2e-spec.ts | TC-PDF-006 enforces download permissions | passed | 308 ms |
| submissions.e2e-spec.ts | TC-PDF-007 keeps the existing PDF when resubmitting without a new file | passed | 283 ms |
| submissions.e2e-spec.ts | TC-RES-001 resubmits after reviewer rejection and resets the review | passed | 187 ms |
| submissions.e2e-spec.ts | TC-RES-002 resubmits after library rejection | passed | 173 ms |
| submissions.e2e-spec.ts | TC-RES-003 resubmits an approved thesis before archive | passed | 181 ms |
| submissions.e2e-spec.ts | TC-RES-004 refuses resubmit after archive | passed | 180 ms |
| submissions.e2e-spec.ts | TC-RES-005 refuses another submit while a reviewer has already decided | passed | 140 ms |
| dspace-publish.e2e-spec.ts | TC-DSP-001 archives in the portal before any publish call | passed | 484 ms |
| dspace-publish.e2e-spec.ts | TC-DSP-002 rejects publish without a collection or submissions | passed | 131 ms |
| dspace-publish.e2e-spec.ts | TC-DSP-003 skips publish for a thesis that is still reviewing | passed | 109 ms |
| dspace-publish.e2e-spec.ts | TC-DSP-004 forbids students and reviewers from publishing | passed | 137 ms |
| dspace-publish.e2e-spec.ts | TC-DSP-005 keeps the archived thesis when DSpace is missing or fails | passed | 176 ms |
