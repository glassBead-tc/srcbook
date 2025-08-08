import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'url';

// When running Srcbook as an npx executable, the cwd is not reliable.
// Commands that should be run from the root of the package, like npm scripts
// should therefore use DIST_DIR as the cwd.
const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

export const HOME_DIR = os.homedir();
// If set, SRCBOOK_HOME overrides the default home directory when computing storage paths
export const STORAGE_HOME_DIR = process.env.SRCBOOK_HOME && process.env.SRCBOOK_HOME.trim().length > 0
  ? process.env.SRCBOOK_HOME
  : HOME_DIR;
export const SRCBOOK_DIR = path.join(STORAGE_HOME_DIR, '.srcbook');
export const SRCBOOKS_DIR = path.join(SRCBOOK_DIR, 'srcbooks');
export const APPS_DIR = path.join(SRCBOOK_DIR, 'apps');
export const DIST_DIR = _dirname;
export const PROMPTS_DIR = path.join(DIST_DIR, 'prompts');
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
