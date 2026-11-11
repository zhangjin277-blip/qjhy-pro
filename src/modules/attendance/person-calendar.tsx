"use client";

import { useMemo } from "react";
import AttendanceView from "./pro3/ui/AttendanceView";
import { ToastContainer } from "./pro3/ui/Toast";
import "./pro3/ui/styles.css";
import "./pro3/ui/legacy-utilities.css";

export function PersonAttendanceCalendar({
  userId,
  name,
  onClose,
}: {
  userId: string;
  name: string;
  onClose: () => void;
}) {
  const person = useMemo(() => ({ userId, name, department: "" }), [userId, name]);
  return (
    <>
      <AttendanceView
        user={null}
        permissions={[]}
        calendarPerson={person}
        onCalendarClose={onClose}
      />
      <div className="pro3-attendance">
        <ToastContainer />
      </div>
    </>
  );
}
