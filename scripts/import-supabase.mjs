import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries((await fs.readFile(path.join(root, '.env.local'), 'utf8')).split(/\r?\n/).filter(Boolean).map(line => { const i=line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; }));
const password = process.env.IMPORT_OWNER_PASSWORD;
if (!password) throw new Error('Set IMPORT_OWNER_PASSWORD for this run only');
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
const {data:auth,error:authError}=await supabase.auth.signInWithPassword({email:'elizaveta.gal1movaa@gmail.com',password});
if(authError) throw authError;
const userId=auth.user.id;
const raw=JSON.parse(await fs.readFile(path.join(root,'src/seed/coded494.json'),'utf8'));
const excluded=new Set([393,424]);
const border=new Set([106,142,155,162,172,184,204,211,242,267,275,280,284,317,333,348,354,364,406,432,437,461,469,483,488]);
const rows=raw.filter(x=>!excluded.has(Number(x.index)));
const uuid=(tag)=>{const h=crypto.createHash('sha256').update('visual-code:'+tag).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`};
const methodId=uuid('method-v1'); const corpusId=uuid('corpus-main-2026-11-17');
const check=async(p,label)=>{const {error}=await p;if(error)throw new Error(`${label}: ${error.message}`)};
await check(supabase.from('method_versions').upsert({id:methodId,version:'1.0',definitions:{color:'Историческая цветовая разметка; исходный пиксельный алгоритм не восстановлен',sign_type:['Надпись','Монограмма','Символ','Знак + название'],motif:['Без отдельного образа','Абстрактная геометрия','Буква / инициалы','Животное','Предмет','Природа','Человек','Технология']},exclusions:{confirmed_duplicates:[393,424]},processing_params:{monte_carlo_repetitions:49999,seed:20261117,color_algorithm_status:'historical'},created_by:userId},{onConflict:'id'}),'method');
await check(supabase.from('corpora').upsert({id:corpusId,name:'Основной корпус · 17.11.2026',description:'492 уникальные записи после объединения двух подтверждённых пар дублей',created_by:userId,locked_at:null},{onConflict:'id'}),'corpus');
const {data:existingItems,error:existingError}=await supabase.from('corpus_items').select('logo_version_id').eq('corpus_id',corpusId); if(existingError)throw existingError;
const existing=new Set(existingItems.map(x=>x.logo_version_id));
let done=0;
for(const x of rows){
  const n=Number(x.index), pixel=n===117, liga=n===271;
  const companyId=uuid(`company-${n}`),logoId=uuid(`logo-${n}-active`),annotationId=uuid(`annotation-${n}-v1`);
  if(existing.has(logoId)){done++;if(done%25===0)console.log(`${done}/${rows.length} (resume)`);continue;}
  const activeFile=pixel?'versions/121_pixelplus_ru_official.png':liga?'versions/277_ligaa_agency_header.png':String(x.E);
  const local=path.join(root,'public/logos',activeFile); const bytes=await fs.readFile(local); const sha=crypto.createHash('sha256').update(bytes).digest('hex');
  const ext=path.extname(activeFile).toLowerCase(); const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.gif':'image/gif'}[ext];
  const base=path.basename(activeFile); const safeBase=/^[A-Za-z0-9._-]+$/.test(base)?base:`logo-${String(n).padStart(3,'0')}${ext}`;
  const storagePath=`corpus/${String(n).padStart(3,'0')}/${safeBase}`;
  await check(supabase.from('companies').upsert({id:companyId,canonical_name:String(x.B),domain:String(x.C||'').replace(/^https?:\/\//,'').replace(/\/$/,''),legal_details:String(x.D||''),name_variants:[]},{onConflict:'id'}),`company ${n}`);
  const upload=await supabase.storage.from('logos').upload(storagePath,bytes,{contentType:mime,upsert:true,cacheControl:'3600'}); if(upload.error)throw new Error(`upload ${n}: ${upload.error.message}`);
  await check(supabase.from('logo_versions').upsert({id:logoId,company_id:companyId,storage_path:storagePath,preview_path:null,original_filename:path.basename(activeFile),mime_type:mime,byte_size:bytes.length,sha256:sha,source_url:pixel?'https://pixelplus.ru/doc/logo/P.svg':liga?'https://ligaa.agency/':String(x.F||''),obtained_at:'2026-11-17',created_by:userId},{onConflict:'id'}),`logo ${n}`);
  const values={color:pixel?'красный':liga?'синий':String(x.N||''),hex:pixel?'#c5161d':liga?'#342fff':String(x.O||''),achromatic:pixel||liga?false:String(x.P).toLowerCase()==='да',sign_type:pixel?'Монограмма':liga?'Надпись':String(x.type_label||''),motif:pixel?'Буква / инициалы':liga?'Без отдельного образа':String(x.motif_label||''),borderline:border.has(n),historical_source_index:n};
  await check(supabase.from('annotations').upsert({id:annotationId,logo_version_id:logoId,method_version_id:methodId,author_id:userId,values,comment:pixel?'Исходный знак Globus сохранён отдельно; активна официальная версия Пиксель Плюс':liga?'Исходный Bauns сохранён отдельно; активна версия из шапки Лиги А.':'Импорт исторической авторской разметки',status:'approved',reviewed_by:userId,reviewed_at:new Date().toISOString()},{onConflict:'id'}),`annotation ${n}`);
  await check(supabase.from('corpus_items').upsert({corpus_id:corpusId,logo_version_id:logoId,annotation_id:annotationId,company_group:{geography:String(x.K||''),specialization:String(x.L||''),rank_position:String(x.M||'')},position:done+1},{onConflict:'corpus_id,logo_version_id'}),`item ${n}`);
  done++; if(done%25===0||done===rows.length)console.log(`${done}/${rows.length}`);
}
await check(supabase.from('corpora').update({locked_at:new Date().toISOString()}).eq('id',corpusId),'lock corpus');
console.log(JSON.stringify({ok:true,companies:done,logos:done,annotations:done,corpus_items:done,corpus_id:corpusId},null,2));
