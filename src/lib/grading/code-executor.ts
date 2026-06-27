// ── Piston Code Execution Engine (RSD Section 7.2) ─────────────────────────────
// Replaces Docker/gVisor sandbox with Piston API for serverless compatibility

import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { exec, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const DEFAULT_PISTON_API_URL =
  process.env.PISTON_API_URL || "https://emkc.org/api/v2/piston";

interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
}

interface ExecutionResult {
  testCaseId: string;
  status: "AC" | "WA" | "CE" | "RE" | "TLE" | "OFE";
  inputData: string;
  actualOutput: string;
  expectedOutput: string;
  expectedOutputConfigured: boolean;
  executionTimeMs: number;
  stderr: string;
}

interface CodeExecutionRequest {
  sourceCode: string;
  language: "python" | "javascript";
  testCases: TestCase[];
  timeLimitMs: number;
  teacherCode?: string;
  wrapperCode?: string;
}

interface CodeExecutionResponse {
  results: ExecutionResult[];
  totalPassed: number;
  totalTestCases: number;
  overallStatus: "AC" | "WA" | "CE" | "RE" | "TLE" | "OFE";
  scorePercentage: number;
}

// Map our language names to Piston's expected format
const LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  python: { language: "python", version: "3.10.0" },
  javascript: { language: "javascript", version: "18.15.0" },
};

let cachedNodePath: string | null = null;
function getNodeExecutable(): string {
  if (cachedNodePath) return cachedNodePath;
  const paths = [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "node"
  ];
  for (const p of paths) {
    try {
      execSync(`${p} --version`, { stdio: "ignore" });
      cachedNodePath = p;
      return p;
    } catch {
      // Continue
    }
  }
  cachedNodePath = "node";
  return "node";
}

let cachedPythonPath: string | null = null;
function getPythonExecutable(): string {
  if (cachedPythonPath) return cachedPythonPath;
  const paths = [
    "/usr/bin/python3",
    "python3",
    "python"
  ];
  for (const p of paths) {
    try {
      execSync(`${p} --version`, { stdio: "ignore" });
      cachedPythonPath = p;
      return p;
    } catch {
      // Continue
    }
  }
  cachedPythonPath = "python3";
  return "python3";
}

async function executeLocalSingleTestCase(
  sourceCode: string,
  language: string,
  input: string,
  timeLimitMs: number
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  executionTimeMs: number;
}> {
  // /tmp is writable on both local machines and Netlify/Lambda environments.
  // process.cwd() is read-only on Netlify (/var/task), so we never use it for temp files.
  const tempDir = path.join("/tmp", "itlearn_exec");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileExt = language === "python" ? "py" : "js";
  const fileName = `solution_${randomUUID()}.${fileExt}`;
  const filePath = path.join(tempDir, fileName);

  fs.writeFileSync(filePath, sourceCode);

  const startTime = Date.now();

  return new Promise((resolve) => {
    let command = "";
    if (language === "python") {
      const pythonExe = getPythonExecutable();
      command = `${pythonExe} "${filePath}"`;
    } else if (language === "javascript" || language === "js") {
      // process.execPath is the path to the running Node binary — always correct
      // regardless of environment (local, Netlify Lambda, CI, etc.)
      const nodeExe = process.execPath || getNodeExecutable();
      command = `"${nodeExe}" "${filePath}"`;
    } else {
      resolve({
        stdout: "",
        stderr: `Unsupported language: ${language}`,
        exitCode: 1,
        timedOut: false,
        executionTimeMs: 0,
      });
      return;
    }

    const child = exec(
      command,
      {
        timeout: timeLimitMs,
        maxBuffer: 1024 * 1024 * 10, // 10MB
      },
      (error, stdout, stderr) => {
        const executionTimeMs = Date.now() - startTime;
        
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          console.error("Failed to clean up temp file:", err);
        }

        const timedOut = error ? (error as any).killed || error.signal === "SIGTERM" : false;
        const exitCode = error ? error.code ?? 1 : 0;
        const trimmedStdout = stdout.trim();

        resolve({
          stdout: trimmedStdout.length > 10000 ? "\x00OFE" : trimmedStdout,
          stderr: stderr.trim(),
          exitCode,
          timedOut,
          executionTimeMs,
        });
      }
    );

    if (input) {
      child.stdin?.write(input);
    }
    child.stdin?.end();
  });
}

