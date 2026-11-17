import {pathToFileURL} from 'node:url';
import {compilerPath} from '../../scripts/dependencies.mjs';
export const {renderFloatShaderReferences}=await import(pathToFileURL(compilerPath('tests/web/float_shader_reference.mjs')).href);
