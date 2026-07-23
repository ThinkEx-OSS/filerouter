import { execFile } from "node:child_process"
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const exec = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const sdkPackage = await readJson("packages/filerouter/package.json")
const cliPackage = await readJson("packages/cli/package.json")

if (sdkPackage.version !== cliPackage.version) {
  throw new Error("SDK and CLI package versions must match.")
}
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(sdkPackage.version)) {
  throw new Error(`Invalid release version: ${sdkPackage.version}`)
}

const requestedOutput = process.argv[2]
const outputDirectory = requestedOutput
  ? resolve(root, requestedOutput)
  : await mkdtemp(join(tmpdir(), "filerouter-packages-"))
const installDirectory = await mkdtemp(join(tmpdir(), "filerouter-install-"))

try {
  await mkdir(outputDirectory, { recursive: true })
  await run("pnpm", [
    "--filter",
    sdkPackage.name,
    "pack",
    "--pack-destination",
    outputDirectory,
  ])
  await run("pnpm", [
    "--filter",
    cliPackage.name,
    "pack",
    "--pack-destination",
    outputDirectory,
  ])

  const files = await readdir(outputDirectory)
  const sdkArtifact = requireArtifact(
    files,
    `file_router-sdk-${sdkPackage.version}.tgz`
  )
  const cliArtifact = requireArtifact(
    files,
    `file_router-cli-${cliPackage.version}.tgz`
  )
  await verifyTarball(join(outputDirectory, sdkArtifact), sdkPackage)
  await verifyTarball(join(outputDirectory, cliArtifact), {
    ...cliPackage,
    expectedSdkVersion: sdkPackage.version,
  })

  await run("npm", ["init", "--yes"], installDirectory)
  await run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(outputDirectory, sdkArtifact),
      join(outputDirectory, cliArtifact),
    ],
    installDirectory
  )

  await run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        'import { DirectFileRouter, FILEROUTER_VERSION, FileRouter } from "@file_router/sdk"',
        'import { FILEROUTER_VERSION as hostedVersion } from "@file_router/sdk/hosted"',
        'if (typeof DirectFileRouter !== "function" || typeof FileRouter !== "function") process.exit(1)',
        `if (FILEROUTER_VERSION !== "${sdkPackage.version}" || hostedVersion !== FILEROUTER_VERSION) process.exit(1)`,
      ].join(";"),
    ],
    installDirectory
  )

  const version = await output(
    "npx",
    ["--no-install", "filerouter", "--version"],
    installDirectory
  )
  if (version.trim() !== sdkPackage.version) {
    throw new Error(
      `Packed CLI reported ${JSON.stringify(version.trim())}; expected ${sdkPackage.version}.`
    )
  }

  const providers = await output(
    "npx",
    ["--no-install", "filerouter", "providers", "--json"],
    installDirectory
  )
  const parsedProviders = JSON.parse(providers)
  if (!Array.isArray(parsedProviders) || parsedProviders.length === 0) {
    throw new Error("Packed CLI did not return its provider catalog.")
  }
} finally {
  await rm(installDirectory, { force: true, recursive: true })
  if (!requestedOutput) {
    await rm(outputDirectory, { force: true, recursive: true })
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"))
}

function requireArtifact(files, name) {
  if (!files.includes(name)) {
    throw new Error(`Missing packed artifact: ${name}`)
  }
  return name
}

async function verifyTarball(path, expected) {
  const entries = new Set(
    (await output("tar", ["-tzf", path], root)).split("\n")
  )
  for (const required of [
    "package/LICENSE",
    "package/README.md",
    "package/package.json",
  ]) {
    if (!entries.has(required)) {
      throw new Error(`${path} is missing ${required}.`)
    }
  }

  const packed = JSON.parse(
    await output("tar", ["-xOzf", path, "package/package.json"], root)
  )

  if (packed.name !== expected.name || packed.version !== expected.version) {
    throw new Error(`${path} has incorrect package identity.`)
  }

  if (
    expected.expectedSdkVersion &&
    packed.dependencies?.[sdkPackage.name] !== expected.expectedSdkVersion
  ) {
    throw new Error(`${path} does not pin the matching SDK version.`)
  }
}

async function run(command, args, cwd = root) {
  const { stderr, stdout } = await exec(command, args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  })
  if (stdout) process.stdout.write(stdout)
  if (stderr) process.stderr.write(stderr)
}

async function output(command, args, cwd) {
  const { stderr, stdout } = await exec(command, args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  })
  if (stderr) process.stderr.write(stderr)
  return stdout
}
