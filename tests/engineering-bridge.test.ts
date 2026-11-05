// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {forwardBackend} from "@/lib/api/backendBridge";
import {engineeringMethod,isBackendPath} from "@/lib/api/backendPath";
import {token} from "./fixtures";
vi.mock("server-only",()=>({}));
beforeEach(()=>vi.stubEnv("SNG_API_BASE_URL","https://backend.example.test"));
const id="11111111-1111-4111-8111-111111111111";
const headers={Authorization:`Bearer ${token}`,"X-SnG-Active-Role":"Engineering","Content-Type":"application/json"};
it.each([["GET",[]],["PUT",["structures",id,"check"]],["POST",["acta"]],["POST",["complete"]],["POST",["initialize-historical"]]] as const)("forwards scoped engineering %s %j",async(method,suffix)=>{
 const fetch=vi.fn(async(_:URL,init:RequestInit)=>{expect(new Headers(init.headers).get("X-SnG-Active-Role")).toBe("Engineering");return new Response(null,{status:204});});vi.stubGlobal("fetch",fetch);
 expect((await forwardBackend(new Request("https://frontend.test",{method,headers}),["projects",id,"engineering",...suffix])).status).toBe(204);
});
it.each([["structures",id,"edit"],["acta","..","download"],["complete","extra"],["initialize"]])("rejects unknown routes %j",(...suffix)=>{
 expect(isBackendPath(["projects",id,"engineering",...suffix])).toBe(false);expect(engineeringMethod(["projects",id,"engineering",...suffix])).toBeNull();
});
it("keeps PDF attachments private and rejects unsafe content and names",async()=>{
 const path=["projects",id,"engineering","acta",id,"download"];
 const fetch=vi.fn(async()=>new Response("%PDF",{headers:{"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="acta.pdf"'}}));vi.stubGlobal("fetch",fetch);
 const response=await forwardBackend(new Request("https://frontend.test",{headers}),path);
 expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("no-store");expect(response.headers.get("Content-Disposition")).toContain("attachment");expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
 expect((await forwardBackend(new Request("https://frontend.test"),path)).status).toBe(401);
 expect((await forwardBackend(new Request("https://frontend.test",{method:"PUT",headers}),path)).status).toBe(405);
 fetch.mockImplementation(async()=>new Response("html",{headers:{"Content-Type":"text/html","Content-Disposition":'attachment; filename="acta.pdf"'}}));
 expect((await forwardBackend(new Request("https://frontend.test",{headers}),path)).status).toBe(502);
});
it("preserves actionable missing Engineering configuration without secrets",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({code:"EngineeringAssigneeNotConfigured",detail:"secret"},{status:503})));
 const result=await forwardBackend(new Request("https://frontend.test",{method:"POST",headers}),["projects",id,"measurements","commands"]);
 expect(await result.json()).toMatchObject({extensions:{code:"EngineeringAssigneeNotConfigured"}});
});
