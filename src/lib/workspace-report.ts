import { db } from "@/db";
import {
  workspaces,
  workspaceMemberships,
  teachingDays,
  attendanceRecords,
  workspaceActivities,
  workspaceActivityAttempts,
  examSubmissions,
  questions,
  users,
  exams,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export interface StudentReportSection {
  studentId: string;
  fullName: string;
  studentCode: string;
  attendance: {
    presentDays: number;
    lateDays: number;
    absentDays: number;
    excusedDays: number;
    attendanceRate: number;
  };
  activities: {
    activityId: string;
    title: string;
    type: string;
    submissionStatus: string;
    scorePercentage: number | null;
    submittedAt: string | null;
  }[];
  summary: {
    totalActivities: number;
    submittedCount: number;
    averageScore: number | null;
    highestScore: number | null;
    lowestScore: number | null;
  };
}

export interface WorkspaceReportData {
  workspaceId: string;
  workspaceName: string;
  totalScheduledDays: number;
  totalConductedDays: number;
  generatedAt: string;
  students: StudentReportSection[];
  dailySummary: {
    teachingDayId: string;
    dayNumber: number;
    scheduledDate: string;
    topic: string | null;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    excusedCount: number;
    activitiesAssigned: string[];
  }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

type SubmissionRow = typeof examSubmissions.$inferSelect;

// Base RSD Section 9 Rule 15 (v7.3): ordered priority derivation
function deriveSubmissionStatus(sub: SubmissionRow | undefined, examEndTime: Date | undefined) {
  if (!sub) return "NOT_STARTED";
  if (sub.submittedAt) return "SUBMITTED";
  const closed = examEndTime ? examEndTime.getTime() < Date.now() : false;
  if (closed) return "CANCELLED";
  if (sub.closeReason === "SAVE_AND_EXIT") return "PENDING";
  return "IN_PROGRESS";
}

async function fetchExamEndTimes(examIds: string[]) {
  if (examIds.length === 0) return new Map<string, Date>();
  const rows = await db
    .select({ id: exams.id, endTime: exams.endTime })
    .from(exams)
    .where(inArray(exams.id, examIds));
  return new Map(rows.map((r) => [r.id, r.endTime]));
}

/** Per-student activity list with derived status and score (spec 7.3). */
export async function buildStudentActivityList(workspaceId: string, studentId: string) {
  const activities = await db
    .select()
    .from(workspaceActivities)
    .where(eq(workspaceActivities.workspaceId, workspaceId))
    .orderBy(workspaceActivities.assignedAt);

  const examIds = [...new Set(activities.map((a) => a.examId).filter(Boolean))] as string[];

  const maxPointsRows = examIds.length
    ? await db
        .select({
          examId: questions.examId,
          maxPoints: sql<string>`COALESCE(SUM(${questions.points}), 0)`,
        })
        .from(questions)
        .where(inArray(questions.examId, examIds))
        .groupBy(questions.examId)
    : [];
  const maxPointsByExam = new Map(maxPointsRows.map((r) => [r.examId, Number(r.maxPoints)]));

  const submissions = examIds.length
    ? await db
        .select()
        .from(examSubmissions)
        .where(
          and(
            inArray(examSubmissions.examId, examIds),
            eq(examSubmissions.studentId, studentId)
          )
        )
        .orderBy(examSubmissions.attempt)
    : [];
  const latestSubmission = new Map<string, (typeof submissions)[number]>();
  for (const s of submissions) latestSubmission.set(s.examId, s);

  const endTimeByExam = await fetchExamEndTimes(examIds);

  // Standalone (non exam-backed) activity attempts for this student
  const standaloneIds = activities.filter((a) => !a.examId).map((a) => a.id);
  const attempts = standaloneIds.length
    ? await db
        .select()
        .from(workspaceActivityAttempts)
        .where(
          and(
            inArray(workspaceActivityAttempts.activityId, standaloneIds),
            eq(workspaceActivityAttempts.studentId, studentId)
          )
        )
    : [];
  const attemptByActivity = new Map(attempts.map((at) => [at.activityId, at]));

  return activities.map((a) => {
    let status = "NOT_STARTED";
    let scorePercentage: number | null = null;
    let submittedAt: string | null = null;

    if (a.examId) {
      const sub = latestSubmission.get(a.examId);
      status = deriveSubmissionStatus(sub, endTimeByExam.get(a.examId));
      if (sub?.submittedAt) {
        submittedAt = sub.submittedAt.toISOString();
        const maxPoints = maxPointsByExam.get(a.examId) ?? 0;
        scorePercentage =
          maxPoints > 0 ? round1((Number(sub.totalScore ?? 0) / maxPoints) * 100) : null;
      }
    } else {
      const attempt = attemptByActivity.get(a.id);
      if (attempt) {
        status = "SUBMITTED";
        submittedAt = attempt.submittedAt.toISOString();
        scorePercentage =
          attempt.scorePercentage !== null ? round1(Number(attempt.scorePercentage)) : null;
      }
    }

    return {
      id: a.id,
      examId: a.examId,
      activityType: a.activityType,
      title: a.title,
      description: a.description,
      dueDate: a.dueDate,
      assignedAt: a.assignedAt,
      status,
      scorePercentage,
      submittedAt,
    };
  });
}

/** Build the point-in-time report snapshot for a workspace (W7). */
export async function buildWorkspaceReport(workspaceId: string): Promise<WorkspaceReportData> {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

  const members = await db
    .select({
      studentId: users.id,
      fullName: users.fullName,
      studentCode: users.username,
    })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.studentId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.status, "ACTIVE")
      )
    )
    .orderBy(users.fullName);

  const days = await db
    .select()
    .from(teachingDays)
    .where(eq(teachingDays.workspaceId, workspaceId))
    .orderBy(teachingDays.dayNumber);
  const dayIds = days.map((d) => d.id);

  const attendance = dayIds.length
    ? await db
        .select()
        .from(attendanceRecords)
        .where(inArray(attendanceRecords.teachingDayId, dayIds))
    : [];

  const activities = await db
    .select()
    .from(workspaceActivities)
    .where(eq(workspaceActivities.workspaceId, workspaceId))
    .orderBy(workspaceActivities.assignedAt);

  const examIds = [...new Set(activities.map((a) => a.examId).filter(Boolean))] as string[];
  const memberIds = members.map((m) => m.studentId);

  // Max points per exam, for percentage conversion
  const maxPointsRows = examIds.length
    ? await db
        .select({
          examId: questions.examId,
          maxPoints: sql<string>`COALESCE(SUM(${questions.points}), 0)`,
        })
        .from(questions)
        .where(inArray(questions.examId, examIds))
        .groupBy(questions.examId)
    : [];
  const maxPointsByExam = new Map(maxPointsRows.map((r) => [r.examId, Number(r.maxPoints)]));

  // Latest submission per exam+student (W6: score straight from grading pipeline)
  const submissions =
    examIds.length && memberIds.length
      ? await db
          .select()
          .from(examSubmissions)
          .where(
            and(
              inArray(examSubmissions.examId, examIds),
              inArray(examSubmissions.studentId, memberIds)
            )
          )
          .orderBy(examSubmissions.attempt)
      : [];
  const latestSubmission = new Map<string, (typeof submissions)[number]>();
  for (const s of submissions) {
    latestSubmission.set(`${s.examId}:${s.studentId}`, s);
  }

  const endTimeByExam = await fetchExamEndTimes(examIds);

  // Standalone (non exam-backed) activity attempts across all students
  const standaloneActivityIds = activities.filter((a) => !a.examId).map((a) => a.id);
  const standaloneAttempts = standaloneActivityIds.length
    ? await db
        .select()
        .from(workspaceActivityAttempts)
        .where(inArray(workspaceActivityAttempts.activityId, standaloneActivityIds))
    : [];
  const attemptByKey = new Map(
    standaloneAttempts.map((at) => [`${at.activityId}:${at.studentId}`, at])
  );

  // total_conducted_days = days with at least one roll call record
  const conductedDayIds = new Set(attendance.map((a) => a.teachingDayId));
  const totalConductedDays = conductedDayIds.size;

  const students: StudentReportSection[] = members.map((m) => {
    const myAttendance = attendance.filter((a) => a.studentId === m.studentId);
    const count = (status: string) => myAttendance.filter((a) => a.status === status).length;
    const presentDays = count("PRESENT");
    const lateDays = count("LATE");
    const absentDays = count("ABSENT");
    const excusedDays = count("EXCUSED");
    const attendedDays = presentDays + lateDays;
    const attendanceRate =
      totalConductedDays > 0 ? round1((attendedDays / totalConductedDays) * 100) : 0;

    const activityRows = activities.map((a) => {
      let submissionStatus = "NOT_STARTED";
      let scorePercentage: number | null = null;
      let submittedAt: string | null = null;

      if (a.examId) {
        const sub = latestSubmission.get(`${a.examId}:${m.studentId}`);
        submissionStatus = deriveSubmissionStatus(sub, endTimeByExam.get(a.examId));
        if (sub?.submittedAt) {
          submittedAt = sub.submittedAt.toISOString();
          const maxPoints = maxPointsByExam.get(a.examId) ?? 0;
          scorePercentage =
            maxPoints > 0 ? round1((Number(sub.totalScore ?? 0) / maxPoints) * 100) : null;
        }
      } else {
        const attempt = attemptByKey.get(`${a.id}:${m.studentId}`);
        if (attempt) {
          submissionStatus = "SUBMITTED";
          submittedAt = attempt.submittedAt.toISOString();
          scorePercentage =
            attempt.scorePercentage !== null ? round1(Number(attempt.scorePercentage)) : null;
        }
      }

      return {
        activityId: a.id,
        title: a.title,
        type: a.activityType,
        submissionStatus,
        scorePercentage,
        submittedAt,
      };
    });

    // 8.3.2: average only over SUBMITTED activities with a score
    const scored = activityRows.filter(
      (r) => r.submissionStatus === "SUBMITTED" && r.scorePercentage !== null
    );
    const scores = scored.map((r) => r.scorePercentage!) ;
    const submittedCount = activityRows.filter((r) => r.submissionStatus === "SUBMITTED").length;

    return {
      studentId: m.studentId,
      fullName: m.fullName,
      studentCode: m.studentCode,
      attendance: { presentDays, lateDays, absentDays, excusedDays, attendanceRate },
      activities: activityRows,
      summary: {
        totalActivities: activityRows.length,
        submittedCount,
        averageScore: scores.length
          ? round1(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null,
        highestScore: scores.length ? Math.max(...scores) : null,
        lowestScore: scores.length ? Math.min(...scores) : null,
      },
    };
  });

  const dailySummary = days.map((d) => {
    const dayRecords = attendance.filter((a) => a.teachingDayId === d.id);
    const count = (status: string) => dayRecords.filter((a) => a.status === status).length;
    return {
      teachingDayId: d.id,
      dayNumber: d.dayNumber,
      scheduledDate: d.scheduledDate,
      topic: d.topic,
      presentCount: count("PRESENT"),
      absentCount: count("ABSENT"),
      lateCount: count("LATE"),
      excusedCount: count("EXCUSED"),
      activitiesAssigned: activities.filter((a) => a.teachingDayId === d.id).map((a) => a.id),
    };
  });

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    totalScheduledDays: workspace.totalDays,
    totalConductedDays,
    generatedAt: new Date().toISOString(),
    students,
    dailySummary,
  };
}
