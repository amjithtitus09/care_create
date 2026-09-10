import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export interface NativeBuildSetup {
  env: Record<string, string>;
  warning?: string;
}

const MAC_GMP_PREFIXES = [
  "/opt/homebrew/opt/gmp",
  "/usr/local/opt/gmp",
  "/opt/local",
];

const LINUX_GMP_HEADERS = [
  "/usr/include/gmp.h",
  "/usr/local/include/gmp.h",
  "/usr/include/x86_64-linux-gnu/gmp.h",
  "/usr/include/aarch64-linux-gnu/gmp.h",
];

function hasGmpHeader(prefix: string): boolean {
  return existsSync(path.join(prefix, "include", "gmp.h"));
}

function gmpPrefix(): string | null {
  try {
    const out = execFileSync("brew", ["--prefix", "gmp"], { encoding: "utf8" }).trim();
    if (out && hasGmpHeader(out)) {
      return out;
    }
  } catch {
  }
  return MAC_GMP_PREFIXES.find(hasGmpHeader) ?? null;
}

function append(existing: string | undefined, addition: string): string {
  return existing ? `${existing} ${addition}` : addition;
}

export function nativeBuildEnv(): NativeBuildSetup {
  if (process.platform === "darwin") {
    const prefix = gmpPrefix();
    if (!prefix) {
      return {
        env: {},
        warning:
          "GMP headers were not found. Some backend plugs (e.g. abdm) build fastecdsa from source and need GMP. Install it with `brew install gmp` (or MacPorts `port install gmp`) and re-run.",
      };
    }

    const include = path.join(prefix, "include");
    const lib = path.join(prefix, "lib");
    return {
      env: {
        CPPFLAGS: append(process.env.CPPFLAGS, `-I${include}`),
        CFLAGS: append(process.env.CFLAGS, `-I${include}`),
        LDFLAGS: append(process.env.LDFLAGS, `-L${lib}`),
        C_INCLUDE_PATH: append(process.env.C_INCLUDE_PATH, include),
        LIBRARY_PATH: append(process.env.LIBRARY_PATH, lib),
      },
    };
  }

  if (process.platform === "linux") {
    if (LINUX_GMP_HEADERS.some((header) => existsSync(header))) {
      return { env: {} };
    }
    return {
      env: {},
      warning:
        "GMP headers were not found. Some backend plugs (e.g. abdm) build fastecdsa from source and need GMP. Install the GMP dev package (Debian/Ubuntu: `sudo apt install libgmp-dev`, Fedora/RHEL: `sudo dnf install gmp-devel`, Arch: `sudo pacman -S gmp`, Alpine: `sudo apk add gmp-dev`) and re-run.",
    };
  }

  // Windows and anything else: building fastecdsa from source is impractical here.
  return {
    env: {},
    warning:
      "On this platform, backend plugs that build fastecdsa from source (e.g. abdm) can't be compiled natively. Use the Docker runtime (or run the native setup under WSL) instead.",
  };
}
