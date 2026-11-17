// Bundle only platform transport; declarative UI and application behavior stay in Wasm.
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
const root=path.resolve(process.argv[2]);
const entry=path.join(root,'platform/start.js');
const result=await build({entryPoints:[entry],bundle:true,minify:true,format:'esm',target:'es2022',
  external:['https://*'],write:false});
await fs.writeFile(entry,result.outputFiles[0].contents);
async function compress(directory) {
  for(const item of await fs.readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,item.name);
    if(item.isDirectory()) await compress(file);
    else if(/\.(wasm|js|mjs|json|svg|css|html|dl|wgsl|glsl|f32)$/.test(file)) {
      const bytes=await fs.readFile(file);
      await fs.writeFile(file+'.gz',gzipSync(bytes,{level:9}));
      await fs.writeFile(file+'.br',brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:9}}));
    }
  }
}
await compress(root);
