import fs from 'node:fs'
import path from 'node:path'

// Consume this option before legacy phase/batch parsing. Never infer an evidence root.
export function evidenceDirectory(argv = process.argv) {
  if (argv[2] !== '--evidence-dir' || !argv[3] || !path.isAbsolute(argv[3]))
    throw new Error('Requires --evidence-dir <absolute existing directory> before phase/batch arguments')
  const directory = path.resolve(argv[3])
  if (!fs.statSync(directory).isDirectory()) throw new Error('Evidence path must be a directory')
  argv.splice(2, 2)
  return directory
}
