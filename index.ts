import { parseHTML } from "linkedom";
import * as chrono from "chrono-node";
import { google } from "googleapis";
import { authorize } from "./google";

const url = process.env.REF_INSIGHT_REQUEST_URL as string;
const refInsightCookieString = process.env.REF_INSIGHT_COOKIE_STRING as string;
const familyCalendarId = process.env.FAMILY_CALENDAR_ID as string;

const shouldActuallyCreateEvent = process.env.SHOULD_ACTUALLY_CREATE_EVENT;

const getAssignments = async () => {
  try {
    const response = await fetch(url, {
      headers: {
        Cookie: refInsightCookieString,
      },
    });
    const data = await response.text();

    const { window, document } = parseHTML(data);
    const assignments: any[] = [];
    document
      .querySelectorAll('[aria-label="Assignment List"] tr')
      .forEach((assignment) => {
        const firstCell = assignment.querySelector("td");
        const secondCell = firstCell?.nextElementSibling;

        if (firstCell && secondCell) {
          const firstCellContent = firstCell
            .querySelector("a")
            ?.innerHTML.split("<br>");

          if (!firstCellContent) {
            return;
          }
          const assignmentDate = firstCellContent[0];
          const assignmentTime = firstCellContent[1];

          const secondCellContent = secondCell.innerHTML
            .replaceAll("\n", "")
            .split("<br>");

          const assignmentDescription = secondCellContent[0];
          const assignmentCompetition = secondCellContent[1];
          const assignmentAgeGroup = secondCellContent[2];
          const assignmentLocation = secondCellContent[3];
          const assignmentRole = secondCellContent[4];
          const assignmentStatus = secondCellContent[5];

          assignments.push({
            assignmentDate,
            assignmentTime,
            assignmentDescription,
            assignmentCompetition,
            assignmentAgeGroup,
            assignmentLocation,
            assignmentRole,
            assignmentStatus,
          });
        }
      });
    return assignments;
  } catch (error) {
    console.error("Error fetching data", error);
    throw error;
  }
};

const syncCalendarWithRefPlatform = async () => {
  const auth = await authorize();
  const calendar = google.calendar({ version: "v3", auth });
  let assignments = await getAssignments();

  const promises = createAssignmentsOnCalendar(assignments, calendar);

  await Promise.all(promises);
};

syncCalendarWithRefPlatform();

const createAssignmentsOnCalendar = (
  assignments: any[],
  calendar: any
): Promise<void>[] => {
  return assignments.map(async (assignment) => {
    const dateTimeStr = `${assignment.assignmentDate} ${assignment.assignmentTime}`;
    const startDate = chrono.parseDate(dateTimeStr);
    const endDate = chrono.parseDate(dateTimeStr);
    endDate?.setHours(endDate.getHours() + 1);
    const event = {
      summary: assignment.assignmentDescription,
      location: assignment.assignmentLocation,
      description: assignment.assignmentRole,
      start: {
        dateTime: startDate,
        timeZone: "America/New_York",
      },
      end: {
        dateTime: endDate,
        timeZone: "America/New_York",
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 },
          { method: "popup", minutes: 10 },
        ],
      },
    };

    if (shouldActuallyCreateEvent === "false") {
      console.log("Would have created event: %s", event.summary);
      return;
    }
    const res = await calendar.events.insert({
      calendarId: familyCalendarId,
      resource: event,
    });
    console.log("Event created: %s", res.data.htmlLink);

    return res;
  });
};