async function executeSingleTestCase(
  sourceCode: string,
  language: string,
  input: string,
  timeLimitMs: number,
  pistonApiUrl: string,
  executionMode: string
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  executionTimeMs: number;
}> {
  if (executionMode === "LOCAL_ONLY") {
    return executeLocalSingleTestCase(sourceCode, language, input, timeLimitMs);
  }

  let useFallback = false;
  let response;
  let executionTimeMs = 0;

  if (executionMode === "API_ONLY" || executionMode === "LOCAL_FALLBACK") {
    const langConfig = LANGUAGE_MAP[language];
    if (!langConfig) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const startTime = Date.now();
    try {
      response = await fetch(`${pistonApiUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: langConfig.language,
          version: langConfig.version,
          files: [{ name: `solution.${language === "python" ? "py" : "js"}`, content: sourceCode }],
          stdin: input,
          run_timeout: timeLimitMs,
          run_memory_limit: 262144,
          compile_timeout: 10000,
        }),
      });

      executionTimeMs = Date.now() - startTime;

      if (!response.ok) {
        console.warn(`Piston API returned status ${response.status}.`);
        if (executionMode === "LOCAL_FALLBACK") {
          useFallback = true;
        } else {
          throw new Error(`Piston API error: ${response.status}`);
        }
      }
    } catch (err) {
      console.warn("Piston API fetch failed:", err);
      if (executionMode === "LOCAL_FALLBACK") {
        useFallback = true;
      } else {
        throw err;
      }
    }
  }

  if (useFallback) {
    console.info("Using local child-process execution fallback.");
    return executeLocalSingleTestCase(sourceCode, language, input, timeLimitMs);
  }

  if (!response) {
    throw new Error("No response from Piston API");
  }

  const data = await response.json();

  // Check for compile error
  if (data.compile && data.compile.code !== 0) {
    return {
      stdout: "",
      stderr: data.compile.stderr || data.compile.output || "Compilation failed",
      exitCode: data.compile.code,
      timedOut: false,
      executionTimeMs,
    };
  }

  const run = data.run;
  const timedOut = run.signal === "SIGKILL" || executionTimeMs > timeLimitMs;
  const rawStdout = (run.stdout || "").trim();

  return {
    stdout: rawStdout.length > 10000 ? "\x00OFE" : rawStdout,
    stderr: (run.stderr || "").trim(),
    exitCode: run.code ?? 1,
    timedOut,
    executionTimeMs,
  };
}

function normalizeNumber(token: string): string {
  const num = Number(token);
  if (!isNaN(num) && token.trim() !== "") {
    // Round to 6 significant digits to absorb floating-point noise
    return parseFloat(num.toPrecision(6)).toString();
  }
  return token;
}

function normalizeLine(line: string): string {
  // Split on boundaries between digits/dots and non-numeric characters,
  // normalize each numeric token, then rejoin.
  return line.replace(/[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/g, (match) =>
    normalizeNumber(match)
  );
}

function normalizeOutput(output: string): string {
  return output
    .split("\n")
    .map((line: string) => normalizeLine(line.trimEnd()))
    .join("\n")
    .trim();
}

export async function executeCode(
  request: CodeExecutionRequest
): Promise<CodeExecutionResponse> {
  const results: ExecutionResult[] = [];
  let hasCompileError = false;
  let compileErrorMsg = "";

  // Combine student code with optional wrapper (appended, so the function is defined first)
  const effectiveSource = request.wrapperCode?.trim()
    ? `${request.sourceCode}\n${request.wrapperCode}`
    : request.sourceCode;

  // Fetch dynamic Piston URL and execution mode from settings
  let pistonApiUrl = DEFAULT_PISTON_API_URL;
  let executionMode = "LOCAL_FALLBACK";
  try {
    const [settings] = await db.select().from(platformSettings).limit(1);
    if (settings) {
      if (settings.pistonApiUrl) pistonApiUrl = settings.pistonApiUrl;
      if (settings.executionMode) executionMode = settings.executionMode;
    }
  } catch (err) {
    console.error("Failed to fetch settings from database, using fallbacks", err);
  }

  for (const testCase of request.testCases) {
    try {
      let expectedOutput = testCase.expectedOutput;

      if (request.teacherCode && request.teacherCode.trim().length > 0) {
        const teacherExec = await executeSingleTestCase(
          request.teacherCode,
          request.language,
          testCase.input,
          request.timeLimitMs,
          pistonApiUrl,
          executionMode
        );
        if (teacherExec.timedOut) {
          expectedOutput = "TEACHER_CODE_TIMEOUT";
        } else if (teacherExec.stderr && teacherExec.exitCode !== 0) {
          console.error("Teacher code execution error:", teacherExec.stderr);
          expectedOutput = "TEACHER_CODE_ERROR";
        } else {
          expectedOutput = teacherExec.stdout;
        }
      }

      const execution = await executeSingleTestCase(
        effectiveSource,
        request.language,
        testCase.input,
        request.timeLimitMs,
        pistonApiUrl,
        executionMode
      );

      let status: ExecutionResult["status"];

      if (execution.stdout === "\x00OFE") {
        status = "OFE";
      } else if (hasCompileError) {
        status = "CE";
      } else if (execution.stderr && execution.exitCode !== 0 && !execution.timedOut) {
        // Check if it's a compile/syntax error vs runtime error
        if (
          execution.stderr.includes("SyntaxError") ||
          execution.stderr.includes("IndentationError") ||
          execution.stderr.includes("ModuleNotFoundError")
        ) {
          status = "CE";
          hasCompileError = true;
          compileErrorMsg = execution.stderr;
        } else {
          status = "RE";
        }
      } else if (execution.timedOut) {
        status = "TLE";
      } else {
        const expectedNorm = normalizeOutput(expectedOutput);
        const actualNorm = normalizeOutput(execution.stdout);
        status = expectedNorm === actualNorm ? "AC" : "WA";
      }

      const usedTeacherCode = !!(request.teacherCode && request.teacherCode.trim().length > 0);
      results.push({
        testCaseId: testCase.id,
        status,
        inputData: testCase.input,
        actualOutput: hasCompileError ? compileErrorMsg : execution.stdout,
        expectedOutput: expectedOutput,
        expectedOutputConfigured: usedTeacherCode || testCase.expectedOutput.trim().length > 0,
        executionTimeMs: execution.executionTimeMs,
        stderr: execution.stderr,
      });
    } catch (error) {
      results.push({
        testCaseId: testCase.id,
        status: "RE",
        inputData: testCase.input,
        actualOutput: "",
        expectedOutput: testCase.expectedOutput,
        expectedOutputConfigured: testCase.expectedOutput.trim().length > 0,
        executionTimeMs: 0,
        stderr: error instanceof Error ? error.message : "Unknown execution error",
      });
    }
  }

  const totalPassed = results.filter((r) => r.status === "AC").length;
  const totalTestCases = results.length;
  const scorePercentage =
    totalTestCases > 0
      ? parseFloat(((totalPassed / totalTestCases) * 100).toFixed(2))
      : 0;

  // Determine overall status
  let overallStatus: CodeExecutionResponse["overallStatus"] = "AC";
  if (results.some((r) => r.status === "CE")) overallStatus = "CE";
  else if (results.some((r) => r.status === "TLE")) overallStatus = "TLE";
  else if (results.some((r) => r.status === "OFE")) overallStatus = "OFE";
  else if (results.some((r) => r.status === "RE")) overallStatus = "RE";
  else if (results.some((r) => r.status === "WA")) overallStatus = "WA";

  return {
    results,
    totalPassed,
    totalTestCases,
    overallStatus,
    scorePercentage,
  };
}
