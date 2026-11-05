"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useResource } from "@/lib/api/useResource";
import { ApiError } from "@/lib/api/apiError";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { saveDownload } from "@/lib/api/saveDownload";
import { documentBatch } from "@/features/documents/service";
import { useMeasurementImages } from "@/features/measurements/StructureCard";
import { metresToMm } from "@/features/measurements/units";
import { technicalText } from "@/features/measurements/technicalText";
import { formatDate } from "@/lib/formatDate";
import { parseEngineering, type EngineeringRow } from "./contracts";
import styles from "./EngineeringPanel.module.css";
type Command = { kind: "check"; id: string; requestKey: string; expectedRevision: number; completed: boolean }
 | { kind: "close"; requestKey: string; expectedRevision: number; documentId: string }
 | { kind: "upload"; requestKey: string; expectedRevision: number; replaces: string | null; file: File };
function SketchImage({ path }: { path: string }) {
 const api = useApiClient(); const [url,setUrl] = useState<string>(); const [failed,setFailed]=useState(false); const [retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();let owned:string|undefined;
  void api.download(path,{signal:controller.signal}).then(file=>{if(controller.signal.aborted)return; owned=URL.createObjectURL(file.blob);setUrl(owned);setFailed(false);}).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
  return()=>{controller.abort();if(owned)URL.revokeObjectURL(owned);};},[api,path,retry]);
 return url ? /* eslint-disable-next-line @next/next/no-img-element */
 <img className={styles.picture} src={url} alt="Croquis radicado de Instalación" />
  : <p>{failed ? <button className="button-secondary" onClick={()=>setRetry(n=>n+1)}>Reintentar croquis</button> : "Cargando croquis…"}</p>;
}
export function EngineeringPanel({ projectId, onRefresh }: { projectId:string; onRefresh:(signal:AbortSignal)=>Promise<void> }) {
 const api=useApiClient();const {activeRole,user}=useAuth();const path=`projects/${projectId}/engineering`;
 const load=useCallback(async(signal:AbortSignal)=>parseEngineering(await api.get<unknown>(path,{signal}),projectId),[api,path,projectId]);
 const resource=useResource(load);const data=resource.data;const drawings=useMeasurementImages(projectId,data?.structures.map(r=>r.structure)??[]);
 const [pending,setPending]=useState<Command>();const [busy,setBusy]=useState(false);const [error,setError]=useState<unknown>();const [notice,setNotice]=useState("");
 const [file,setFile]=useState<File>();const [confirm,setConfirm]=useState(false);
 const operation=useRef<AbortController|null>(null);
 useEffect(()=>()=>operation.current?.abort(),[projectId,activeRole]);
 const writable=!!data?.canModify&&activeRole==="Engineering"&&user?.subject===data.responsibleSubject;
 async function run(command:Command) {
  if(!writable||operation.current)return;
  const controller=new AbortController();operation.current=controller;setBusy(true);setPending(command);setError(undefined);setNotice("");
  try {
   const options={signal:controller.signal};
   if(command.kind==="check") await api.put<void>(`${path}/structures/${command.id}/check`,{requestKey:command.requestKey,expectedRevision:command.expectedRevision,completed:command.completed},options);
   else if(command.kind==="close")await api.post<void>(`${path}/complete`,{requestKey:command.requestKey,expectedRevision:command.expectedRevision,documentId:command.documentId},options);
   else await api.upload<unknown>(`${path}/acta`,documentBatch([{file:command.file,replacesDocumentId:command.replaces}]),{...options,query:new URLSearchParams({requestKey:command.requestKey,expectedRevision:String(command.expectedRevision)})});
   if(controller.signal.aborted)return;
   resource.update(await load(controller.signal));setPending(undefined);setConfirm(false);setNotice("Guardado confirmado por el servidor.");
   if(command.kind==="upload")setFile(undefined);
   if(command.kind==="close")await onRefresh(controller.signal);
  } catch(failure) {
   if(controller.signal.aborted)return;setError(failure);
   try { const current=await load(controller.signal); resource.update(current); if(current.taskStatus==="Completed"){setPending(undefined);setConfirm(false);} } catch { /* Keep failed state visible and retry available. */ }
   if(failure instanceof ApiError && [400,403,409,413].includes(failure.status)) {setPending(undefined);setConfirm(false);}
  } finally {if(!controller.signal.aborted){setBusy(false);operation.current=null;}}
 }
 async function download(id:string,name:string) {
  const controller=new AbortController();if(operation.current)return;operation.current=controller;setBusy(true);setError(undefined);
  try{await saveDownload(()=>api.downloadStream(`${path}/acta/${id}/download`,{signal:controller.signal}),name,controller.signal,{serverFilename:true});}
  catch(e){if(!controller.signal.aborted)setError(e);}finally{if(!controller.signal.aborted){operation.current=null;setBusy(false);}}
 }
 if(resource.loading)return <p role="status">Consultando Ingeniería…</p>;
 if(resource.error)return <ErrorNotice error={resource.error} retry={resource.refresh}/>;
 if(!data)return null;
 const disabled=busy||!!pending;
 const label=(r:EngineeringRow)=>`${r.structure.itemId ? "Ítem "+r.structure.itemNumber : "Agregada en obra"} · Unidad ${r.structure.unitOrdinal}/${r.structure.unitCount}`;
 const errors:Record<string,string>={EngineeringRevisionConflict:"El expediente cambió. Revisa el estado actualizado antes de reintentar.",EngineeringLocked:"Ingeniería ya está cerrada; el expediente es de solo lectura.",EngineeringIncomplete:"Completa todas las estructuras antes de finalizar.",EngineeringActaRequired:"Carga y verifica un Acta vigente antes de finalizar.",InvalidEngineeringPdf:"Selecciona un PDF válido, completo y de hasta 25 MiB.",EngineeringActaTooLarge:"El PDF supera 25 MiB.",EngineeringActaIntegrity:"El documento no superó la verificación de integridad.",EngineeringActaUnavailable:"El Acta no está disponible en almacenamiento.",EngineeringRequestConflict:"El reintento no coincide con la operación original."};
 return <section className="panel stack" aria-label="Ingeniería — Acta de Vanos">
 <h2>Ingeniería · Elaborar Acta de Vanos</h2><p>{data.taskStatus==="Completed"?"Completada · Solo lectura":"En curso · Sin plazo formal"} · Responsable: {data.responsibleSubject}</p>
 <p className="metadata">Inicio: {formatDate(data.startedAt)}{data.completedAt&&` · Finalización: ${formatDate(data.completedAt)}`}</p>
 <dl className={styles.facts}><div><dt>Estructuras</dt><dd>{data.total}</dd></div><div><dt>Completadas</dt><dd>{data.completed}</dd></div><div><dt>Pendientes</dt><dd>{data.pending}</dd></div><div><dt>Avance</dt><dd>{data.progress}%</dd></div></dl>
 {notice&&<p role="status">{notice}</p>}{error instanceof ApiError&&error.code&&errors[error.code]?<p role="alert">{errors[error.code]}</p>:<ErrorNotice error={error}/>}
 {pending&&!busy&&<button className="button-secondary" onClick={()=>void run(pending)}>Reintentar guardado seguro</button>}
 <div className={styles.cards}>{data.structures.map(row=>{const s=row.structure;const image=s.imageCatalogItemId?drawings.images[s.imageCatalogItemId]:undefined;
 return <article className={`stack ${styles.card}`} key={s.id} aria-label={label(row)}>
 <h3>{label(row)}</h3><p>{s.actualLocation??s.location??"Ubicación sin registrar"} · {row.completed?"Completada":"Pendiente"}</p>
 {image?.url? /* eslint-disable-next-line @next/next/no-img-element */
 <img className={styles.picture} src={image.url} alt={`Dibujo cotizado ${s.itemNumber??""}`}/>:<p>{s.imageCatalogItemId?image?.failed?<button onClick={drawings.retry}>Reintentar dibujo</button>:"Cargando dibujo…":"Sin dibujo cotizado"}</p>}
 <p><strong>{s.actualWidth!=null?metresToMm(s.actualWidth):"Sin registrar"} × {s.actualHeight!=null?metresToMm(s.actualHeight):"Sin registrar"} mm</strong></p>
 <p>Tipo de medida: {s.measurementType==="Opening"?"Vano":s.measurementType==="Production"?"Producción":s.measurementType==="Agreed"?"Pactada":"Sin registrar"}</p>
 <p>Sistema en obra: {s.actualSystemText??"Sin registrar"}</p><p>{technicalText(s.technical)}</p>
 {s.installationObservations&&<p>Observaciones: {s.installationObservations}</p>}
 {s.modification&&<div><h4>Modificación radicada</h4><p>{s.modification.type} · {s.modification.reason} · {s.modification.description}</p></div>}
 {[...new Set([s.sketchVersionId,s.modification?.sketchVersionId].filter((v):v is string=>!!v))].map(v=><SketchImage key={v} path={`${path}/structures/${s.id}/sketches/${v}/image`}/>)}
 <label className={styles.check}><input type="checkbox" checked={row.completed} disabled={!writable||disabled} onChange={e=>void run({kind:"check",id:s.id,requestKey:crypto.randomUUID(),expectedRevision:row.revision,completed:e.target.checked})}/>Estructura trabajada en Acta de Vanos</label>
 {busy&&pending?.kind==="check"&&pending.id===s.id&&<p role="status">Guardando estructura…</p>}
 </article>;})}</div>
 <section className={`stack ${styles.acta}`} aria-label="Documento — Acta de Vanos"><h3>Documento — Acta de Vanos</h3>
 {writable&&<><label>Seleccionar Acta PDF<input className="form-control" type="file" accept=".pdf,application/pdf" disabled={disabled} onChange={e=>{setFile(e.target.files?.[0]);setError(undefined);}}/></label>
 {file&&<p>Seleccionado: {file.name} · {file.size} bytes · Aún no cargado</p>}
 <button className="button-primary" disabled={disabled||!file||!file.name.toLowerCase().endsWith(".pdf")||file.size===0||file.size>25*1024*1024} onClick={()=>file&&void run({kind:"upload",requestKey:crypto.randomUUID(),expectedRevision:data.revision,replaces:data.currentDocumentId,file})}>{data.currentDocumentId?"Cargar nueva versión del Acta":"Cargar Acta"}</button></>}
 {!data.documents.length&&<p>No hay Acta persistida.</p>}
 {data.documents.map(({document:d,version,sha256})=><div key={d.id}><strong>Versión {version} · {d.id===data.currentDocumentId?"Vigente":"Histórica"} · {d.originalFileName}</strong><p>{formatDate(d.uploadedAt)} · {d.uploadedBy.name??d.uploadedBy.email??"Responsable registrado"} · {d.sizeBytes} bytes</p><details><summary>Integridad SHA-256</summary><code>{sha256}</code></details><button className="button-secondary" disabled={busy} onClick={()=>void download(d.id,d.originalFileName)}>Descargar versión {version}</button></div>)}
 </section>
 {writable&&<div className="stack"><button className="button-primary" disabled={disabled||data.pending>0||!data.currentDocumentId} onClick={()=>setConfirm(true)}>Confirmar finalización de Ingeniería</button>
 {confirm&&<div role="dialog" aria-label="Confirmar cierre de Ingeniería"><p>Se congelarán los checks y el Acta vigente. No podrás modificarlos después.</p><button className="button-primary" disabled={disabled} onClick={()=>data.currentDocumentId&&void run({kind:"close",requestKey:crypto.randomUUID(),expectedRevision:data.revision,documentId:data.currentDocumentId})}>Finalizar Ingeniería</button><button className="button-secondary" disabled={busy} onClick={()=>setConfirm(false)}>Cancelar</button></div>}</div>}
 <details><summary>Historial de Ingeniería</summary>{data.history.map(h=><p key={h.revision}>{{Initialize:"Inicio",Check:"Estructura completada",Uncheck:"Estructura pendiente",UploadActa:"Acta cargada",Complete:"Finalización"}[h.action]??h.action} · {formatDate(h.at)} · {h.actor.name??h.actor.email??"Responsable registrado"}{h.reason&&` · ${h.reason}`}</p>)}</details>
 </section>;
}
