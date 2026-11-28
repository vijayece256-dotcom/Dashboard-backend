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

Team routes are under `/api/v1/team` and require an admin bearer access token. Team names are unique regardless of letter case. Teams include `projectId`, an array of generated project IDs linked to that team; project POST/PUT keeps these mappings in sync with `teamId`.

- `POST /api/v1/team-designation` — create a team and its designation together with `{ "teamName": "Platform", "designationName": "Engineer" }`. Both records are created with `isActive: true`.

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

Project routes are under `/api/v1/project` and require an admin bearer access token. `projectOwner` is a required string. `teamId` is a non-empty array of MongoDB IDs for active teams, and `assignedEmployees` is an optional array of active employee customer IDs. The server generates immutable IDs such as `PRJ-1001`; project names are unique without regard to case.

- `POST /api/v1/project` — create a project.
- `PUT /api/v1/project/:id` — edit a project using its MongoDB `_id`.
- `GET /api/v1/project` — list the requested project fields; each result includes `team: [{ _id, teamName }]`.
- `GET /api/v1/project/:id` — retrieve a project by its MongoDB `_id`, including `team: [{ _id, teamName }]`.
- `DELETE /api/v1/project/:id` — permanently delete a project.

### Project comments

Comment routes accept a MongoDB project `_id` or generated project ID (for example, `PRJ-1001`) in `:projectId`. Admin and employee tokens are allowed. The request body contains only `comments`; the author ID is taken from the token. Responses include `employeeDetails: { employeeId, employeeName }`. Only the author can update or delete a comment.

- `POST /api/v1/project/:projectId/comments` — add a comment.
- `GET /api/v1/project/:projectId/comments` — list comments for the project.
- `PUT /api/v1/project/:projectId/comments/:commentId` — edit a comment.
- `DELETE /api/v1/project/:projectId/comments/:commentId` — delete a comment.

### Activity history

Project and task creation, changes, deletion, and comment add/edit/delete actions are recorded in `tl_activity_history` and mirrored to `tl_project_activity`. Updates include changed fields and their previous/new values. `GET /api/v1/activity-history` requires an admin token and returns history newest first. Use `?activityType=project&projectId=<MongoDB ObjectId>` for project history or `?activityType=task&taskId=<MongoDB ObjectId>` for task history. Exactly one matching ID is required. `type` in each history record identifies the target kind; `projectId` and `taskId` are MongoDB ObjectIds. The legacy project history API at `/api/v1/project/:projectId/activities` remains available.

Task comments can be added, listed, edited, and deleted at `/api/v1/task/:taskId/comments` (the path accepts a task MongoDB `_id` or task ticket ID). Only the author can edit or delete a comment.

## Board API

- `GET /api/v1/board` — requires an admin or employee bearer token. Admins receive all active teams; employees receive their assigned active team. Response: `{ "boardList": [{ "_id": "...", "teamName": "..." }] }`.

## Task API

Task GET is available to admins and employees; POST, PUT, and DELETE require an admin bearer access token. `POST /api/v1/task?boardId=<teamId>` creates a task; the API uses `boardId` as `teamId` and generates `taskTicketId` (for example, `BSOF-1001`); MongoDB generates `_id` as an ObjectId. Counters start at 1001 for each ticket prefix. `PUT /api/v1/task/:id` updates a task by its MongoDB `_id`; `DELETE /api/v1/task/:id` deletes one and returns the updated list. Both endpoints accept `title`, `description`, MongoDB `projectId`, optional `teamId` on PUT, `priority` (`High`, `Medium`, or `Low`), `dueDate` (`DD-MM-YYYY`), optional `status` (defaults to `New`), and optional `employeeId`. `employeeId` is required when status is `InProgress`, `Completed`, or `OnHold`. Both return the full task list. Changing teamId on PUT keeps the existing taskTicketId. `GET /api/v1/task` returns all tasks for admins. For employees, `?allTasks=true` returns tasks in their assigned projects; `?allTasks=false` or omitting the parameter returns tasks assigned directly to them, grouped under camelCase team-name keys such as `softwareTeam`; each task contains `_id`, `taskId` (the taskTicketId value), `teamId`, `title`, `description`, `priority`, `dueDate`, reporter details, and an `employee` object with `firstName`, `lastName`, and `email` (empty when unassigned). POST derives `reporterId` from the authenticated token. `GET /api/v1/task/:id` retrieves one task by MongoDB `_id` or `taskTicketId`; employees can retrieve tasks assigned to them or belonging to projects assigned to them.
