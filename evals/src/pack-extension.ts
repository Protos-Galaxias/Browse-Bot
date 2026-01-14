import { existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { basename, dirname } from 'path';

export function packExtension(sourceDir: string, outputPath: string): string {
  if (!existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }

  // Remove old xpi if exists
  if (existsSync(outputPath)) {
    unlinkSync(outputPath);
  }

  // Use system zip command (available on macOS/Linux)
  const sourceDirName = basename(sourceDir);
  const parentDir = dirname(sourceDir);
  
  // Create zip from inside the directory so paths are relative
  execSync(`cd "${sourceDir}" && zip -r "${outputPath}" .`, {
    stdio: 'pipe'
  });

  return outputPath;
}

export function getXpiPath(extensionDir: string): string {
  return extensionDir.replace(/\/?$/, '.xpi');
}
