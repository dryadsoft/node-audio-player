import { ReadableStream } from "stream/web";
import { audioStream } from "./stream";
describe("audio prefix streaming",()=>{
 const originalStream=global.ReadableStream, originalResponse=global.Response, originalChannel=global.MessageChannel;
 beforeEach(()=>{
  global.ReadableStream=ReadableStream;
  global.Response=class {constructor(body,options){this.body=body;Object.assign(this,options);}};
  global.MessageChannel=class {constructor(){this.port1={close:jest.fn()};this.port2={send:data=>this.port1.onmessage({data})};}};
  self.clients={get:async()=>({postMessage:(_,ports)=>ports[0].send({bytes:new Uint8Array([1,2,3]),total:5,modified:"date"})})};
  jest.spyOn(window,"fetch").mockResolvedValue({status:206,headers:new Headers({"last-modified":"date","content-range":"bytes 3-4/5"}),body:new ReadableStream({start(c){c.enqueue(new Uint8Array([4,5]));c.close();}})});
 });
 afterEach(()=>{global.ReadableStream=originalStream;global.Response=originalResponse;global.MessageChannel=originalChannel;delete self.clients;jest.restoreAllMocks();});
 it("joins cached prefix and network suffix without duplicate bytes",async()=>{
  const response=await audioStream({request:{url:"https://example.test/songs/a.mp3?nmpAudio=1",headers:new Headers({Range:"bytes=0-"})},event:{clientId:"test"}});
  expect(response.status).toBe(206);
  const reader=response.body.getReader(), bytes=[];
  for(;;){const part=await reader.read();if(part.done)break;bytes.push(...part.value);}
  expect(bytes).toEqual([1,2,3,4,5]);
  expect(fetch.mock.calls[0][1].headers.Range).toBe("bytes=3-4");
 });
 it("serves a bounded prefix request without network",async()=>{
  const response=await audioStream({request:{url:"https://example.test/songs/a.mp3?nmpAudio=1",headers:new Headers({Range:"bytes=0-1"})},event:{clientId:"test"}});
  const reader=response.body.getReader();
  expect(Array.from((await reader.read()).value)).toEqual([1,2]);
  expect((await reader.read()).done).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
 });
});
