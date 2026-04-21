import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import process from "node:process";
import { toErrorMessage } from "../lib/errors.js";

const EXECUTE_MASK = 0o111;

export interface ExecutablePermissionResult {
  path: string;
  changed: boolean;
  executable: boolean;
  error?: string;
}

interface NativePtyModule {
  dir: string;
}

interface NodePtyUtilsModule {
  loadNativeModule(name: string): NativePtyModule;
}

function getNodePtyNativeDir(): {
  terminalModulePath: string;
  nativeDir: string;
} {
  const require = createRequire(import.meta.url);
  const terminalModulePath =
    process.platform === "win32"
      ? require.resolve("node-pty/lib/windowsTerminal.js")
      : require.resolve("node-pty/lib/unixTerminal.js");
  const utils = require("node-pty/lib/utils") as NodePtyUtilsModule;
  const native = utils.loadNativeModule("pty");

  return {
    terminalModulePath,
    nativeDir: native.dir
  };
}

export function ensureExecutablePermissions(
  filePath: string
): ExecutablePermissionResult {
  const stat = fs.statSync(filePath);
  const executable = Boolean(stat.mode & EXECUTE_MASK);
  if (executable) {
    return {
      path: filePath,
      changed: false,
      executable: true
    };
  }

  fs.chmodSync(filePath, stat.mode | EXECUTE_MASK);
  const verified = Boolean(fs.statSync(filePath).mode & EXECUTE_MASK);
  return {
    path: filePath,
    changed: true,
    executable: verified
  };
}

export function resolveNodePtySpawnHelperPath(): string {
  const { terminalModulePath, nativeDir } = getNodePtyNativeDir();
  const terminalDir = path.dirname(terminalModulePath);

  return path.resolve(terminalDir, nativeDir, "spawn-helper");
}

export function resolveNodePtyWindowsArtifactPath(): string {
  const { terminalModulePath, nativeDir } = getNodePtyNativeDir();
  const terminalDir = path.dirname(terminalModulePath);

  return path.resolve(terminalDir, nativeDir, "pty.node");
}

export function repairNodePtySpawnHelperPermissions(): ExecutablePermissionResult {
  try {
    if (process.platform === "win32") {
      const artifactPath = resolveNodePtyWindowsArtifactPath();
      if (!fs.existsSync(artifactPath)) {
        return {
          path: artifactPath,
          changed: false,
          executable: false,
          error: `Missing node-pty Windows artifact: ${artifactPath}`
        };
      }

      return {
        path: artifactPath,
        changed: false,
        executable: true
      };
    }

    const helperPath = resolveNodePtySpawnHelperPath();
    return ensureExecutablePermissions(helperPath);
  } catch (error: unknown) {
    return {
      path: "",
      changed: false,
      executable: false,
      error: toErrorMessage(error)
    };
  }
}
