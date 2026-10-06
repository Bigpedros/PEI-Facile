import {cp,mkdir,readdir} from 'node:fs/promises';
const dir='public/vendor';await mkdir(dir+'/core',{recursive:true});
await cp('node_modules/tesseract.js/dist/worker.min.js',dir+'/worker.min.js');
for(const name of await readdir('node_modules/tesseract.js-core'))if(/^tesseract-core.*\.(js|wasm)$/.test(name))await cp('node_modules/tesseract.js-core/'+name,dir+'/core/'+name);
for(const name of ['cmaps','standard_fonts'])await cp('node_modules/pdfjs-dist/'+name,dir+'/'+name,{recursive:true});
console.log('Worker OCR e risorse PDF aggiornati alle dipendenze installate.');
