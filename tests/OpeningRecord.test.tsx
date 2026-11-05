import {screen,within,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {it,expect,vi} from "vitest";
import {OpeningRecordPanel} from "@/features/engineering/OpeningRecordPanel";
import {parseOpeningState} from "@/features/engineering/openingContracts";
import {mockBackend,renderOperational,deferred} from "./operationalFixtures";
import {user} from "./fixtures";
import {openingState as ready} from "./openingRecordFixtures";
import {engineeringId as id,engineeringDate as date,engineeringDoc as doc} from "./engineeringFixtures";
const presented=()=>{const s=structuredClone(ready);Object.assign(s.rounds[0],{status:"Presented",canPresent:false,canRespond:true,presentedAt:date,responseSeconds:0});return s;};
it("starts timing only after an explicit confirmed presentation; cancellation sends nothing and Stop stays disabled",async()=>{
 let state=structuredClone(ready);const writes:unknown[]=[];mockBackend((_,init)=>{if(init.method==="POST"){writes.push(JSON.parse(init.body as string));state=presented();return new Response(null,{status:204});}return state;});
 renderOperational(<OpeningRecordPanel projectId={id} onRefresh={vi.fn()}/>);
 expect(await screen.findByText(/Tiempo de respuesta: aún no inicia/)).toBeInTheDocument();
 await userEvent.click(screen.getByRole("button",{name:"Confirmar presentación al cliente"}));await userEvent.click(screen.getByRole("button",{name:"Cancelar"}));expect(writes).toHaveLength(0);
 await userEvent.click(screen.getByRole("button",{name:"Confirmar presentación al cliente"}));await userEvent.click(screen.getByRole("button",{name:"Confirmar operación"}));
 expect(await screen.findByText(/Tiempo de respuesta: 0 d/)).toBeInTheDocument();expect(screen.getByRole("button",{name:"Detener proyecto"})).toBeDisabled();expect(writes).toHaveLength(1);
});
it("checks persist only after acknowledgement, survive reload, and reuse the request key after uncertainty",async()=>{
 const state=presented();const gate=deferred<Response>();const bodies:unknown[]=[];
 mockBackend((_,init)=>{if(init.method==="POST"){bodies.push(JSON.parse(init.body as string));if(bodies.length===1)return gate.promise;state.rounds[0].structures[0].approval="Confirmed";state.rounds[0].structures[0].approvalDocumentId=doc.id;return new Response(null,{status:204});}return state;});
 const view=renderOperational(<OpeningRecordPanel projectId={id} onRefresh={vi.fn()}/>);
 const check=(await screen.findAllByLabelText("Estructura confirmada por el cliente"))[0];await userEvent.click(check);expect(check).not.toBeChecked();gate.resolve(Response.json({}, {status:503}));
 await userEvent.click(await screen.findByRole("button",{name:"Reintentar guardado seguro"}));await waitFor(()=>expect(screen.getAllByLabelText("Estructura confirmada por el cliente")[0]).toBeChecked());expect(bodies[0]).toEqual(bodies[1]);
 view.unmount();renderOperational(<OpeningRecordPanel projectId={id} onRefresh={vi.fn()}/>);expect((await screen.findAllByLabelText("Estructura confirmada por el cliente"))[0]).toBeChecked();
});
it("requires individual change descriptions and confirms nonselected structures only with the formal response",async()=>{
 const state=presented();const writes:Record<string,unknown>[]=[];mockBackend((_,init)=>{if(init.method==="POST"){const c=JSON.parse(init.body as string);writes.push(c);Object.assign(state.rounds[0],{status:"ChangesRequested",canRespond:false,respondedAt:date,responseSeconds:10,reviewTaskId:id});state.rounds[0].structures[0].approval="ChangeRequested";state.rounds[0].structures[0].changeDescription="Cambiar apertura";state.rounds[0].structures[0].affected=true;state.rounds[0].structures[1].approval="Confirmed";state.rounds[0].structures[1].approvalDocumentId=doc.id;return new Response(null,{status:204});}return state;});
 renderOperational(<OpeningRecordPanel projectId={id} onRefresh={vi.fn()}/>);
 await userEvent.click((await screen.findAllByLabelText("Solicitar cambio en esta estructura"))[0]);expect(screen.getByRole("button",{name:"Solicitar cambios"})).toBeDisabled();
 await userEvent.type(screen.getByLabelText(/Descripción del cambio/),"Cambiar apertura");await userEvent.type(screen.getByLabelText(/Observaciones generales/),"Revisar plano");
 await userEvent.click(screen.getByRole("button",{name:"Solicitar cambios"}));expect(writes).toHaveLength(0);expect(screen.getByRole("dialog")).toHaveTextContent("no seleccionadas quedarán confirmadas");await userEvent.click(screen.getByRole("button",{name:"Confirmar operación"}));
 await screen.findByText("Guardado confirmado por el servidor.");expect(writes[0]).toMatchObject({action:"RequestChanges",changes:[{structureId:state.structures[0].id,description:"Cambiar apertura"}],observations:"Revisar plano"});
});
it("requires persisted signed PDF, all approvals and advisor attestation before final acceptance",async()=>{
 const state=presented();state.rounds[0].structures.forEach(r=>{r.approval="Confirmed";r.approvalDocumentId=doc.id;});let writes=0;
 mockBackend((_,init)=>{if(init.method==="POST"){writes++;if(init.body instanceof FormData){const signed={...doc,id:"44444444-4444-4444-8444-444444444444",originalFileName:"firmada.pdf"};state.documents.push({roundId:id,kind:"Signed",version:1,sha256:"B".repeat(64),document:signed,affectedStructureIds:[]});state.rounds[0].signedDocumentId=signed.id;}else{Object.assign(state.rounds[0],{status:"Accepted",canRespond:false,respondedAt:date,responseSeconds:60,filingTaskId:id});}return new Response(null,{status:204});}return state;});
 renderOperational(<OpeningRecordPanel projectId={id} onRefresh={vi.fn()}/>);
 expect(await screen.findByRole("button",{name:"Aceptar Acta de Vanos"})).toBeDisabled();await userEvent.upload(screen.getByLabelText("Seleccionar Acta firmada PDF"),new File(["%PDF"],"firmada.pdf",{type:"application/pdf"}));expect(writes).toBe(0);expect(screen.getByText(/Aún no cargado/)).toBeInTheDocument();
 await userEvent.click(screen.getByRole("button",{name:"Cargar Acta firmada"}));await waitFor(()=>expect(screen.getByLabelText(/Confirmo que el PDF cargado/)).toBeEnabled());expect(screen.getByRole("button",{name:"Aceptar Acta de Vanos"})).toBeDisabled();
 await userEvent.click(screen.getByLabelText(/Confirmo que el PDF cargado/));await userEvent.click(screen.getByRole("button",{name:"Aceptar Acta de Vanos"}));expect(screen.getByRole("dialog")).toHaveTextContent("no autoriza fabricación");await userEvent.click(screen.getByRole("button",{name:"Confirmar operación"}));
 await screen.findByRole("heading",{name:/Aceptada · Radicación de Vanos pendiente/});expect(writes).toBe(2);expect(screen.queryByRole("button",{name:"Aceptar Acta de Vanos"})).not.toBeInTheDocument();
});
it("Engineering reviews only observed structures and must explicitly declare additional affected ones",async()=>{
 const state=presented();Object.assign(state.rounds[0],{status:"ChangesRequested",respondedAt:date,responseSeconds:100,canRespond:false,canReview:true,reviewTaskId:id});Object.assign(state.rounds[0].structures[0],{approval:"ChangeRequested",affected:true,changeDescription:"Apertura"});Object.assign(state.rounds[0].structures[1],{approval:"Confirmed",approvalDocumentId:doc.id});
 mockBackend(()=>state);renderOperational(<OpeningRecordPanel projectId={id} onRefresh={vi.fn()}/>,{...user,roles:["Engineering"]});
 await screen.findByRole("heading",{name:/Ingeniería · Revisar cambios/});expect(screen.getAllByRole("article")).toHaveLength(1);expect(screen.getByRole("button",{name:"Finalizar revisión de Ingeniería"})).toBeDisabled();
 await userEvent.click(screen.getByText("Declarar estructuras afectadas por la nueva versión"));const details=screen.getByText("Declarar estructuras afectadas por la nueva versión").parentElement!;expect(within(details).getAllByRole("checkbox")).toHaveLength(2);expect(within(details).getAllByRole("checkbox")[0]).toBeDisabled();
});
it.each(["Management","Installation","CommercialHead"] as const)("keeps %s read only",async role=>{mockBackend(()=>presented());renderOperational(<OpeningRecordPanel projectId={id} onRefresh={vi.fn()}/>,{...user,roles:[role],isManagement:role==="Management"});await screen.findByRole("heading",{name:/Presentación del Acta/});expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Aceptar Acta de Vanos"})).not.toBeInTheDocument();});
it("rejects mixed projects, repeated units, changed order and missing document references",()=>{
 expect(()=>parseOpeningState(ready,"other")).toThrow();const bad=structuredClone(ready);bad.rounds[0].structures.reverse();expect(()=>parseOpeningState(bad,id)).toThrow();expect(()=>parseOpeningState({...ready,documents:[]},id)).toThrow();
});
