import fs from 'node:fs/promises';
import Path from 'node:path';
import type { CellType, CodeCellType, CodeLanguageType, PackageJsonCellType } from '@srcbook/shared';
import { decodeDir } from '../srcmd.mjs';
import { SRCBOOKS_DIR } from '../constants.mjs';
import {
  writeToDisk as writeAllToDisk,
  writeCellToDisk,
  writeReadmeToDisk,
  moveCodeCellOnDisk,
  removeCodeCellFromDisk,
} from '../srcbook/index.mjs';
import type { StorageProvider } from './types.mjs';

export class FileSystemStorageProvider implements StorageProvider {
  async readSrcbook(srcbookDir: string): Promise<{
    cells: CellType[];
    language: CodeLanguageType;
    'tsconfig.json'?: string;
  }> {
    const result = await decodeDir(srcbookDir);
    if (result.error) {
      throw new Error(`Cannot create session from invalid srcbook directory at ${srcbookDir}`);
    }
    const srcbook = result.srcbook;
    return {
      cells: srcbook.cells,
      language: srcbook.language,
      'tsconfig.json': srcbook['tsconfig.json'],
    };
  }

  async writeAll(srcbook: {
    dir: string;
    cells: CellType[];
    language: CodeLanguageType;
    'tsconfig.json'?: string;
  }): Promise<void> {
    await writeAllToDisk(srcbook as any);
  }

  async writeCell(
    srcbookDir: string,
    language: CodeLanguageType,
    cells: CellType[],
    cell: PackageJsonCellType | CodeCellType,
  ): Promise<void> {
    await writeCellToDisk(srcbookDir, language, cells, cell);
  }

  async writeReadme(srcbookDir: string, language: CodeLanguageType, cells: CellType[]): Promise<void> {
    await writeReadmeToDisk(srcbookDir, language, cells);
  }

  async moveCodeCell(
    srcbookDir: string,
    language: CodeLanguageType,
    cells: CellType[],
    cell: CodeCellType,
    oldFilename: string,
  ): Promise<void> {
    await moveCodeCellOnDisk(srcbookDir, language, cells, cell, oldFilename);
  }

  async removeCodeCell(srcbookDir: string, filename: string): Promise<void> {
    await removeCodeCellFromDisk(srcbookDir, filename);
  }

  async listSessions(): Promise<string[]> {
    const entries = await fs.readdir(SRCBOOKS_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((entry) => {
        const parentPath = (entry as any).parentPath || (entry as any).path || SRCBOOKS_DIR;
        return Path.join(parentPath, entry.name);
      });
  }

  async readPackageJsonContents(sessionDir: string): Promise<string> {
    return fs.readFile(Path.join(sessionDir, 'package.json'), { encoding: 'utf8' });
  }
}

export default new FileSystemStorageProvider();