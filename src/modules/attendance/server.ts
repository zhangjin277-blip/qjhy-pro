import "server-only";
// Attendance now uses the preserved PRO3 rules and local SQLite data.
// The superseded PostgreSQL tables remain intact as migration history.
export { attendanceActor } from "./pro3/access";
export { dispatch as dispatchAttendanceRequest } from "./pro3/server/dispatch";
