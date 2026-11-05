import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect,it,vi } from "vitest";
import { EngineeringPanel } from "@/features/engineering/EngineeringPanel";
import { parseEngineering } from "@/features/engineering/contracts";
import { mockBackend,renderOperational,deferred } from "./operationalFixtures";
import { user } from "./fixtures";
import { engineeringId as id,engineeringDate as date,engineeringState as ready,engineeringDoc as doc } from "./engineeringFixtures";
const engineer={...user,roles:["Engineering" as const]};
it("persists each physical check only after server acknowledgement and reloads in original order",async()=>{
 let state=structuredClone(ready);const gate=deferred<Response>();
 const fetch=mockBackend((_,init)=>{if(init.method==="PUT")return gate.promise;return state;});
 const view=renderOperational(<EngineeringPanel projectId={id} onRefresh={vi.fn()}/>,engineer);
 const checks=await screen.findAllByRole("checkbox");await userEvent.click(checks[0]);expect(checks[0]).not.toBeChecked();
 state={...state,revision:1,completed:1,pending:1,progress:50,structures:state.structures.map((r,n)=>n? r:{...r,revision:1,completed:true})};gate.resolve(new Response(null,{status:204}));
 await waitFor(()=>expect(screen.getAllByRole("checkbox")[0]).toBeChecked());
 expect(screen.getAllByText("2001 × 2400 mm")).toHaveLength(2);
 expect(fetch.mock.calls.filter(([,i])=>i.method==="PUT")).toHaveLength(1);
 view.unmount();renderOperational(<EngineeringPanel projectId={id} onRefresh={vi.fn()}/>,engineer);
 expect((await screen.findAllByRole("checkbox"))[0]).toBeChecked();expect(screen.getAllByRole("article")[0]).toHaveAccessibleName("Ítem V1 · Unidad 1/2");
});
it("rereads after uncertain failure and retries the same command key without changing another structure",async()=>{
 let state=structuredClone(ready);const bodies:unknown[]=[];
 mockBackend((_,init)=>{if(init.method==="PUT"){const body=JSON.parse(init.body as string);bodies.push(body);
 if(bodies.length===1)return Response.json({}, {status:503});
 state={...state,revision:1,completed:1,pending:1,progress:50,structures:state.structures.map((r,n)=>n?r:{...r,revision:1,completed:true})};return new Response(null,{status:204});}return state;});
 renderOperational(<EngineeringPanel projectId={id} onRefresh={vi.fn()}/>,engineer);
 await userEvent.click((await screen.findAllByRole("checkbox"))[0]);
 await userEvent.click(await screen.findByRole("button",{name:"Reintentar guardado seguro"}));
 await waitFor(()=>expect(screen.getAllByRole("checkbox")[0]).toBeChecked());
 expect(bodies[0]).toEqual(bodies[1]);expect(screen.getAllByRole("checkbox")[1]).not.toBeChecked();
});
it.each(["Management","Installation","CommercialAdvisor"] as const)("keeps %s read only even when server canModify is true",async role=>{
 mockBackend(()=>ready);renderOperational(<EngineeringPanel projectId={id} onRefresh={vi.fn()}/>,{...user,roles:[role],isManagement:role==="Management"});
 expect((await screen.findAllByRole("checkbox"))[0]).toBeDisabled();expect(screen.queryByLabelText("Seleccionar Acta PDF")).not.toBeInTheDocument();
});
it("requires upload and all checks before an explicit cancellable close, then freezes and persists",async()=>{
 let state={...structuredClone(ready),structures:ready.structures.map(r=>({...r,completed:true})),completed:2,pending:0,progress:100};
 let writes=0;
 mockBackend((_,init)=>{if(init.method==="POST"){writes++;if(init.body instanceof FormData){state={...state,revision:1,documents:[{document:doc,version:1,sha256:"A".repeat(64)}],currentDocumentId:doc.id};}else state={...state,revision:2,taskStatus:"Completed",canModify:false,completedAt:date};return new Response(null,{status:204});}return state;});
 const view=renderOperational(<EngineeringPanel projectId={id} onRefresh={vi.fn()}/>,engineer);
 expect(await screen.findByRole("button",{name:"Confirmar finalización de Ingeniería"})).toBeDisabled();
 await userEvent.upload(screen.getByLabelText("Seleccionar Acta PDF"),new File(["%PDF-test"],"acta.pdf",{type:"application/pdf"}));
 expect(screen.getByText(/Aún no cargado/)).toBeInTheDocument();expect(writes).toBe(0);
 await userEvent.click(screen.getByRole("button",{name:"Cargar Acta"}));
 await screen.findByText(/Versión 1 · Vigente/);
 await userEvent.click(screen.getByRole("button",{name:"Confirmar finalización de Ingeniería"}));
 await userEvent.click(screen.getByRole("button",{name:"Cancelar"}));expect(writes).toBe(1);
 await userEvent.click(screen.getByRole("button",{name:"Confirmar finalización de Ingeniería"}));
 await userEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Finalizar Ingeniería"}));
 await screen.findByText(/Completada · Solo lectura/);expect(screen.getAllByRole("checkbox")[0]).toBeDisabled();expect(writes).toBe(2);
 view.unmount();renderOperational(<EngineeringPanel projectId={id} onRefresh={vi.fn()}/>,engineer);await screen.findByText(/Completada · Solo lectura/);
 expect(screen.queryByRole("button",{name:"Cargar nueva versión del Acta"})).not.toBeInTheDocument();
});
it("rejects mixed project identities and duplicate units",()=>{
 expect(()=>parseEngineering(ready,"another-project")).toThrow();
 expect(()=>parseEngineering({...ready,structures:[ready.structures[0],ready.structures[0]]},id)).toThrow();
});
