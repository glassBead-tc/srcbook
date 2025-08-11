import { z } from 'zod';

import { MarkdownCellSchema, CodeCellSchema, CellSchema, CellUpdateAttrsSchema } from '../schemas/cells.mjs';

export type MarkdownCellType = z.infer<typeof MarkdownCellSchema>;
export type CodeCellType = z.infer<typeof CodeCellSchema>;

export type CellType = z.infer<typeof CellSchema>;

export type CellUpdateAttrsType = z.infer<typeof CellUpdateAttrsSchema>;

export type CellErrorType = {
  message: string;
  attribute?: string;
};

export type CodeLanguageType = 'javascript' | 'typescript';
