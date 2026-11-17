// Execute build-time DynLex programs through the pinned runtime distribution.
import {pathToFileURL} from 'node:url';
import {compilerPath} from './dependencies.mjs';
await import(pathToFileURL(compilerPath('scripts/run_program.mjs')).href);
