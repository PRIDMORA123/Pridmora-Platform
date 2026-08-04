/**
 * Node custom loader: resolve `@/` to the repository root and append `.ts`
 * for extensionless TypeScript imports under the project.
 *
 * Use with:
 *   node --import ./scripts/ts-alias-loader.mjs --experimental-strip-types <script>
 */
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, resolve as pathResolve } from "node:path";
import { register } from "node:module";

const root = pathResolve(dirname(fileURLToPath(import.meta.url)), "..");

function withTsExtension(fileUrl) {
  try {
    const path = fileURLToPath(fileUrl);
    if (extname(path)) return fileUrl;
    if (existsSync(`${path}.ts`)) return pathToFileURL(`${path}.ts`).href;
    if (existsSync(`${path}.tsx`)) return pathToFileURL(`${path}.tsx`).href;
    if (existsSync(`${path}/index.ts`)) {
      return pathToFileURL(`${path}/index.ts`).href;
    }
  } catch {
    // fall through
  }
  return fileUrl;
}

register(`data:text/javascript,${encodeURIComponent(`
  import { pathToFileURL } from "node:url";
  import { existsSync } from "node:fs";
  import { fileURLToPath } from "node:url";
  import { dirname, extname, resolve as pathResolve } from "node:path";
  const root = ${JSON.stringify(root)};

  function withTsExtension(fileUrl) {
    try {
      const path = fileURLToPath(fileUrl);
      if (extname(path)) return fileUrl;
      if (existsSync(path + ".ts")) return pathToFileURL(path + ".ts").href;
      if (existsSync(path + ".tsx")) return pathToFileURL(path + ".tsx").href;
      if (existsSync(path + "/index.ts")) return pathToFileURL(path + "/index.ts").href;
    } catch {}
    return fileUrl;
  }

  export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const target = withTsExtension(
        pathToFileURL(root + "/" + specifier.slice(2)).href
      );
      return nextResolve(target, context);
    }

    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL &&
      String(context.parentURL).includes(root)
    ) {
      const parentDir = dirname(fileURLToPath(context.parentURL));
      const absolute = pathResolve(parentDir, specifier);
      const candidate = withTsExtension(pathToFileURL(absolute).href);
      if (candidate.endsWith(".ts") || candidate.endsWith(".tsx")) {
        return nextResolve(candidate, context);
      }
    }

    return nextResolve(specifier, context);
  }
`)}`, pathToFileURL("./"));
