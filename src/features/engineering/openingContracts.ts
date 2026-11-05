import type { Structure } from "@/features/measurements/contracts";
import type { ProjectDocument } from "@/features/documents/types";
import { ApiError } from "@/lib/api/apiError";
export type Approval="AwaitingApproval"|"Confirmed"|"ChangeRequested";
export type RoundStatus="Ready"|"Presented"|"ChangesRequested"|"Revised"|"Accepted";
export interface OpeningRow{structureId:string;approval:Approval;approvalDocumentId:string|null;carriedApproval:boolean;changeDescription:string|null;affected:boolean;reviewCompleted:boolean;revision:number}
export interface OpeningRound{id:string;number:number;status:RoundStatus;revision:number;presentationTaskId:string;reviewTaskId:string|null;filingTaskId:string|null;presentedDocumentId:string;revisedDocumentId:string|null;signedDocumentId:string|null;receivedAt:string;presentedAt:string|null;respondedAt:string|null;responseSeconds:number|null;generalObservations:string|null;affectedDeclared:boolean;canPresent:boolean;canRespond:boolean;canReview:boolean;structures:OpeningRow[]}
export interface OpeningDocument{roundId:string;kind:"Original"|"Revised"|"Signed";version:number;sha256:string;document:ProjectDocument;affectedStructureIds:string[]}
export interface OpeningState{projectId:string;submissionId:string;serverNow:string;structures:Structure[];rounds:OpeningRound[];documents:OpeningDocument[];history:{roundId:string;action:string;at:string;actorName:string|null;revision:number}[]}
export type OpeningAction="Present"|"ConfirmStructure"|"RequestChanges"|"DeclareAffected"|"ReviewCheck"|"CloseReview"|"Accept";
export interface OpeningCommand{requestKey:string;expectedRevision:number;action:OpeningAction;structureId?:string;value?:boolean;changes?:{structureId:string;description:string}[];observations?:string;affectedStructureIds?:string[];documentId?:string;attestSignedForPresentedVersion?:boolean}
export function parseOpeningState(value:unknown,projectId:string):OpeningState {
 const fail=():never=>{throw new ApiError(502);};
 if(!value||typeof value!=="object"||Array.isArray(value))return fail();const s=value as OpeningState;
 const date=(v:unknown)=>typeof v==="string"&&/(Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
 const id=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
 const count=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
 if(s.projectId!==projectId||!id(s.submissionId)||!date(s.serverNow)||!Array.isArray(s.structures)||!Array.isArray(s.rounds)||!Array.isArray(s.documents)||!Array.isArray(s.history)||!s.rounds.length)return fail();
 const ids=s.structures.map(x=>x?.id);if(ids.some(x=>!id(x))||new Set(ids).size!==ids.length||s.structures.some(x=>x.retiredAt!==null))return fail();
 if(new Set(s.rounds.map(r=>r?.id)).size!==s.rounds.length)return fail();
 for(const [i,r] of s.rounds.entries()){
  if(!r||!id(r.id)||r.number!==i+1||!count(r.revision)||!["Ready","Presented","ChangesRequested","Revised","Accepted"].includes(r.status)||!id(r.presentationTaskId)||!id(r.presentedDocumentId)||![r.canPresent,r.canRespond,r.canReview,r.affectedDeclared].every(x=>typeof x==="boolean")||!date(r.receivedAt)||[r.presentedAt,r.respondedAt].some(x=>x!==null&&!date(x))||[r.reviewTaskId,r.filingTaskId,r.revisedDocumentId,r.signedDocumentId].some(x=>x!==null&&!id(x))||!Array.isArray(r.structures)||r.structures.length!==ids.length||r.responseSeconds!==null&&(typeof r.responseSeconds!=="number"||!Number.isFinite(r.responseSeconds)||r.responseSeconds<0))return fail();
  if(r.structures.some((x,n)=>!x||x.structureId!==ids[n]||!["AwaitingApproval","Confirmed","ChangeRequested"].includes(x.approval)||!count(x.revision)||![x.carriedApproval,x.affected,x.reviewCompleted].every(v=>typeof v==="boolean")||x.approvalDocumentId!==null&&!id(x.approvalDocumentId)))return fail();
  if(r.status==="Ready"&&(r.presentedAt!==null||r.responseSeconds!==null)||r.status!=="Ready"&&!r.presentedAt||r.status==="Accepted"&&(!r.signedDocumentId||!r.filingTaskId||r.structures.some(x=>x.approval!=="Confirmed")))return fail();
 }
 if(new Set(s.documents.map(d=>d?.document?.id)).size!==s.documents.length)return fail();
 for(const d of s.documents)if(!d?.document||!id(d.document.id)||!s.rounds.some(r=>r.id===d.roundId)||!["Original","Revised","Signed"].includes(d.kind)||!count(d.version)||d.version<1||!Array.isArray(d.affectedStructureIds)||d.affectedStructureIds.some(x=>!ids.includes(x))||!/^[A-F0-9]{64}$/.test(d.sha256)||typeof d.document.originalFileName!=="string"||!d.document.uploadedBy)return fail();
 if(s.rounds.some(r=>[r.presentedDocumentId,r.revisedDocumentId,r.signedDocumentId].some(x=>x!==null&&!s.documents.some(d=>d.document.id===x))))return fail();
 if(s.history.some(h=>!h||!s.rounds.some(r=>r.id===h.roundId)||typeof h.action!=="string"||!date(h.at)||!count(h.revision)))return fail();
 return s;
}
