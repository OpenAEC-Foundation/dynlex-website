import {pathToFileURL} from 'node:url';
import {compilerPath} from '../../scripts/dependencies.mjs';
export {compilerPath};
export const {buildRuntimeImports,createRuntimeFilesystem,inspectRuntimeWasmLayout} =
  await import(pathToFileURL(compilerPath('src/web/ide/public/compiler/runtimeImports.js')).href);
