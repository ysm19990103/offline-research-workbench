import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 plugins:[react()],publicDir:false,
 resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},
 define:{'process.env.NODE_ENV':JSON.stringify('production')},
 build:{outDir:'.offline-build',emptyOutDir:true,target:'es2022',lib:{entry:fileURLToPath(new URL('./offline/main.tsx',import.meta.url)),name:'YouxuWorkbench',formats:['iife'],fileName:()=> 'workbench.js',cssFileName:'workbench'},rollupOptions:{output:{inlineDynamicImports:true}}}
});
