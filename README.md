# Balnus Backend

## Run locally

Copy `.env.example` to `.env` and set `MONGODB_URI` and a cryptographically random `JWT_ACCESS_SECRET` of at least 32 bytes. Then run `npm install` and `npm run dev`.

## Authentication endpoints

- `POST /api/v1/auth/login` — accepts `emailaddress` and `password`.
- `PUT /api/v1/auth/password` — requires the bearer token from login and accepts matching `newPassword` and `confirmPassword`; a successful password change returns a new token pair.
- `POST /api/v1/auth/refresh` — accepts `refreshtoken`, revokes it, and returns a rotated token pair.
- `POST /api/v1/auth/logout` — requires `Authorization: Bearer <token>` and revokes that login session immediately.

Access tokens last 5 minutes until `isPermanentPassword` is true, then last 30 minutes. Refresh tokens are valid for one day and rotated on use. Only token hashes are stored in MongoDB. Username, emailaddress, and phonenumber must be unique. Send `phonenumber` as a string to preserve leading zeroes.

Each successful login or password change revokes the customer’s existing access and refresh tokens before issuing the new pair.

## Employee API

- Employee routes require an admin bearer access token.
- `POST /api/v1/employee` — creates an employee with a temporary password, `teamId`, `designationId`, and `isActive`. `isPermanentPassword` is saved as `false`.
- `GET /api/v1/employee` — lists employees with `team: { _id, teamName }` and `designation: { _id, designationName }` instead of top-level team and designation IDs.
- `PUT /api/v1/employee/:employeeId` — updates employee details, team, designation, and active status. Passwords are changed through the auth password endpoint.
- `DELETE /api/v1/employee/:employeeId` — permanently deletes an employee and revokes their active tokens.

On first login with a temporary password, the API returns `NEW_PASSWORD_REQUIRED`, the `employeeId`, and a 5-minute bearer token for the password change. The new password must be at least 9 characters and include an uppercase letter, a number, and a special character.

The OpenAPI/Swagger specification is in [`swagger.yaml`](swagger.yaml).

## Team API

Team routes are under `/api/v1/team` and require an admin bearer access token. Team names are unique regardless of letter case.

- `GET /api/v1/team` — list teams.
- `GET /api/v1/team/:teamId` — get a team.
- `POST /api/v1/team` — create with `{ "teamName": "Platform", "isActive": true }`.
- `PUT /api/v1/team/:teamId` — replace the team; both fields are required.
- `DELETE /api/v1/team/:teamId` — permanently delete a team.

## Designation API

Designation routes require an admin bearer access token. Each designation belongs to a team, and names are unique within that team regardless of letter case.

- `POST /api/v1/team/:teamId/designation` — create with `{ "name": "Engineering Manager", "isActive": true }`.
- `GET /api/v1/team/designation` — list designations with `team: { _id, teamName, isActive }` from the teams collection.
- `PUT /api/v1/team/:teamId/designation/:designationId` — replace both fields and assign the designation to the team in the path (updates `teamId`).
- `DELETE /api/v1/team/:teamId/designation/:designationId` — permanently delete a designation from that team.

## Project API

Project routes are under `/api/v1/project` and require an admin bearer access token. `projectOwner` is a required string. `teamId` is a MongoDB ID for an active team, and `assignedEmployees` is an optional array of active employee customer IDs. The server generates immutable IDs such as `PRJ-1001`; project names are unique without regard to case.

- `POST /api/v1/project` — create a project.
- `PUT /api/v1/project/:id` — edit a project using its MongoDB `_id`.
- `GET /api/v1/project` — list the requested project fields; each result includes `team: { _id, teamName }`.
- `GET /api/v1/project/:id` — retrieve a project by its MongoDB `_id`, including `team: { _id, teamName }`.
- `DELETE /api/v1/project/:id` — permanently delete a project.

### Project comments

Comment routes accept a MongoDB project `_id` or generated project ID (for example, `PRJ-1001`) in `:projectId`. Admin and employee tokens are allowed. The request body contains only `comments`; the author ID is taken from the token. Responses include `employeeDetails: { employeeId, employeeName }`. Only the author can update or delete a comment.

- `POST /api/v1/project/:projectId/comments` — add a comment.
- `GET /api/v1/project/:projectId/comments` — list comments for the project.
- `PUT /api/v1/project/:projectId/comments/:commentId` — edit a comment.
- `DELETE /api/v1/project/:projectId/comments/:commentId` — delete a comment.

### Project activity history

Project creation, changes, deletion, and comment add/edit/delete actions are recorded in `tl_project_activity`. Project edits include the changed fields and their previous/new values. `GET /api/v1/project/:projectId/activities` returns this history newest first and requires an admin token. The path accepts the MongoDB project `_id` or generated `projectID`.
