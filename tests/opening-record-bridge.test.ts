// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {forwardBackend} from "@/lib/api/backendBridge";
import {openingRecordMethod,isBackendPath} from "@/lib/api/backendPath";
import {token} from "./fixtures";
vi.mock("server-only",()=>({}));
beforeEach(()=>vi.stubEnv("SNG_API_BASE_URL","https://backend.example.test"));
const id="11111111-1111-4111-8111-111111111111";
const headers={Authorization:`Bearer ${token}`,"X-SnG-Active-Role":"CommercialAdvisor","Content-Type":"application/json"};
it.each([["GET",[]],["POST",["rounds",id,"commands"]],["POST",["rounds",id,"documents"]],["POST",["initialize-historical"]]] as const)("forwards only opening-record %s %j with active role",async(method,suffix)=>{
 vi.stubGlobal("fetch",vi.fn(async(_:URL,init:RequestInit)=>{expect(new Headers(init.headers).get("X-SnG-Active-Role")).toBe("CommercialAdvisor");return new Response(null,{status:204});}));
 expect((await forwardBackend(new Request("https://frontend.test",{method,headers}),["projects",id,"opening-records",...suffix])).status).toBe(204);
});
it.each([["stop"],["rounds",id,"stop"],["documents","..","download"],["rounds","wrong","commands"],["rounds",id,"commands","extra"]])("rejects unsupported or unsafe paths %j",(...suffix)=>{
 expect(isBackendPath(["projects",id,"opening-records",...suffix])).toBe(false);expect(openingRecordMethod(["projects",id,"opening-records",...suffix])).toBeNull();
});
it("requires authentication and preserves private PDF response headers",async()=>{
 const path=["projects",id,"opening-records","documents",id,"download"];
 const fetch=vi.fn(async()=>new Response("%PDF",{headers:{"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="acta.pdf"'}}));vi.stubGlobal("fetch",fetch);
 const response=await forwardBackend(new Request("https://frontend.test",{headers}),path);expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("no-store");expect(response.headers.get("Content-Disposition")).toContain("attachment");
 expect((await forwardBackend(new Request("https://frontend.test"),path)).status).toBe(401);expect((await forwardBackend(new Request("https://frontend.test",{method:"POST",headers}),path)).status).toBe(405);
 fetch.mockImplementation(async()=>new Response("html",{headers:{"Content-Type":"text/html"}}));expect((await forwardBackend(new Request("https://frontend.test",{headers}),path)).status).toBe(502);
});
it("preserves only the safe missing advisor code",async()=>{vi.stubGlobal("fetch",vi.fn(async()=>Response.json({code:"OpeningAdvisorNotConfigured",detail:"private"},{status:503})));const response=await forwardBackend(new Request("https://frontend.test",{method:"POST",headers}),["projects",id,"engineering","complete"]);const text=await response.text();expect(text).toContain("OpeningAdvisorNotConfigured");expect(text).not.toContain("private");});
