# Wiremock Data Structure Instructions

## Purpose
This folder mocks the Recruitment Business Logic API described in `wiremock/__files/recruitment-openapi.yaml`.

## Folder Layout
- `wiremock/mappings/`
  - WireMock request matchers and response definitions.
  - Each mapping points to a file in `wiremock/__files/` via `bodyFileName` (or inline `jsonBody` for errors).
- `wiremock/__files/`
  - JSON payload files used by mappings.
  - Includes OpenAPI contract and list/detail payloads.

## Endpoint Model
- `GET /v1/ping`
  - Mapping: `mappings/ping.json`
  - Returns status `200` (empty body).

- `GET /v1/job-postings`
  - Mapping: `mappings/list-job-postings.json`
  - Body file: `__files/job-postings-list.json`
  - Response shape:
    - `jobPostings: JobPostingListItem[]`
    - `paging: { limit, offset, returned, hasMore }`

- `GET /v1/recruitment-processes/{recruitmentId}`
  - Mappings: `mappings/get-recruitment-process-<id>.json`
  - Body files: `__files/recruitment-process-<id>.json`
  - Exact `url` match is used for concrete IDs.

- `GET /v1/job-postings/{jobPostingId}`
  - Mappings: `mappings/get-job-posting-<idprefix>.json`
  - Body files: `__files/job-posting-<full-uuid>.json`
  - Exact `url` match is used for concrete IDs.

## Fallback/Not Found Behavior
- `mappings/get-recruitment-process-not-found.json`
  - `urlPathPattern: /v1/recruitment-processes/[^/]+`
  - `priority: 10`
  - Returns `404` with `application/problem+json`.

- `mappings/get-job-posting-not-found.json`
  - `urlPathPattern: /v1/job-postings/[^/]+`
  - `priority: 10`
  - Returns `404` with `application/problem+json`.

Specific ID mappings use `priority: 1`, so they win over fallback mappings.

## Core Payload Schemas

### JobPostingListResponse (`__files/job-postings-list.json`)
- Top-level keys:
  - `jobPostings` (array)
  - `paging` (object)

### JobPostingListItem (elements in `jobPostings`)
Common keys:
- `jobPostingId` (uuid)
- `recruitmentId` (int)
- `titleDa`, `titleEn` (nullable string)
- `shortTextDa`, `shortTextEn` (nullable string)
- `publicationDate` (date-time)
- `applicationDeadline` (date-time)
- `applicationLink` (url)
- `languages` (`["da"]`, `["en"]`, or both)
- `recruitmentStatus` (int, typically `1` in sample data)
- `departmentCode` (int)
- `departmentNameDa`, `departmentNameEn` (string)
- `positionTypeDa`, `positionTypeEn` (string)
- `lastUpdated` (date-time)

### Recruitment Detail (`__files/recruitment-process-<id>.json` and `__files/job-posting-<uuid>.json`)
Top-level:
- `recruitment`

Nested structure under `recruitment`:
- `recruitmentId`
- `jobPosting`
  - `jobPostingId`
  - `titleDa/titleEn`, `shortTextDa/shortTextEn`
  - `descriptionDa` / `descriptionEn`
    - each can be `null` or object with:
      - `technicalText`
      - `hrText`
      - `auText`
  - `publicationDate`
  - `applicationDeadline`
  - `applicationLink`
  - `languages`
  - `lastUpdated`
- `employment`
  - `period.startDate`
  - `period.endDate` (nullable)
  - `hoursPerWeek` (number)
  - `fixedSalary` (nullable bool)
- `organization`
  - `departmentCode`
  - `departmentNameDa`
  - `departmentNameEn`
- `position`
  - `positionTypeCode`
  - `positionTypeDa`
  - `positionTypeEn`
- `contacts`
  - `technicalContactAuid`
  - `hrContactAuid`
- `address`
  - `postalCode`
  - `city`

## Linking Rules (Important)
- `job-postings-list.json`: each item links list -> detail by both:
  - `jobPostingId` -> `/v1/job-postings/{jobPostingId}`
  - `recruitmentId` -> `/v1/recruitment-processes/{recruitmentId}`
- Detail payloads repeat both IDs for cross-reference consistency.

## Naming Conventions
- Recruitment detail payload filename:
  - `__files/recruitment-process-<recruitmentId>.json`
- Job posting detail payload filename:
  - `__files/job-posting-<full-jobPostingId-uuid>.json`
- Mapping filenames are shortened identifiers, but mapping `request.url` and `response.bodyFileName` determine real linkage.

## Adding New Mock Data
1. Add payload(s) to `__files/`.
2. Add mapping(s) to `mappings/` with:
   - exact `request.url`
   - `response.status: 200`
   - `response.bodyFileName` pointing to your payload file.
3. Keep fallback 404 mappings unchanged.
4. If list endpoint should expose the record, append an item in `job-postings-list.json` and keep `paging.returned` consistent.
