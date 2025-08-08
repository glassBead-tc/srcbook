export interface StorageProvider {
  // Read a srcbook from a given working directory and return core session fields
  readSrcbook(srcbookDir: string): Promise<{
    cells: any[];
    language: string;
    'tsconfig.json'?: string;
  }>;

  // Persist the entire srcbook to storage
  writeAll(srcbook: {
    dir: string;
    cells: any[];
    language: string;
    'tsconfig.json'?: string;
  }): Promise<void>;

  // Persist a single cell and keep README in sync
  writeCell(
    srcbookDir: string,
    language: string,
    cells: any[],
    cell: any,
  ): Promise<void>;

  // Persist README derived from cells
  writeReadme(srcbookDir: string, language: string, cells: any[]): Promise<void>;

  // Move/rename a code cell file and keep README in sync
  moveCodeCell(
    srcbookDir: string,
    language: string,
    cells: any[],
    cell: any,
    oldFilename: string,
  ): Promise<void>;

  // Remove a code cell file from storage
  removeCodeCell(srcbookDir: string, filename: string): Promise<void>;

  // List all existing sessions' working directories
  listSessions(): Promise<string[]>;

  // Read the current package.json contents for a session
  readPackageJsonContents(sessionDir: string): Promise<string>;
}