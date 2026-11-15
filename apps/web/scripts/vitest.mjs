// Run Vitest from the real-cased path of this package.
//
// On Windows a terminal can report the drive letter in lower case (VS Code uses "c:\..."). The
// Vitest worker is then loaded as file:///c:/... while Vite resolves `import ... from 'vitest'`
// to file:///C:/..., and Node keeps two separate copies. Test files that import from 'vitest'
// then fail with "Cannot read properties of undefined (reading 'config')" or "Vitest failed to
// find the runner" unless a warm .vite cache happens to hide it. Normalising both paths with
// realpath avoids the duplicate. Elsewhere this is a plain pass-through.
import process from 'node:process'
import { realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const bin = realpathSync.native(
  path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs'),
)
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  cwd: realpathSync.native(process.cwd()),
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
