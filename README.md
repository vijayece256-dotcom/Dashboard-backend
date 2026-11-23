# Balnus Backend

## Run locally

Copy `.env.example` to `.env` and set `MONGODB_URI` and a cryptographically random `JWT_ACCESS_SECRET` of at least 32 bytes. Then run `npm install` and `npm run dev`.

## Authentication endpoints

- `POST /api/v1/auth/register` — creates an active `employee` and returns an access token and refresh token. Public registration cannot assign the `admin` role or set `isActive`.
- `POST /api/v1/auth/login` — accepts `emailaddress` and `password`.
- `POST /api/v1/auth/refresh` — accepts `refreshtoken`, revokes it, and returns a rotated token pair.
- `POST /api/v1/auth/logout` — requires `Authorization: Bearer <token>` and revokes that login session immediately.

The access token lifetime is 30 minutes. Refresh tokens are valid for one day and rotated on use. Only token hashes are stored in MongoDB. Registration accepts these fields: `username`, `firstname`, `lastname`, `phonenumber`, `emailaddress`, `password`, and `userType`. Use `employee` for public registration; admin accounts must be provisioned through a trusted administrative process. Username, emailaddress, and phonenumber must be unique. Send `phonenumber` as a string to preserve leading zeroes.

The OpenAPI/Swagger specification is in [`swagger.yaml`](swagger.yaml).

## Team API

Team routes are under `/api/v1/team` and require an admin bearer access token. Team names are unique regardless of letter case.

- `GET /api/v1/team` — list teams.
- `GET /api/v1/team/:teamId` — get a team.
- `POST /api/v1/team` — create with `{ "teamName": "Platform", "isActive": true }`.
- `PUT /api/v1/team/:teamId` — replace the team; both fields are required.
- `DELETE /api/v1/team/:teamId` — permanently delete a team.

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
