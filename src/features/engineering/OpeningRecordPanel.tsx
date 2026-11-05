"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useApiClient} from "@/features/auth/hooks/useApiClient";
import {useAuth} from "@/features/auth/hooks/useAuth";
import {useResource} from "@/lib/api/useResource";
import {ApiError} from "@/lib/api/apiError";
import {ErrorNotice} from "@/lib/api/ErrorNotice";
import {saveDownload} from "@/lib/api/saveDownload";
import {documentBatch} from "@/features/documents/service";
import {useMeasurementImages} from "@/features/measurements/StructureCard";
import {formatDate} from "@/lib/formatDate";
import {EngineeringStructureDetails} from "./EngineeringPanel";
import {parseOpeningState,type OpeningCommand,type OpeningAction,type RoundStatus} from "./openingContracts";
import styles from "./EngineeringPanel.module.css";
const statuses:Record<RoundStatus,string>={Ready:"Pendiente de presentación",Presented:"Esperando respuesta del cliente",ChangesRequested:"Cambios solicitados · En revisión de Ingeniería",Revised:"Revisión completada · Nueva ronda disponible",Accepted:"Aceptada · Radicación de Vanos pendiente"};
const approvals={AwaitingApproval:"Esperando aprobación",Confirmed:"Confirmada",ChangeRequested:"Cambio solicitado / En revisión de Ingeniería"};
type Operation={roundId:string;command:OpeningCommand}|{roundId:string;file:File;kind:"Signed"|"Revised";key:string;revision:number;replaces:string|null};
function ResponseTimer({seconds,running}:{seconds:number|null;running:boolean}){
 const [elapsed,setElapsed]=useState(0);
 useEffect(()=>{if(!running)return;const start=performance.now();const timer=setInterval(()=>setElapsed((performance.now()-start)/1000),1000);return()=>clearInterval(timer);},[running]);
 if(seconds===null)return <p>Tiempo de respuesta: aún no inicia.</p>;
 const total=Math.floor(seconds+(running?elapsed:0));return <p>Tiempo de respuesta: {Math.floor(total/86400)} d {Math.floor(total%86400/3600)} h {Math.floor(total%3600/60)} min {total%60} s{running?" · En curso":" · Registrado"}</p>;
}
export function OpeningRecordPanel({projectId,onRefresh}:{projectId:string;onRefresh:(signal:AbortSignal)=>Promise<void>}){
 const api=useApiClient();const {activeRole}=useAuth();const path=`projects/${projectId}/opening-records`;
 const load=useCallback(async(signal:AbortSignal)=>parseOpeningState(await api.get<unknown>(path,{signal}),projectId),[api,path,projectId]);
 const resource=useResource(load);const data=resource.data;const drawings=useMeasurementImages(projectId,data?.structures??[]);
 const [selection,setSelection]=useState<string>();const round=data?.rounds.find(r=>r.id===selection)??data?.rounds.at(-1);
 const [busy,setBusy]=useState(false);const [pending,setPending]=useState<Operation>();const [confirmation,setConfirmation]=useState<{operation:Operation;text:string}>();
 const [error,setError]=useState<unknown>();const [notice,setNotice]=useState("");const [changes,setChanges]=useState<Record<string,string>>({});const [observations,setObservations]=useState("");
 const [affected,setAffected]=useState<string[]>();const [file,setFile]=useState<File>();const [attest,setAttest]=useState(false);
 const fileInput=useRef<HTMLInputElement|null>(null);
 const operation=useRef<AbortController|null>(null);useEffect(()=>()=>operation.current?.abort(),[projectId,activeRole]);
 const reset=()=>{if(fileInput.current)fileInput.current.value="";setChanges({});setObservations("");setAffected(undefined);setFile(undefined);setAttest(false);setConfirmation(undefined);};
 async function run(op:Operation){
  if(operation.current)return;const controller=new AbortController();operation.current=controller;setBusy(true);setPending(op);setError(undefined);setNotice("");
  try{
   if("command" in op)await api.post<void>(`${path}/rounds/${op.roundId}/commands`,{...op.command},{signal:controller.signal});
   else await api.upload<unknown>(`${path}/rounds/${op.roundId}/documents`,documentBatch([{file:op.file,replacesDocumentId:op.replaces}]),{signal:controller.signal,query:new URLSearchParams({requestKey:op.key,expectedRevision:String(op.revision),kind:op.kind})});
   if(controller.signal.aborted)return;
   const current=await load(controller.signal);resource.update(current);setPending(undefined);setConfirmation(undefined);setNotice("Guardado confirmado por el servidor.");
   if(!("command" in op)){if(fileInput.current)fileInput.current.value="";setFile(undefined);setAttest(false);}else if(["RequestChanges","Accept","CloseReview"].includes(op.command.action)){reset();setSelection(undefined);await onRefresh(controller.signal);}else if(op.command.action==="DeclareAffected")setAffected(undefined);
  }catch(e){if(controller.signal.aborted)return;setError(e);try{resource.update(await load(controller.signal));}catch{/* Keep retry with its original key. */}if(e instanceof ApiError&&[400,403,404,409,413].includes(e.status)){setPending(undefined);setConfirmation(undefined);}}
  finally{if(!controller.signal.aborted){setBusy(false);operation.current=null;}}
 }
 async function download(id:string,name:string){if(operation.current)return;const c=new AbortController();operation.current=c;setBusy(true);setError(undefined);try{await saveDownload(()=>api.downloadStream(`${path}/documents/${id}/download`,{signal:c.signal}),name,c.signal,{serverFilename:true});}catch(e){if(!c.signal.aborted)setError(e);}finally{if(!c.signal.aborted){operation.current=null;setBusy(false);}}}
 if(resource.loading)return <p role="status">Consultando Acta de Vanos…</p>;
 if(resource.error)return <ErrorNotice error={resource.error} retry={resource.refresh}/>;
 if(!data||!round)return null;
 const advisor=activeRole==="CommercialAdvisor";const reviewer=activeRole==="Engineering"&&round.canReview;
 const disabled=busy||!!pending;const approvalsDone=round.structures.filter(s=>s.approval==="Confirmed").length;
 const declared=affected??round.structures.filter(s=>s.affected).map(s=>s.structureId);
 const command=(action:OpeningAction,extra:Partial<OpeningCommand>={}):Operation=>({roundId:round.id,command:{requestKey:crypto.randomUUID(),expectedRevision:round.revision,action,...extra}});
 const ask=(operation:Operation,text:string)=>setConfirmation({operation,text});
 const currentPdf=data.documents.find(d=>d.document.id===round.presentedDocumentId)!;
 const errors:Record<string,string>={OpeningRevisionConflict:"El expediente cambió. Revisa el estado recuperado antes de continuar.",OpeningRoundStateConflict:"Esta ronda ya no permite esa operación.",OpeningApprovalsIncomplete:"Confirma todas las estructuras antes de aceptar.",OpeningSignedActaRequired:"Carga el PDF firmado de esta ronda y confirma expresamente su correspondencia con el Acta presentada.",OpeningReviewIncomplete:"Completa los checks y declara las estructuras afectadas.",OpeningAffectedStructuresRequired:"Declara todas las estructuras afectadas, incluidas las solicitadas por el cliente.",OpeningAffectedDeclarationChanged:"La declaración cambió después de cargar el PDF. Carga una versión asociada a la declaración actual.",OpeningRevisedActaRequired:"Carga una nueva versión del Acta para esta revisión.",OpeningAdvisorNotConfigured:"El responsable comercial debe tener membresía de Asesor configurada.",EngineeringAssigneeNotConfigured:"Falta configurar Authentication:EngineeringAssigneeSubject.",EngineeringActaIntegrity:"El Acta no superó la verificación de integridad.",InvalidEngineeringPdf:"Selecciona un PDF válido de hasta 25 MiB.",OpeningApprovalLocked:"La aprobación histórica no puede cambiarse desde esta ronda."};
 const rows=reviewer?round.structures.filter(r=>r.affected):round.structures;
 return <section className="panel stack" aria-label="Presentación del Acta de Vanos">
 <h2>{reviewer?"Ingeniería · Revisar cambios del Acta de Vanos":"Presentación del Acta de Vanos"}</h2>
 <label>Ronda del Acta<select className="form-control" value={round.id} disabled={disabled} onChange={e=>{setSelection(e.target.value);reset();setError(undefined);}}>{data.rounds.map(r=><option key={r.id} value={r.id}>Ronda {r.number} · {statuses[r.status]}</option>)}</select></label>
 <h3>Ronda {round.number} · {statuses[round.status]}</h3><p>Recepción desde Ingeniería: {formatDate(round.receivedAt)}</p>
 <p>Acta de la ronda: versión {currentPdf.version} · {currentPdf.document.originalFileName}</p>
 <button className="button-secondary" disabled={busy} onClick={()=>void download(currentPdf.document.id,currentPdf.document.originalFileName)}>Descargar Acta de esta ronda</button>
 {round.presentedAt&&<p>Presentación: {formatDate(round.presentedAt)}</p>}{round.respondedAt&&<p>Respuesta registrada: {formatDate(round.respondedAt)}</p>}
 <ResponseTimer key={`${round.id}:${data.serverNow}`} seconds={round.responseSeconds} running={round.status==="Presented"}/>
 <p>Confirmaciones: {approvalsDone} de {round.structures.length}</p>
 {round.generalObservations&&<p>Observaciones generales para Ingeniería: {round.generalObservations}</p>}
 {notice&&<p role="status">{notice}</p>}{error instanceof ApiError&&error.code&&errors[error.code]?<p role="alert">{errors[error.code]}</p>:<ErrorNotice error={error}/>}
 {pending&&!busy&&<button className="button-secondary" onClick={()=>void run(pending)}>Reintentar guardado seguro</button>}
 {advisor&&round.canPresent&&<button className="button-primary" disabled={disabled} onClick={()=>ask(command("Present"),"Confirma que presentaste al cliente exactamente el Acta de esta ronda. El tiempo de respuesta comenzará al guardar.")}>Confirmar presentación al cliente</button>}
 {reviewer&&<details><summary>Declarar estructuras afectadas por la nueva versión</summary><p>Incluye las observadas y cualquier estructura adicional que cambie. El contenido del PDF no se compara automáticamente.</p>{round.structures.map(r=>{const s=data.structures.find(s=>s.id===r.structureId)!;return <label className={styles.check} key={r.structureId}><input type="checkbox" checked={declared.includes(r.structureId)} disabled={disabled||!!r.changeDescription} onChange={e=>setAffected(e.target.checked?[...declared,r.structureId]:declared.filter(id=>id!==r.structureId))}/>Ítem {s.itemNumber??"Agregada"} · Unidad {s.unitOrdinal}</label>;})}<button className="button-primary" disabled={disabled||!declared.length} onClick={()=>ask(command("DeclareAffected",{affectedStructureIds:declared}),"Confirmo que esta lista identifica todas las estructuras que cambian en la nueva versión.")}>Guardar declaración de estructuras afectadas</button></details>}
 <div className={styles.cards}>{rows.map(r=>{const s=data.structures.find(s=>s.id===r.structureId)!;return <article className={`stack ${styles.card}`} key={s.id} aria-label={`Ítem ${s.itemNumber??"Agregada"} · Unidad ${s.unitOrdinal}`}>
 <h4>Ítem {s.itemNumber??"Agregada"} · Unidad {s.unitOrdinal}/{s.unitCount}</h4><p>{s.actualLocation??s.location??"Sin ubicación"} · {approvals[r.approval]}</p>
 <EngineeringStructureDetails structure={s} projectId={projectId} image={s.imageCatalogItemId?drawings.images[s.imageCatalogItemId]:undefined} retryImage={drawings.retry}/>
 {r.changeDescription&&<p><strong>Cambio solicitado:</strong> {r.changeDescription}</p>}
 {reviewer?<label className={styles.check}><input type="checkbox" checked={r.reviewCompleted} disabled={disabled} onChange={e=>void run(command("ReviewCheck",{structureId:s.id,expectedRevision:r.revision,value:e.target.checked}))}/>Trabajo de revisión realizado</label>:advisor&&round.canRespond&&<>
 <label className={styles.check}><input type="checkbox" checked={r.approval==="Confirmed"} disabled={disabled||r.carriedApproval||Object.hasOwn(changes,s.id)} onChange={e=>void run(command("ConfirmStructure",{structureId:s.id,expectedRevision:r.revision,value:e.target.checked}))}/>Estructura confirmada por el cliente{r.carriedApproval?" · Aprobación conservada":""}</label>
 {r.approval==="AwaitingApproval"&&<><label className={styles.check}><input type="checkbox" checked={Object.hasOwn(changes,s.id)} disabled={disabled} onChange={e=>setChanges(old=>{const next={...old};if(e.target.checked)next[s.id]="";else delete next[s.id];return next;})}/>Solicitar cambio en esta estructura</label>{Object.hasOwn(changes,s.id)&&<label>Descripción del cambio · Ítem {s.itemNumber} unidad {s.unitOrdinal}<textarea className="form-control" value={changes[s.id]} maxLength={4000} disabled={disabled} onChange={e=>setChanges({...changes,[s.id]:e.target.value})}/></label>}</>}
 </>}
 </article>;})}</div>
 {advisor&&round.canRespond&&<><label>Observaciones generales para Ingeniería (opcional)<textarea className="form-control" maxLength={4000} value={observations} disabled={disabled} onChange={e=>setObservations(e.target.value)}/></label>
 <button className="button-secondary" disabled={disabled||!Object.keys(changes).length||Object.values(changes).some(x=>!x.trim())} onClick={()=>ask(command("RequestChanges",{changes:Object.entries(changes).map(([structureId,description])=>({structureId,description})),observations}),"Se enviarán los cambios individuales a Ingeniería. Las estructuras no seleccionadas quedarán confirmadas respecto al Acta presentada; se cerrará esta ronda y se registrará su tiempo de respuesta.")}>Solicitar cambios</button><button className="button-secondary" disabled>Detener proyecto</button></>}
 {(reviewer||advisor&&round.canRespond)&&<section className="stack"><h3>{reviewer?"Nueva versión corregida del Acta":"Acta firmada por el cliente"}</h3><p>{reviewer?"Declara las estructuras afectadas antes de cargar. No se reemplazará el PDF presentado.":"Carga el PDF firmado correspondiente al Acta presentada en esta ronda. Su nombre no demuestra una firma ni su correspondencia."}</p>
 <label>{reviewer?"Seleccionar Acta corregida PDF":"Seleccionar Acta firmada PDF"}<input className="form-control" type="file" ref={fileInput} accept=".pdf,application/pdf" disabled={disabled} onChange={e=>setFile(e.target.files?.[0])}/></label>
 {file&&<p>Seleccionado: {file.name} · Aún no cargado</p>}
 <button className="button-primary" disabled={disabled||!file||!file.name.toLowerCase().endsWith(".pdf")||file.size===0||file.size>25*1024*1024||reviewer&&!round.affectedDeclared} onClick={()=>file&&void run({roundId:round.id,file,kind:reviewer?"Revised":"Signed",key:crypto.randomUUID(),revision:round.revision,replaces:reviewer?round.revisedDocumentId:round.signedDocumentId})}>{reviewer?"Cargar Acta corregida":"Cargar Acta firmada"}</button>
 {reviewer?<button className="button-primary" disabled={disabled||!round.revisedDocumentId||!round.affectedDeclared||round.structures.some(r=>r.affected&&!r.reviewCompleted)} onClick={()=>ask(command("CloseReview",{documentId:round.revisedDocumentId!}),"Se congelará esta revisión y se enviará la nueva versión al asesor en otra ronda. Las estructuras declaradas afectadas volverán a esperar aprobación.")}>Finalizar revisión de Ingeniería</button>:<><label className={styles.check}><input type="checkbox" checked={attest} disabled={disabled||!round.signedDocumentId} onChange={e=>setAttest(e.target.checked)}/>Confirmo que el PDF cargado está firmado por el cliente y corresponde al Acta presentada en esta ronda</label><button className="button-primary" disabled={disabled||!attest||!round.signedDocumentId||approvalsDone!==round.structures.length||Object.keys(changes).length>0} onClick={()=>ask(command("Accept",{documentId:round.signedDocumentId!,attestSignedForPresentedVersion:true}),"Se registrará la aceptación definitiva y se congelarán las aprobaciones y documentos. Ingeniería recibirá Radicación de Vanos; esto no autoriza fabricación.")}>Aceptar Acta de Vanos</button></>}
 </section>}
 {confirmation&&<div role="dialog" aria-label="Confirmar operación del Acta"><p>{confirmation.text}</p><button className="button-primary" disabled={disabled} onClick={()=>void run(confirmation.operation)}>Confirmar operación</button><button className="button-secondary" disabled={busy} onClick={()=>setConfirmation(undefined)}>Cancelar</button></div>}
 <details><summary>Documentos e historial de la ronda</summary>{data.documents.filter(d=>d.roundId===round.id).map(d=><div key={d.document.id}><p>{d.kind==="Signed"?"Acta firmada":d.kind==="Revised"?"Acta corregida":"Acta de Ingeniería"} · Versión {d.version} · {d.document.originalFileName} · {formatDate(d.document.uploadedAt)} · {d.document.uploadedBy.name??"Responsable registrado"}</p><button className="button-secondary" disabled={busy} onClick={()=>void download(d.document.id,d.document.originalFileName)}>Descargar {d.document.originalFileName}</button><details><summary>SHA-256</summary><code>{d.sha256}</code></details></div>)}{data.history.filter(h=>h.roundId===round.id).map(h=><p key={h.revision}>{({Present:"Presentación confirmada",ConfirmStructure:"Aprobación individual",RequestChanges:"Cambios solicitados",DeclareAffected:"Declaración de estructuras afectadas",ReviewCheck:"Check de revisión",CloseReview:"Revisión finalizada",Accept:"Aceptación definitiva",UploadSigned:"Acta firmada cargada",UploadRevised:"Acta corregida cargada",InitializeHistorical:"Incorporación histórica"} as Record<string,string>)[h.action]??h.action} · {formatDate(h.at)} · {h.actorName??"Responsable registrado"}</p>)}</details>
 </section>;
}
