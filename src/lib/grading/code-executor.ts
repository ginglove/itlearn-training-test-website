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

    if (child.stdin) {
      // Always write input (even empty string) so the process gets a proper stdin stream.
      // Ensure input ends with a newline so Python's input() / readline() does not hang.
      const payload = input.endsWith("\n") ? input : input + "\n";
      child.stdin.write(payload);
      child.stdin.end();
    }
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

/**
 * Detects the last user-defined function name in the source code.
 * Returns null if none found or if the code already has output statements.
 */
function detectFunctionName(sourceCode: string, language: string): string | null {
  if (language === "javascript") {
    // Skip auto-harness if the student already writes output
    if (/console\s*\.\s*log\s*\(|process\s*\.\s*stdout\s*\.\s*write\s*\(/.test(sourceCode)) {
      return null;
    }
    // Match: function name(...), const/let/var name = (...) =>, const/let/var name = function(
    // Only match top-level declarations (^ with /m = start of line, no leading whitespace)
    // so nested helpers like `const isValid = ...` inside a function body are ignored.
    const patterns = [
      /^(?:async\s+)?function\s+(\w+)\s*\(/gm,
      /^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/gm,
      /^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(\w+)\s*=>/gm,
      /^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(/gm,
    ];
    let lastName: string | null = null;
    for (const pattern of patterns) {
      for (const m of sourceCode.matchAll(pattern)) {
        const name = m[1];
        if (!["require", "exports", "module", "process"].includes(name)) {
          lastName = name;
        }
      }
    }
    return lastName;
  }

  if (language === "python") {
    if (/\bprint\s*\(/.test(sourceCode)) return null;
    const matches = [...sourceCode.matchAll(/^def\s+(\w+)\s*\(/gm)];
    return matches.length > 0 ? matches[matches.length - 1][1] : null;
  }

  return null;
}

/**
 * Builds a harness that calls the detected function with stdin input and prints the result.
 * Used when student submits function-only code with no output statements.
 */
function buildAutoHarness(sourceCode: string, language: string, funcName: string): string {
  if (language === "javascript") {
    return `${sourceCode}
;(function(){
  var __raw__ = require('fs').readFileSync(0,'utf8').trim();
  var __args__;
  // Try eval() first: handles JS object/array literals and JSON from stdin.
  // Falls back to line-based parsing for simple primitive inputs.
  try {
    var __val__ = eval('(' + __raw__ + ')');
    __args__ = [__val__];
  } catch(__e__) {
    var __lines__ = __raw__.split('\\n').filter(Boolean);
    var __parse__ = function(l){
      if(l.trim()==='true') return true;
      if(l.trim()==='false') return false;
      var n = Number(l.trim());
      return isNaN(n) ? l.trim() : n;
    };
    if(__lines__.length === 1){
      var __parts__ = __lines__[0].trim().split(/\\s+/);
      // Only split into multiple args when ALL parts are numeric.
      var __allNum__ = __parts__.length > 1 && __parts__.every(function(p){ var n=Number(p.trim()); return !isNaN(n) && p.trim()!==''; });
      __args__ = __allNum__ ? __parts__.map(__parse__) : [__parse__(__lines__[0])];
    } else {
      __args__ = __lines__.map(__parse__);
    }
  }
  // Format objects/arrays to match JS object-literal style expected by teachers.
  // Primitives fall through to console.log as before.
  function __fmt__(v){
    if(Array.isArray(v)){
      if(v.length===0) return '[]';
      return '[\\n'+v.map(function(x){ return '  '+__fmt__(x); }).join(',\\n')+'\\n]';
    }
    if(v!==null && typeof v==='object'){
      var p=Object.keys(v).map(function(k){ return k+': '+__fmt__(v[k]); });
      return '{ '+p.join(', ')+' }';
    }
    if(typeof v==='string') return JSON.stringify(v);
    return String(v);
  }
  var __r__ = ${funcName}.apply(null, __args__);
  if(__r__ !== undefined && __r__ !== null){
    if(typeof __r__ === 'object') console.log(__fmt__(__r__));
    else console.log(__r__);
  }
})();`;
  }

  if (language === "python") {
    return `${sourceCode}

import sys as __sys__
__lines__ = [l for l in __sys__.stdin.read().strip().split('\\n') if l]
def __parse__(x):
    x = x.strip()
    if x == 'true': return True
    if x == 'false': return False
    try: return int(x)
    except ValueError:
        try: return float(x)
        except ValueError: return x
if len(__lines__) == 1:
    __parts__ = __lines__[0].strip().split()
    def __all_num__(ps):
        for p in ps:
            try: float(p)
            except: return False
        return True
    if len(__parts__) > 1 and __all_num__(__parts__):
        __args__ = [__parse__(p) for p in __parts__]
    else:
        __args__ = [__parse__(__lines__[0])]
else:
    __args__ = [__parse__(l) for l in __lines__]
__r__ = ${funcName}(*__args__)
if __r__ is not None:
    print(__r__)
`;
  }

  return sourceCode;
}

function normalizeNumber(token: string): string {
  const num = Number(token);
  if (!isNaN(num) && token.trim() !== "") {
    // Round to 9 significant digits to absorb floating-point noise without
    // mangling large integers (e.g. 12345678 must stay 12345678, not 12345700)
    return parseFloat(num.toPrecision(9)).toString();
  }
  return token;
}

function normalizeLine(line: string): string {
  // Case-fold Python/Java booleans so True/False match true/false anywhere in the line
  const boolFolded = line.replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false");
  // Normalize numeric tokens to absorb floating-point noise
  return boolFolded.replace(/[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/g, (match) =>
    normalizeNumber(match)
  );
}

function normalizeOutput(output: string): string {
  return (
    output
      // Normalise Windows (\r\n) and old-Mac (\r) line endings to \n
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line: string) => {
        // Trim BOTH leading and trailing whitespace from each line so that
        // indented output (e.g. a console.log inside a function block) still
        // matches the unindented expected value
        return normalizeLine(line.trim());
      })
      .join("\n")
      .trim()
  );
}

export async function executeCode(
  request: CodeExecutionRequest
): Promise<CodeExecutionResponse> {
  const results: ExecutionResult[] = [];
  let hasCompileError = false;
  let compileErrorMsg = "";

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

      // If student wrote function-only code (no output statements), pre-inject
      // the harness so it runs stdin → function → console.log in one pass.
      // This avoids relying on post-hoc exitCode checks that vary across runtimes.
      const autoFuncName = detectFunctionName(request.sourceCode, request.language);
      const codeToRun = autoFuncName
        ? buildAutoHarness(request.sourceCode, request.language, autoFuncName)
        : request.sourceCode;

      const execution = await executeSingleTestCase(
        codeToRun,
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
