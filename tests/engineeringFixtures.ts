import type { EngineeringState } from "@/features/engineering/contracts";
import { user } from "./fixtures";
export const engineeringId="11111111-1111-4111-8111-111111111111";
export const engineeringDate="2026-11-05T15:00:00Z";
export const engineeringState:EngineeringState={
 projectId:engineeringId,checklistId:engineeringId,submissionId:engineeringId,taskId:engineeringId,taskStatus:"InProgress",
 responsibleSubject:user.subject,canModify:true,startedAt:engineeringDate,completedAt:null,revision:0,total:2,completed:0,pending:2,progress:0,
 structures:[1,2].map(n=>({revision:0,completed:false,changedAt:null,structure:{id:`22222222-2222-4222-8222-22222222222${n}`,itemId:engineeringId,unitOrdinal:n,unitCount:2,itemNumber:"V1",description:"Referencia original",location:"Sala",actualLocation:"Sala norte",width:2,height:2.4,actualWidth:2.001,actualHeight:2.4,actualSystemText:"Sistema en obra",measurementType:"Opening",installationObservations:"Observación radicada",createdAt:engineeringDate,measuredAt:engineeringDate,retiredAt:null,imageCatalogItemId:null,technical:{handleStatus:"Confirmed",handleHeightMm:1100,viewSide:"Outside",openingType:"HingedDoor",openingDirection:"Inward",openingHand:"Left",hasAlfajia:true,alfajiaMeasurementMm:80}}})),
 documents:[],currentDocumentId:null,history:[]
};
export const engineeringDoc={id:"33333333-3333-4333-8333-333333333333",originalFileName:"acta.pdf",contentType:"application/pdf",sizeBytes:256,uploadedAt:engineeringDate,uploadedBy:{name:"Ingeniero",email:null},uploadBatchId:engineeringId,isCurrent:true,replacedAt:null,replacedByDocumentId:null,inInitialHandoff:false};
