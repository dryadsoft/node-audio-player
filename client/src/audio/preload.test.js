import { createPreloader, seconds, songUrl } from "./preload";
const frame = () => { const b = new Uint8Array(417); b.set([255,251,144,0]); return b; };
const mp3 = () => { const b = new Uint8Array(500000); for(let i=0;i+417<=b.length;i+=417)b.set(frame(),i); return b; };
const flush = async () => { for(let i=0;i<100;i++) await Promise.resolve(); };
describe("audio preparation", () => {
 let loader;
 beforeEach(() => {
   jest.useFakeTimers();
   Object.defineProperty(document, "hidden", {configurable:true,value:false});
   jest.spyOn(window, "fetch").mockImplementation(async (url, options) => {
     const [start,end] = options.headers.Range.slice(6).split("-").map(Number);
     const bytes = mp3().slice(start,end+1);
     let read = false;
     return {status:206,headers:new Headers({"content-range":`bytes ${start}-${start+bytes.length-1}/500000`,"content-type":"audio/mpeg","last-modified":"Mon, 02 May 2022 05:55:30 GMT"}),body:{getReader:()=>({read:async()=> read ? {done:true} : (read=true,{done:false,value:bytes}),cancel:async()=>{}})}};
   });
   loader=createPreloader();loader.start();
 });
 afterEach(()=>{loader.dispose();jest.restoreAllMocks();jest.useRealTimers();});
 it("parses complete frames and preserves path encoding",()=>{
   expect(seconds(frame())).toBeCloseTo(1152/44100);
   expect(songUrl("한국 음악/첫 곡.mp3")).toBe("/songs/"+encodeURIComponent("한국 음악")+"/"+encodeURIComponent("첫 곡.mp3"));
 });
 it("visits every track before extending any prefix",async()=>{
   loader.setTracks([{path:"a.mp3",available:true},{path:"b.mp3",available:true}]);
   jest.runOnlyPendingTimers();await flush();
   expect(fetch.mock.calls.slice(0,3).map(([u,o])=>[u,o.headers.Range])).toEqual([
     ["/songs/a.mp3","bytes=0-65535"],["/songs/b.mp3","bytes=0-65535"],["/songs/a.mp3","bytes=65536-131071"]
   ]);
 });
 it("aborts background work immediately on playback",async()=>{
   fetch.mockImplementation(()=>new Promise(()=>{}));
   loader.setTracks([{path:"a.mp3",available:true}]);jest.runOnlyPendingTimers();
   loader.select("fifth.mp3");
   expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
 });
 it("ignores stale results after switching playlists",async()=>{
   let resolve;
   fetch.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
   loader.setTracks([{path:"old.mp3",available:true}]);jest.runOnlyPendingTimers();
   loader.setTracks([{path:"new.mp3",available:true}]);
   resolve({status:404,headers:new Headers()});await flush();jest.runOnlyPendingTimers();await flush();
   expect(fetch.mock.calls.map(([u])=>u)).toContain("/songs/new.mp3");
   expect(loader.select("old.mp3")).toBeNull();
 });
});
