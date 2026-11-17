import {pathToFileURL} from 'node:url';
import {compilerPath} from '../../scripts/dependencies.mjs';
export const {observeAllocations} = await import(pathToFileURL(compilerPath('tests/web/allocation_probe.mjs')).href);
