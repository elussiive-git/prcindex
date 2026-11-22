import { useEffect, useState } from "react";
import { logos as localLogos } from "./data";
import { supabase } from "./auth";
import type { Logo } from "./types";

type AnyRow = Record<string, any>;

export function useCatalogLogos() {
  const [items, setItems] = useState<Logo[]>(localLogos);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void (async () => {
      const { data, error } = await supabase
        .from("corpus_items")
        .select("position,company_group,logo_version:logo_versions!corpus_items_logo_version_id_fkey(id,storage_path,original_filename,source_url,company:companies!logo_versions_company_id_fkey(canonical_name,domain)),annotation:annotations!corpus_items_annotation_id_fkey(id,values,status,comment)")
        .order("position");
      if (error) throw error;
      const rows = data as AnyRow[];
      // Актуальная методика: если для логотипа есть разметка последней версии, показываем её
      const { data: methods } = await supabase.from("method_versions").select("id,version,created_at").order("created_at", { ascending: false }).limit(1);
      const latestMethod = methods?.[0];
      const latestByLogo = new Map<string, AnyRow>();
      if (latestMethod) {
        const { data: latest, error: latestError } = await supabase.from("annotations").select("id,logo_version_id,values,status,comment").eq("method_version_id", latestMethod.id);
        if (latestError) throw latestError;
        for (const a of (latest ?? []) as AnyRow[]) latestByLogo.set(a.logo_version_id, a);
      }
      const { data: signed, error: signError } = await supabase.storage
        .from("logos")
        .createSignedUrls(rows.map((x) => x.logo_version.storage_path), 3600);
      if (signError) throw signError;
      const mapped = rows.map((x, i) => {
        const ann = latestByLogo.get(x.logo_version.id) ?? x.annotation;
        const v = ann.values, g = x.company_group, l = x.logo_version, c = l.company;
        const palette=Array.isArray(v.palette_colors)&&v.palette_colors.length?v.palette_colors:[{name:v.color||"серый",hex:v.hex||"#999999"}];
        return { id:x.position, name:c.canonical_name, site:c.domain?`https://${c.domain}`:"", file:l.original_filename, imageUrl:signed?.[i]?.signedUrl, geo:g.geography||"", segment:g.specialization||"", rank:g.rank_position||"", color:v.color||palette[0].name, hex:v.hex||palette[0].hex, palette, paletteType:v.palette_type||"Одноцветный", achromatic:Boolean(v.achromatic), signType:v.sign_type||"", motif:v.motif||"", borderline:Boolean(v.borderline), status:ann.status==="approved"?"Проверено":"Требует проверки", source:l.source_url||"", change:ann.comment?.includes("Исходный")?ann.comment:undefined, annotationId:ann.id, annotationValues:v } as Logo;
      });
      if (alive) setItems(mapped);
    })().catch((error) => console.error("[catalog]", error));
    return () => { alive = false; };
  }, []);
  async function updateColor(id:number,palette:{name:string;hex:string}[],paletteType:NonNullable<Logo["paletteType"]>){
    const item=items.find(x=>x.id===id);
    if(!item)throw new Error("Логотип не найден");
    if(!supabase||!item.annotationId)throw new Error("Облачное сохранение недоступно");
    const primary=palette[0],achromatic=palette.every(x=>["чёрный","серый","белый"].includes(x.name));
    const values={...(item.annotationValues||{}),color:primary.name,hex:primary.hex,palette_colors:palette,palette_type:paletteType,achromatic};
    const{error}=await supabase.from("annotations").update({values}).eq("id",item.annotationId);
    if(error)throw error;
    const updated={...item,color:primary.name,hex:primary.hex,palette,paletteType,achromatic,annotationValues:values};
    setItems(current=>current.map(x=>x.id===id?updated:x));
    return updated;
  }
  return {items,updateColor};
}
