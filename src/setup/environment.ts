import fs from "fs";
import os from "os";

export interface EnvironmentInfo {
  type: string;
  runtimeId: string;
}

export function detectEnvironment(): EnvironmentInfo {
  // 1. Check explicit runtime override
  if (process.env.AUTOMATON_RUNTIME_ID) {
    const runtimeId = process.env.AUTOMATON_RUNTIME_ID.trim();
    if (runtimeId) {
      return { type: "local-runtime", runtimeId };
    }
  }

  // 2. Check Docker
  if (fs.existsSync("/.dockerenv")) {
    return { type: "docker", runtimeId: `docker-${os.hostname()}` };
  }

  // 3. Fall back to a stable local runtime id
  return { type: process.platform, runtimeId: `local-${os.hostname()}` };
}
