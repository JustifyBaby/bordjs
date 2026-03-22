#!/usr/bin/env node
// ============================================================
// Bord CLI
// ============================================================

import * as fs   from "fs";
import * as path from "path";
import { Parser }        from "../parser";
import { Checker }       from "../checker";
import { NextjsCodegen } from "../codegen/nextjs";

const VERSION = "0.1.0";

// ---- ANSI colours ----
const c = {
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function usage(): void {
  console.log(`
${c.bold("bord")} v${VERSION} — AI-friendly structured component language

Usage:
  ${c.cyan("bord init")}              Create an example Counter.bord
  ${c.cyan("bord check [file]")}      Type-check .bord file(s)
  ${c.cyan("bord build [file]")}      Compile to Next.js (output: ./bord-out/)
  ${c.cyan("bord help")}              Show this message
`);
}

// ---- File discovery ----

function findBordFiles(target?: string): string[] {
  if (target) {
    if (!fs.existsSync(target)) {
      console.error(c.red(`File not found: ${target}`)); process.exit(1);
    }
    return [target];
  }
  const found: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist", "bord-out"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory())            walk(full);
      else if (entry.name.endsWith(".bord")) found.push(full);
    }
  }
  walk(process.cwd());
  return found;
}

// ---- Commands ----

function cmdCheck(args: string[]): void {
  const files = findBordFiles(args[0]);
  if (files.length === 0) { console.log(c.yellow("No .bord files found.")); return; }

  let totalErrors = 0, totalWarnings = 0;

  for (const file of files) {
    const src     = fs.readFileSync(file, "utf-8");
    const rel     = path.relative(process.cwd(), file);

    try {
      const ast    = new Parser(src).parse();
      const result = new Checker().check(ast);

      if (result.errors.length === 0 && result.warnings.length === 0) {
        console.log(`${c.green("✓")} ${rel}`);
      } else {
        console.log(`\n${c.bold(rel)}`);
        for (const e of result.errors)
          console.log(`  ${c.red(`✗ [${e.code}]`)} ${e.message}\n    ${c.cyan(`${rel}:${e.line}:${e.column}`)}`);
        for (const w of result.warnings)
          console.log(`  ${c.yellow(`⚠ [${w.code}]`)} ${w.message}\n    ${c.cyan(`${rel}:${w.line}:${w.column}`)}`);
      }

      totalErrors   += result.errors.length;
      totalWarnings += result.warnings.length;
    } catch (e) {
      console.log(`${c.red("✗")} ${rel}\n  ${(e as Error).message}`);
      totalErrors++;
    }
  }

  console.log("");
  if (totalErrors > 0) {
    console.log(c.red(`${totalErrors} error(s), ${totalWarnings} warning(s)`));
    process.exit(1);
  } else {
    console.log(totalWarnings > 0
      ? c.yellow(`0 errors, ${totalWarnings} warning(s)`)
      : c.green("All files OK"));
  }
}

function cmdBuild(args: string[]): void {
  const files = findBordFiles(args[0]);
  if (files.length === 0) { console.log(c.yellow("No .bord files found.")); return; }

  const outRoot = path.join(process.cwd(), "bord-out");
  fs.mkdirSync(outRoot, { recursive: true });

  let built = 0, failed = 0;

  for (const file of files) {
    const src = fs.readFileSync(file, "utf-8");
    const rel = path.relative(process.cwd(), file);
    const baseName = path.basename(file, ".bord");

    try {
      const ast    = new Parser(src).parse();
      const result = new Checker().check(ast);

      if (result.errors.length > 0) {
        console.log(`${c.red("✗")} ${rel} — ${result.errors.length} error(s), skipping`);
        result.errors.forEach(e => console.log(`  ${c.red(`[${e.code}]`)} ${e.message} (line ${e.line})`));
        failed++; continue;
      }

      const generated = new NextjsCodegen().generate(ast);
      const outDir    = path.join(outRoot, baseName);
      fs.mkdirSync(outDir, { recursive: true });

      fs.writeFileSync(path.join(outDir, "page.tsx"),   generated["page.tsx"]);
      fs.writeFileSync(path.join(outDir, `${ast.component.name}.client.tsx`), generated["client.tsx"]);
      fs.writeFileSync(path.join(outDir, "types.ts"),   generated["types.ts"]);

      if (result.warnings.length > 0)
        result.warnings.forEach(w => console.log(`  ${c.yellow(`[${w.code}]`)} ${w.message}`));

      console.log(`${c.green("✓")} ${rel} → ${c.cyan(path.relative(process.cwd(), outDir) + "/")}`);
      built++;
    } catch (e) {
      console.log(`${c.red("✗")} ${rel}\n  ${(e as Error).message}`);
      failed++;
    }
  }

  console.log(`\nBuilt: ${c.green(String(built))}  Failed: ${c.red(String(failed))}`);
  if (failed > 0) process.exit(1);
}

function cmdInit(): void {
  const example = `component Counter {

  props {
    label: string
    initialValue: number = 0
  }

  state {
    count: number = 0
  }

  client {
    handleIncrement = () => {
      state.count += 1
    }

    handleDecrement = () => {
      state.count -= 1
    }
  }

  view {
    <div className="counter">
      <h2>{props.label}</h2>
      <p>{state.count}</p>
      <button onClick={client.handleDecrement}>-</button>
      <button onClick={client.handleIncrement}>+</button>
    </div>
  }
}
`;

  if (!fs.existsSync("Counter.bord")) {
    fs.writeFileSync("Counter.bord", example, "utf-8");
    console.log(c.green("✓ Created Counter.bord"));
  } else {
    console.log(c.yellow("Counter.bord already exists, skipping."));
  }

  const gitignore = "bord-out/\n";
  if (!fs.existsSync(".gitignore")) {
    fs.writeFileSync(".gitignore", gitignore);
  } else if (!fs.readFileSync(".gitignore", "utf-8").includes("bord-out")) {
    fs.appendFileSync(".gitignore", "\n" + gitignore);
  }
  console.log(c.green("✓ .gitignore updated"));
  console.log(`\nNext:\n  ${c.cyan("bord check Counter.bord")}\n  ${c.cyan("bord build Counter.bord")}\n`);
}

// ---- Main ----

const [,, command, ...rest] = process.argv;
switch (command) {
  case "check":           cmdCheck(rest); break;
  case "build":           cmdBuild(rest); break;
  case "init":            cmdInit();      break;
  case "help": case "--help": case "-h": case undefined: usage(); break;
  default:
    console.error(c.red(`Unknown command: ${command}`));
    usage(); process.exit(1);
}
