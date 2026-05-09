import test from "node:test";
import assert from "node:assert/strict";
import { createRestartBootstrapScript } from "../src/restartBootstrap.js";

test("restart bootstrap waits for the parent process before spawning the next bot", () => {
  const script = createRestartBootstrapScript({
    parentPid: 12345,
    cwd: "C:/Users/TestUser/.dex-agent"
  });

  assert.match(script, /const parentPid = 12345;/);
  assert.match(script, /while \(isProcessAlive\(parentPid\)/);
  assert.match(script, /const maxWaitMs = 15000;/);
  assert.match(script, /const settleDelayMs = 1500;/);
  assert.match(script, /restart-bootstrap\.log/);
  assert.match(
    script,
    /restartScriptPath = path\.join\(repoCwd, 'scripts', 'restart-dex-agent-hidden\.vbs'\)/
  );
  assert.match(script, /spawn\(wscriptPath, \[restartScriptPath\]/);
  assert.match(script, /cwd: repoCwd/);
  assert.match(script, /windowsHide: true/);
  assert.match(
    script,
    /logLine\(`spawned restart via \$\{restartScriptPath\}`\)/
  );
});
